import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { uuidv7 } from 'uuidv7'
import { eq, and, lt } from 'drizzle-orm'
import { Resend } from 'resend'
import { getDb } from '../db/index.js'
import { users, auth_codes, refresh_tokens } from '../db/schema.js'
import {
  generateCode, hashCode, generateRefreshToken, hashRefreshToken,
  createAccessToken, refreshTokenExpiry, codeExpiry,
} from '../services/auth.js'

// ponytail: in-process rate limit; fine for single-instance; add Redis if horizontal scale
type RateBucket = { count: number; windowStart: number }
const requestLimits = new Map<string, RateBucket>()
const verifyLimits = new Map<string, RateBucket>()
const RATE_WINDOW_MS = 15 * 60 * 1000

// ponytail: test-only reset so rate limit state doesn't leak between tests
export function _testResetRateLimit() { requestLimits.clear(); verifyLimits.clear() }

function isRateLimited(map: Map<string, RateBucket>, ip: string, max: number): boolean {
  const now = Date.now()
  const entry = map.get(ip) ?? { count: 0, windowStart: now }
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    map.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  map.set(ip, entry)
  return entry.count > max
}

function clientIp(req: { header: (name: string) => string | undefined }): string {
  // X-Forwarded-For can be comma-separated (proxy chain); take first to prevent header-append spoofing
  return req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    ?? req.header('CF-Connecting-IP')
    ?? 'unknown'
}

// Lazy singleton - deferred so vi.mock('resend') in tests replaces the class before first instantiation
let _resend: Resend | null = null
function getResend() {
  return (_resend ??= new Resend(process.env['RESEND_API_KEY']))
}

const MAX_CODE_ATTEMPTS = 5

export function authRouter() {
  const app = new OpenAPIHono()

  // POST /auth/request
  app.openapi(createRoute({
    method: 'post',
    path: '/request',
    request: {
      body: {
        content: { 'application/json': { schema: z.object({ email: z.string().email() }) } },
      },
    },
    responses: {
      200: { content: { 'application/json': { schema: z.object({ message: z.string() }) } }, description: 'Code sent' },
      429: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Rate limited' },
    },
  }), async (c) => {
    const ip = clientIp(c.req)
    if (isRateLimited(requestLimits, ip, 5)) return c.json({ error: 'Too many requests' }, 429)

    const db = getDb()
    const { email } = c.req.valid('json')

    // Upsert user
    let user = db.select().from(users).where(eq(users.email, email)).all()[0]
    if (!user) {
      const id = uuidv7()
      db.insert(users).values({ id, email }).run()
      user = db.select().from(users).where(eq(users.id, id)).all()[0]!
    }

    const code = generateCode()
    const codeId = uuidv7()
    db.insert(auth_codes).values({
      id: codeId,
      user_id: user.id,
      code_hash: hashCode(code),
      expires_at: codeExpiry(),
    }).run()

    // Minor sweep: clean up expired codes to prevent accumulation
    db.delete(auth_codes).where(lt(auth_codes.expires_at, new Date().toISOString())).run()

    await getResend().emails.send({
      from: 'StashBro <noreply@stashbro.app>',
      to: email,
      subject: `Your StashBro code: ${code}`,
      html: `<p>Your sign-in code is: <strong style="font-size:24px;letter-spacing:4px;">${code}</strong></p><p>Expires in 10 minutes.</p>`,
    })

    return c.json({ message: 'Code sent to your email' }, 200)
  })

  // POST /auth/verify
  app.openapi(createRoute({
    method: 'post',
    path: '/verify',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              email: z.string().email(),
              code: z.string().length(6),
              deviceId: z.string().min(1),
            }),
          },
        },
      },
    },
    responses: {
      200: { content: { 'application/json': { schema: z.object({ accessToken: z.string(), refreshToken: z.string() }) } }, description: 'Tokens' },
      401: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Invalid code' },
      429: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Rate limited' },
    },
  }), async (c) => {
    const ip = clientIp(c.req)
    if (isRateLimited(verifyLimits, ip, 10)) return c.json({ error: 'Too many requests' }, 429)

    const db = getDb()
    const { email, code, deviceId } = c.req.valid('json')
    const now = new Date().toISOString()

    // Constant-time path: always query auth_codes even for unknown email
    // (unknown email -> userId '' -> zero rows returned, same DB cost as wrong code)
    const user = db.select().from(users).where(eq(users.email, email)).all()[0]
    const userId = user?.id ?? ''

    // Find all valid codes (unused, unexpired, not locked by too many attempts)
    const validCodes = db.select().from(auth_codes)
      .where(and(eq(auth_codes.user_id, userId), eq(auth_codes.used, 0)))
      .all()
      .filter(row => row.expires_at > now && row.attempts < MAX_CODE_ATTEMPTS)

    const matchingCode = validCodes.find(row => row.code_hash === hashCode(code))

    if (!user || !matchingCode) {
      // Wrong code: increment attempts on latest valid code to burn brute-force budget
      const latest = validCodes[validCodes.length - 1]
      if (latest) {
        db.update(auth_codes)
          .set({ attempts: latest.attempts + 1 })
          .where(eq(auth_codes.id, latest.id))
          .run()
      }
      return c.json({ error: 'Invalid or expired code' }, 401)
    }

    // Mark code used before issuing tokens (prevent TOCTOU reuse on retry)
    db.update(auth_codes).set({ used: 1 }).where(eq(auth_codes.id, matchingCode.id)).run()

    const refreshToken = generateRefreshToken()
    const rtId = uuidv7()
    // One refresh token per (user, device) - rotate on re-auth
    db.insert(refresh_tokens).values({
      id: rtId,
      user_id: user.id,
      device_id: deviceId,
      token_hash: hashRefreshToken(refreshToken),
      expires_at: refreshTokenExpiry(),
    }).onConflictDoUpdate({
      target: [refresh_tokens.user_id, refresh_tokens.device_id],
      set: {
        id: rtId,
        token_hash: hashRefreshToken(refreshToken),
        expires_at: refreshTokenExpiry(),
      },
    }).run()

    const accessToken = await createAccessToken(user.id)
    return c.json({ accessToken, refreshToken }, 200)
  })

  // POST /auth/refresh
  app.openapi(createRoute({
    method: 'post',
    path: '/refresh',
    request: {
      body: {
        content: { 'application/json': { schema: z.object({ refreshToken: z.string() }) } },
      },
    },
    responses: {
      200: { content: { 'application/json': { schema: z.object({ accessToken: z.string() }) } }, description: 'New access token' },
      401: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Invalid token' },
    },
  }), async (c) => {
    const db = getDb()
    const { refreshToken } = c.req.valid('json')
    const now = new Date().toISOString()

    const rt = db.select().from(refresh_tokens)
      .where(eq(refresh_tokens.token_hash, hashRefreshToken(refreshToken)))
      .all()
      .find(t => t.expires_at > now)

    if (!rt) return c.json({ error: 'Invalid or expired refresh token' }, 401)

    const accessToken = await createAccessToken(rt.user_id)
    return c.json({ accessToken }, 200)
  })

  return app
}
