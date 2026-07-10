import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clearDbCache } from '../db/index.js'
import { createApp } from '../app.js'
import { hashCode, hashRefreshToken, createAccessToken } from '../services/auth.js'
import { _testResetRateLimit } from './auth.js'

process.env['AUTH_MODE'] = 'magic-link'
process.env['DB_PATH'] = ':memory:'
process.env['JWT_SECRET'] = 'test-secret-min-32-chars-xxxxxxxxx'
process.env['RESEND_API_KEY'] = 're_test'

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: vi.fn(async () => ({ data: { id: 'mock-id' }, error: null })) }
  },
}))

beforeEach(() => {
  clearDbCache()
  _testResetRateLimit()
})

async function requestCode(app: ReturnType<typeof createApp>, email: string, ip = '10.0.0.1') {
  return app.request('/auth/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ email }),
  })
}

// Set a known code hash in DB for deterministic verify tests
async function seedKnownCode(email: string, code: string) {
  const { getDb } = await import('../db/index.js')
  const { users, auth_codes } = await import('../db/schema.js')
  const { eq, and } = await import('drizzle-orm')
  const db = getDb()
  const user = db.select().from(users).where(eq(users.email, email)).all()[0]!
  const unused = db.select().from(auth_codes)
    .where(and(eq(auth_codes.user_id, user.id), eq(auth_codes.used, 0)))
    .all()
    .sort((a, b) => b.expires_at.localeCompare(a.expires_at))[0]!
  db.update(auth_codes).set({ code_hash: hashCode(code) }).where(eq(auth_codes.id, unused.id)).run()
}

describe('POST /auth/request', () => {
  it('returns 200 and message for valid email', async () => {
    const app = createApp()
    const res = await requestCode(app, 'alice@example.com')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toMatch(/code sent/i)
  })

  it('rejects invalid email format with 400', async () => {
    const app = createApp()
    const res = await app.request('/auth/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.1' },
      body: JSON.stringify({ email: 'not-an-email' }),
    })
    expect(res.status).toBe(400)
  })

  it('stores code as SHA-256 hash (not plaintext) in auth_codes', async () => {
    const app = createApp()
    await requestCode(app, 'hashcheck@example.com')
    const { getDb } = await import('../db/index.js')
    const { users, auth_codes } = await import('../db/schema.js')
    const { eq } = await import('drizzle-orm')
    const db = getDb()
    const user = db.select().from(users).where(eq(users.email, 'hashcheck@example.com')).all()[0]!
    const codes = db.select().from(auth_codes).where(eq(auth_codes.user_id, user.id)).all()
    expect(codes.length).toBe(1)
    // SHA-256 hex = 64 chars; NOT a 6-digit plaintext code
    expect(codes[0]!.code_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('upserts user - no duplicate row on second request', async () => {
    const app = createApp()
    await requestCode(app, 'upsert@example.com')
    await requestCode(app, 'upsert@example.com')
    const { getDb } = await import('../db/index.js')
    const { users } = await import('../db/schema.js')
    const { eq } = await import('drizzle-orm')
    const db = getDb()
    expect(db.select().from(users).where(eq(users.email, 'upsert@example.com')).all().length).toBe(1)
  })

  it('rate limits after 5 requests from same IP', async () => {
    const app = createApp()
    const ip = '99.0.0.1'
    for (let i = 0; i < 5; i++) {
      expect((await requestCode(app, 'spam@example.com', ip)).status).toBe(200)
    }
    const r6 = await requestCode(app, 'spam@example.com', ip)
    expect(r6.status).toBe(429)
    expect((await r6.json()).error).toBeDefined()
  })

  it('rate limits are per-IP (different IP still succeeds)', async () => {
    const app = createApp()
    for (let i = 0; i < 5; i++) await requestCode(app, 'a@example.com', '11.0.0.1')
    expect((await requestCode(app, 'b@example.com', '11.0.0.2')).status).toBe(200)
  })
})

describe('POST /auth/verify', () => {
  it('returns 401 for wrong code', async () => {
    const app = createApp()
    await requestCode(app, 'verify@example.com')
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'verify@example.com', code: '000000', deviceId: 'dev-1' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 for unknown email (no user enumeration leak)', async () => {
    const app = createApp()
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ghost@example.com', code: '123456', deviceId: 'dev-1' }),
    })
    expect(res.status).toBe(401)
    // Same error message as wrong code to prevent user enumeration
    expect((await res.json()).error).toMatch(/invalid/i)
  })

  it('returns 200 with accessToken + refreshToken for correct code', async () => {
    const app = createApp()
    await requestCode(app, 'good@example.com')
    await seedKnownCode('good@example.com', '777777')

    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'good@example.com', code: '777777', deviceId: 'dev-1' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accessToken).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
  })

  it('marks code as used and rejects reuse', async () => {
    const app = createApp()
    await requestCode(app, 'reuse@example.com')
    await seedKnownCode('reuse@example.com', '888888')

    const doVerify = () => app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reuse@example.com', code: '888888', deviceId: 'dev-1' }),
    })

    expect((await doVerify()).status).toBe(200)
    expect((await doVerify()).status).toBe(401)
  })

  it('rejects expired code', async () => {
    const app = createApp()
    await requestCode(app, 'expired@example.com')

    const { getDb } = await import('../db/index.js')
    const { users, auth_codes } = await import('../db/schema.js')
    const { eq } = await import('drizzle-orm')
    const db = getDb()
    const user = db.select().from(users).where(eq(users.email, 'expired@example.com')).all()[0]!
    const codeRow = db.select().from(auth_codes).where(eq(auth_codes.user_id, user.id)).all()[0]!
    db.update(auth_codes).set({
      code_hash: hashCode('999999'),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }).where(eq(auth_codes.id, codeRow.id)).run()

    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'expired@example.com', code: '999999', deviceId: 'dev-1' }),
    })
    expect(res.status).toBe(401)
  })

  it('locks code after 5 wrong attempts (brute-force protection)', async () => {
    const app = createApp()
    await requestCode(app, 'bf@example.com')
    await seedKnownCode('bf@example.com', '321321')

    const wrong = () => app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bf@example.com', code: '000000', deviceId: 'dev-1' }),
    })
    for (let i = 0; i < 5; i++) expect((await wrong()).status).toBe(401)

    // 6th attempt with the CORRECT code must also fail (code is locked)
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bf@example.com', code: '321321', deviceId: 'dev-1' }),
    })
    expect(res.status).toBe(401)
  })

  it('rate limits /auth/verify after 10 requests per IP', async () => {
    const app = createApp()
    const ip = '77.0.0.1'
    for (let i = 0; i < 10; i++) {
      await app.request('/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ email: 'ratelim@example.com', code: '000000', deviceId: 'dev-1' }),
      })
    }
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ email: 'ratelim@example.com', code: '000000', deviceId: 'dev-1' }),
    })
    expect(res.status).toBe(429)
  })

  it('rotates refresh token on re-auth from same device (one row per user+device)', async () => {
    const app = createApp()
    const email = 'rotate@example.com'

    async function doVerify(code: string) {
      await requestCode(app, email)
      await seedKnownCode(email, code)
      return app.request('/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, deviceId: 'dev-same' }),
      })
    }

    const r1 = await doVerify('111111')
    expect(r1.status).toBe(200)
    const { refreshToken: rt1 } = await r1.json()

    const r2 = await doVerify('222222')
    expect(r2.status).toBe(200)
    const { refreshToken: rt2 } = await r2.json()

    expect(rt1).not.toBe(rt2)

    // Only one row per (user, device)
    const { getDb } = await import('../db/index.js')
    const { refresh_tokens } = await import('../db/schema.js')
    const db = getDb()
    const rows = db.select().from(refresh_tokens).all()
    expect(rows.length).toBe(1)
    expect(rows[0]!.token_hash).toBe(hashRefreshToken(rt2))
  })
})

describe('POST /auth/refresh', () => {
  it('returns 401 for invalid refresh token', async () => {
    const app = createApp()
    const res = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'bogus-token' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns new accessToken for valid refresh token', async () => {
    const app = createApp()
    await requestCode(app, 'ref@example.com')
    await seedKnownCode('ref@example.com', '444444')

    const vRes = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ref@example.com', code: '444444', deviceId: 'dev-r' }),
    })
    const { refreshToken } = await vRes.json()

    const rRes = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    expect(rRes.status).toBe(200)
    expect((await rRes.json()).accessToken).toBeTruthy()
  })

  it('rejects expired refresh token', async () => {
    const app = createApp()
    await requestCode(app, 'exprt@example.com')
    await seedKnownCode('exprt@example.com', '555555')

    const vRes = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'exprt@example.com', code: '555555', deviceId: 'dev-exp' }),
    })
    const { refreshToken } = await vRes.json()

    const { getDb } = await import('../db/index.js')
    const { refresh_tokens } = await import('../db/schema.js')
    const { eq } = await import('drizzle-orm')
    const db = getDb()
    db.update(refresh_tokens)
      .set({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .where(eq(refresh_tokens.token_hash, hashRefreshToken(refreshToken)))
      .run()

    const rRes = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    expect(rRes.status).toBe(401)
  })

  it('rejects revoked refresh token (row deleted)', async () => {
    const app = createApp()
    await requestCode(app, 'revoke@example.com')
    await seedKnownCode('revoke@example.com', '666666')

    const vRes = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'revoke@example.com', code: '666666', deviceId: 'dev-rev' }),
    })
    const { refreshToken } = await vRes.json()

    const { getDb } = await import('../db/index.js')
    const { refresh_tokens } = await import('../db/schema.js')
    const { eq } = await import('drizzle-orm')
    const db = getDb()
    db.delete(refresh_tokens)
      .where(eq(refresh_tokens.token_hash, hashRefreshToken(refreshToken)))
      .run()

    const rRes = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    expect(rRes.status).toBe(401)
  })
})

describe('authMiddleware (magic-link mode) via /items', () => {
  it('rejects request with no Authorization header', async () => {
    const app = createApp()
    expect((await app.request('/items', { method: 'GET' })).status).toBe(401)
  })

  it('accepts request with valid JWT access token', async () => {
    const app = createApp()
    const accessToken = await createAccessToken('test-user-id')
    const { getDb } = await import('../db/index.js')
    const { users } = await import('../db/schema.js')
    getDb().insert(users).values({ id: 'test-user-id', email: 'jwt@example.com' }).run()
    const res = await app.request('/items', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res.status).toBe(200)
  })

  it('rejects invalid JWT', async () => {
    const app = createApp()
    const res = await app.request('/items', {
      method: 'GET',
      headers: { Authorization: 'Bearer invalid.jwt.token' },
    })
    expect(res.status).toBe(401)
  })
})
