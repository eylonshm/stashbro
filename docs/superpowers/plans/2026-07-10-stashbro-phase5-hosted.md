# StashBro Phase 5 - Hosted Mode + CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add magic-link auth (email code via Resend, per-device refresh tokens, short-lived access tokens), per-user data isolation, Fly.io deployment, client signup flows, GitHub Actions CI (test + Docker build), and self-host documentation.

**Architecture:** `AUTH_MODE=magic-link` activates the new auth path in the existing `authMiddleware` stub (Phase 1 Task 7). Magic-link flow: POST /auth/request (send 6-digit code via Resend), POST /auth/verify (code → refresh token stored in DB + short-lived access JWT). Access tokens validated on every request. Per-user isolation is already in the data model (user_id column); Phase 5 adds the user creation and token validation that populate it. `AUTH_MODE=token` self-host path is unchanged.

**Tech Stack:** Resend (email), jose (JWT), Phase 1 server stack (Hono + Drizzle + better-sqlite3), Fly.io CLI, GitHub Actions

## Global Constraints

- Inherit all Phase 1 Global Constraints
- `AUTH_MODE=magic-link`: magic-link code expires in 10 minutes; access token TTL 15 minutes; refresh token TTL 30 days per device
- Rate limiting on auth endpoints: max 5 requests per 15-minute window per IP (in-process Map, no Redis required)
- Resend SDK (`resend` npm package) for email; `RESEND_API_KEY` env var
- JWT signing: HS256 with `JWT_SECRET` env var; use `jose` package (ESM-compatible)
- Self-host users continue using `AUTH_MODE=token` with no email infra required
- Fly.io: `fly.toml` in `apps/server/`, volume at `/data`, secrets via `fly secrets set`

---

### Task 1: Magic-Link Auth Endpoints

**Files:**
- Create: `apps/server/src/routes/auth.ts`
- Create: `apps/server/src/services/auth.ts`
- Modify: `apps/server/src/db/schema.ts` (add `auth_codes` and `refresh_tokens` tables to `getDb()`)
- Modify: `apps/server/src/app.ts` (register auth router)
- Test: `apps/server/src/routes/auth.test.ts`

**Interfaces:**
- Consumes: `getDb()` from Phase 1 Task 6; `users` table (already exists); Resend SDK; jose JWT
- Produces:
  - `POST /auth/request` body: `{ email: string }` - upserts user, stores 6-digit code (hashed), sends email; returns `{ message: "Code sent" }`; rate-limited 5 req/15min per IP
  - `POST /auth/verify` body: `{ email: string; code: string; deviceId: string }` - validates code, returns `{ accessToken: string; refreshToken: string }`
  - `POST /auth/refresh` body: `{ refreshToken: string }` - validates refresh token, returns new `{ accessToken: string }`
  - Access token payload: `{ sub: userId, exp: now+15min }`
  - `authService.createAccessToken(userId): string`
  - `authService.verifyAccessToken(token: string): string | null` (returns userId or null)
  - `authService.hashCode(code: string): string` (SHA-256 hex)

- [ ] **Step 1: Install dependencies**

```bash
cd apps/server && pnpm add resend jose
```

- [ ] **Step 2: Add auth tables to getDb() in db/index.ts**

```typescript
// Append to the db.run block in getDb() after existing CREATE TABLE statements:
db.run(sql`
  CREATE TABLE IF NOT EXISTS auth_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  )
`)
db.run(sql`CREATE INDEX IF NOT EXISTS auth_codes_user ON auth_codes(user_id)`)
db.run(sql`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    UNIQUE(user_id, device_id)
  )
`)
```

Also add these tables to `apps/server/src/db/schema.ts` as Drizzle table definitions:

```typescript
// Add to schema.ts
export const auth_codes = sqliteTable('auth_codes', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  code_hash: text('code_hash').notNull(),
  expires_at: text('expires_at').notNull(),
  used: integer('used').notNull().default(0),
})

export const refresh_tokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  device_id: text('device_id').notNull(),
  token_hash: text('token_hash').notNull(),
  expires_at: text('expires_at').notNull(),
}, (t) => ({
  uniqueUserDevice: uniqueIndex('rt_user_device').on(t.user_id, t.device_id),
}))
```

- [ ] **Step 3: Write failing test**

```typescript
// apps/server/src/routes/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from '../app.js'

process.env['AUTH_MODE'] = 'magic-link'
process.env['DB_PATH'] = ':memory:'
process.env['JWT_SECRET'] = 'test-secret-min-32-chars-xxxxxxxxx'
process.env['RESEND_API_KEY'] = 're_test'

// Mock Resend so no real emails sent
vi.mock('resend', () => ({
  Resend: class { emails = { send: vi.fn(async () => ({ id: 'mock-id' })) } },
}))

describe('POST /auth/request', () => {
  it('returns 200 for valid email', async () => {
    const app = createApp()
    const res = await app.request('/auth/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '1.2.3.4' },
      body: JSON.stringify({ email: 'test@example.com' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toContain('Code sent')
  })

  it('rate limits after 5 requests from same IP', async () => {
    const app = createApp()
    for (let i = 0; i < 5; i++) {
      await app.request('/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '2.3.4.5' },
        body: JSON.stringify({ email: 'spam@example.com' }),
      })
    }
    const res = await app.request('/auth/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '2.3.4.5' },
      body: JSON.stringify({ email: 'spam@example.com' }),
    })
    expect(res.status).toBe(429)
  })
})

describe('POST /auth/verify', () => {
  it('returns 401 for wrong code', async () => {
    const app = createApp()
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', code: '000000', deviceId: 'dev-1' }),
    })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd apps/server && pnpm test -- auth.test.ts
```

Expected: FAIL - routes not found

- [ ] **Step 5: Implement services/auth.ts**

```typescript
// apps/server/src/services/auth.ts
import { createHmac, createHash, randomInt } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env['JWT_SECRET'] ?? 'change-me-min-32-chars-for-production')
const ACCESS_TTL = 15 * 60 // 15 minutes in seconds
const REFRESH_TTL_DAYS = 30

export function generateCode(): string {
  return String(randomInt(100000, 999999))
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export function generateRefreshToken(): string {
  return createHmac('sha256', JWT_SECRET).update(String(Date.now()) + Math.random()).digest('hex')
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL}s`)
    .sign(JWT_SECRET)
}

export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload.sub ?? null
  } catch {
    return null
  }
}

export function refreshTokenExpiry(): string {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function codeExpiry(): string {
  return new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
}
```

- [ ] **Step 6: Implement routes/auth.ts**

```typescript
// apps/server/src/routes/auth.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { uuidv7 } from 'uuidv7'
import { eq, and } from 'drizzle-orm'
import { Resend } from 'resend'
import { getDb } from '../db/index.js'
import { users, auth_codes, refresh_tokens } from '../db/schema.js'
import {
  generateCode, hashCode, generateRefreshToken, hashRefreshToken,
  createAccessToken, verifyAccessToken, refreshTokenExpiry, codeExpiry,
} from '../services/auth.js'

// ponytail: in-process rate limit Map; fine for single-instance; add Redis if horizontal scale
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_WINDOW_MS = 15 * 60 * 1000
const RATE_MAX = 5

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip) ?? { count: 0, windowStart: now }
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now }); return false
  }
  entry.count++
  rateLimitMap.set(ip, entry)
  return entry.count > RATE_MAX
}

const resend = new Resend(process.env['RESEND_API_KEY'])

export function authRouter() {
  const app = new OpenAPIHono()

  // POST /auth/request
  app.openapi(createRoute({
    method: 'post', path: '/request',
    request: { body: { content: { 'application/json': { schema: z.object({ email: z.string().email() })}}}},
    responses: {
      200: { content: { 'application/json': { schema: z.object({ message: z.string() })}}, description: 'Code sent' },
      429: { content: { 'application/json': { schema: z.object({ error: z.string() })}}, description: 'Rate limited' },
    },
  }), async (c) => {
    const ip = c.req.header('X-Forwarded-For') ?? c.req.header('CF-Connecting-IP') ?? 'unknown'
    if (isRateLimited(ip)) return c.json({ error: 'Too many requests' }, 429)

    const db = getDb()
    const { email } = c.req.valid('json')

    // Upsert user
    let user = db.select().from(users).where(eq(users.email, email)).all()[0]
    if (!user) {
      const id = uuidv7()
      db.insert(users).values({ id, email }).run()
      user = { id, email }
    }

    const code = generateCode()
    const codeId = uuidv7()
    db.insert(auth_codes).values({
      id: codeId, user_id: user.id,
      code_hash: hashCode(code),
      expires_at: codeExpiry(),
    }).run()

    await resend.emails.send({
      from: 'StashBro <noreply@stashbro.app>',
      to: email,
      subject: `Your StashBro code: ${code}`,
      html: `<p>Your sign-in code is: <strong style="font-size:24px;letter-spacing:4px;">${code}</strong></p><p>Expires in 10 minutes.</p>`,
    })

    return c.json({ message: 'Code sent to your email' })
  })

  // POST /auth/verify
  app.openapi(createRoute({
    method: 'post', path: '/verify',
    request: { body: { content: { 'application/json': { schema: z.object({
      email: z.string().email(), code: z.string().length(6), deviceId: z.string(),
    })}}}},
    responses: {
      200: { content: { 'application/json': { schema: z.object({ accessToken: z.string(), refreshToken: z.string() })}}, description: 'Tokens' },
      401: { content: { 'application/json': { schema: z.object({ error: z.string() })}}, description: 'Invalid code' },
    },
  }), async (c) => {
    const db = getDb()
    const { email, code, deviceId } = c.req.valid('json')
    const now = new Date().toISOString()

    const user = db.select().from(users).where(eq(users.email, email)).all()[0]
    if (!user) return c.json({ error: 'Invalid code' }, 401)

    const authCode = db.select().from(auth_codes)
      .where(and(eq(auth_codes.user_id, user.id), eq(auth_codes.code_hash, hashCode(code)), eq(auth_codes.used, 0)))
      .all()
      .find(c => c.expires_at > now)

    if (!authCode) return c.json({ error: 'Invalid or expired code' }, 401)

    db.update(auth_codes).set({ used: 1 }).where(eq(auth_codes.id, authCode.id)).run()

    const refreshToken = generateRefreshToken()
    const rtId = uuidv7()
    db.insert(refresh_tokens).values({
      id: rtId, user_id: user.id, device_id: deviceId,
      token_hash: hashRefreshToken(refreshToken),
      expires_at: refreshTokenExpiry(),
    }).onConflictDoUpdate({ target: [refresh_tokens.user_id, refresh_tokens.device_id], set: {
      token_hash: hashRefreshToken(refreshToken), expires_at: refreshTokenExpiry(), id: rtId,
    }}).run()

    const accessToken = await createAccessToken(user.id)
    return c.json({ accessToken, refreshToken })
  })

  // POST /auth/refresh
  app.openapi(createRoute({
    method: 'post', path: '/refresh',
    request: { body: { content: { 'application/json': { schema: z.object({ refreshToken: z.string() })}}}},
    responses: {
      200: { content: { 'application/json': { schema: z.object({ accessToken: z.string() })}}, description: 'New access token' },
      401: { content: { 'application/json': { schema: z.object({ error: z.string() })}}, description: 'Invalid token' },
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
    return c.json({ accessToken })
  })

  return app
}
```

- [ ] **Step 7: Register auth router and update authMiddleware for magic-link**

In `apps/server/src/app.ts`, add `app.route('/auth', authRouter())`.

Update `apps/server/src/middleware/auth.ts` to replace the magic-link stub:

```typescript
// apps/server/src/middleware/auth.ts
import type { MiddlewareHandler } from 'hono'
import { verifyAccessToken } from '../services/auth.js'

export const authMiddleware: MiddlewareHandler<{ Variables: { userId: string } }> = async (c, next) => {
  const mode = process.env['AUTH_MODE'] ?? 'token'

  if (mode === 'token') {
    const expected = process.env['AUTH_TOKEN']
    if (!expected) return c.json({ error: 'AUTH_TOKEN not configured' }, 500)
    const header = c.req.header('Authorization')
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (token !== expected) return c.json({ error: 'Unauthorized' }, 401)
    c.set('userId', 'default')
    return next()
  }

  // magic-link mode: validate JWT access token
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  const userId = await verifyAccessToken(token)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  c.set('userId', userId)
  return next()
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd apps/server && pnpm test -- auth.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 9: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/routes/auth.ts apps/server/src/services/auth.ts apps/server/src/middleware/auth.ts apps/server/src/db/schema.ts apps/server/src/db/index.ts
git commit -m "feat(server): magic-link auth (6-digit code, JWT access tokens, refresh tokens, rate limiting)"
```

---

### Task 2: Per-User Data Isolation Tests

**Files:**
- Create: `apps/server/src/routes/isolation.test.ts`

**Interfaces:**
- Consumes: all Phase 1 endpoints; `AUTH_MODE=magic-link`; `createAccessToken()` from Task 1
- Produces: tests verifying user A cannot read user B's items, tags, or sync data

- [ ] **Step 1: Write isolation tests**

```typescript
// apps/server/src/routes/isolation.test.ts
import { describe, it, expect } from 'vitest'
import { createApp } from '../app.js'
import { createAccessToken } from '../services/auth.js'

process.env['AUTH_MODE'] = 'magic-link'
process.env['DB_PATH'] = ':memory:'
process.env['JWT_SECRET'] = 'test-secret-min-32-chars-xxxxxxxxx'

async function makeAuth(userId: string) {
  const token = await createAccessToken(userId)
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

describe('per-user data isolation', () => {
  it('user A items not visible to user B', async () => {
    const app = createApp()
    const authA = await makeAuth('user-a')
    const authB = await makeAuth('user-b')

    await app.request('/items', {
      method: 'POST', headers: authA,
      body: JSON.stringify({ url: 'https://usera.com/article' }),
    })

    const res = await app.request('/items', { headers: authB })
    const body = await res.json()
    expect(body.items.every((i: { url: string }) => !i.url.includes('usera.com'))).toBe(true)
  })

  it('user A sync/pull does not return user B changes', async () => {
    const app = createApp()
    const authA = await makeAuth('user-a')
    const authB = await makeAuth('user-b')

    await app.request('/sync/push', {
      method: 'POST', headers: authA,
      body: JSON.stringify({ changes: [{
        id: 'a-item-1', change_seq: 1, updated_at: new Date().toISOString(),
        deleted_at: null, url: 'https://usera.com', title: 'User A Item',
        description: null, thumbnail_url: null, favicon_url: null,
        domain: 'usera.com', type: 'article', status: 'unread',
        priority: 'medium', tag_names: [],
      }]}),
    })

    const res = await app.request('/sync/pull?cursor=0', { headers: authB })
    const body = await res.json()
    expect(body.changes.every((c: { url: string }) => !c.url.includes('usera.com'))).toBe(true)
  })

  it('user B cannot PATCH user A item', async () => {
    const app = createApp()
    const authA = await makeAuth('user-a')
    const authB = await makeAuth('user-b')

    const createRes = await app.request('/items', {
      method: 'POST', headers: authA,
      body: JSON.stringify({ url: 'https://usera.com/private' }),
    })
    const { id } = await createRes.json()

    const patchRes = await app.request(`/items/${id}`, {
      method: 'PATCH', headers: authB,
      body: JSON.stringify({ status: 'archived' }),
    })
    expect(patchRes.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run isolation tests**

```bash
cd apps/server && pnpm test -- isolation.test.ts
```

Expected: PASS (3 tests) - the `user_id` filter already in all queries handles isolation

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes/isolation.test.ts
git commit -m "test(server): per-user data isolation tests (items, sync/pull, PATCH cross-user)"
```

---

### Task 3: Fly.io Deployment

**Files:**
- Create: `apps/server/fly.toml`
- Create: `apps/server/.dockerignore`

**Interfaces:**
- Consumes: `apps/server/Dockerfile` from Phase 1 Task 12
- Produces:
  - `fly launch` + `fly deploy` deploys to `stashbro.fly.dev`
  - Persistent SQLite volume at `/data` (1GB)
  - Secrets: `AUTH_TOKEN`, `JWT_SECRET`, `RESEND_API_KEY` set via `fly secrets set`

- [ ] **Step 1: Create fly.toml**

```toml
# apps/server/fly.toml
app = "stashbro"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"
  # Build context must be the monorepo root:
  # fly deploy --dockerfile apps/server/Dockerfile apps/server/

[env]
  PORT = "3000"
  AUTH_MODE = "magic-link"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1

[[mounts]]
  source = "stashbro_data"
  destination = "/data"
  initial_size = "1gb"
```

- [ ] **Step 2: Create .dockerignore**

```
# apps/server/.dockerignore
node_modules
dist
.turbo
*.db
*.db-shm
*.db-wal
.env
.git
docs
```

- [ ] **Step 3: Deploy to Fly.io**

```bash
cd apps/server

# First time setup (creates app and volume):
fly launch --no-deploy --name stashbro --region iad

# Create persistent volume:
fly volumes create stashbro_data --size 1 --region iad

# Set secrets:
fly secrets set \
  AUTH_TOKEN="$(openssl rand -hex 32)" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  RESEND_API_KEY="re_your_key_here"

# Deploy from monorepo root (context includes packages/shared):
cd ../..
fly deploy --config apps/server/fly.toml --dockerfile apps/server/Dockerfile
```

Expected output: `==> Monitoring deployment...` → `1 desired, 1 placed, 1 healthy, 0 unhealthy`

- [ ] **Step 4: Verify deployment**

```bash
curl https://stashbro.fly.dev/health
```

Expected: `{"ok":true}`

- [ ] **Step 5: Commit**

```bash
git add apps/server/fly.toml apps/server/.dockerignore
git commit -m "feat(server): Fly.io deploy config (fly.toml, volume /data, secrets)"
```

---

### Task 4: Client Signup Flow (Magic-Link)

**Files:**
- Modify: `apps/mobile/app/settings.tsx` (add email field for hosted mode detection)
- Modify: `apps/mac/StashBro/UI/SettingsView.swift` (add email + "Send Code" + code entry)
- Modify: `packages/extension/entrypoints/options/main.tsx` (add email-based login flow)

**Interfaces:**
- Consumes: `POST /auth/request`, `POST /auth/verify`, `POST /auth/refresh` from Task 1; existing settings storage in each client
- Produces:
  - Each client detects hosted mode by fetching `GET /health` and checking response for `{"ok":true,"mode":"magic-link"}` (requires server update)
  - If hosted: shows email field → "Send Code" → 6-digit code entry → verify → store `accessToken` + `refreshToken` + auto-refresh on 401
  - `ACCESS_TOKEN` and `REFRESH_TOKEN` stored alongside server URL in client settings storage

- [ ] **Step 1: Update server health endpoint to expose mode**

In `apps/server/src/app.ts`, update health route:

```typescript
app.get('/health', (c) => c.json({ ok: true, mode: process.env['AUTH_MODE'] ?? 'token' }))
```

- [ ] **Step 2: Update iOS settings screen for hosted login**

```tsx
// apps/mobile/app/settings.tsx - add hosted login state after existing useState declarations:
const [serverMode, setServerMode] = useState<'token' | 'magic-link' | 'unknown'>('unknown')
const [email, setEmail] = useState('')
const [codeStep, setCodeStep] = useState(false)
const [code, setCode] = useState('')
const [loginStatus, setLoginStatus] = useState('')

// Add after existing useEffect:
const detectMode = async (serverUrl: string) => {
  try {
    const res = await fetch(`${serverUrl}/health`)
    if (!res.ok) return
    const body: { mode?: string } = await res.json()
    setServerMode(body.mode === 'magic-link' ? 'magic-link' : 'token')
  } catch { setServerMode('unknown') }
}

// In the render, after the token field, add conditionally:
{serverMode === 'magic-link' && !codeStep && (
  <>
    <Text style={styles.label}>Email</Text>
    <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
    <TouchableOpacity style={styles.btn} onPress={async () => {
      const res = await fetch(`${url}/auth/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      if (res.ok) { setCodeStep(true); setLoginStatus('Code sent to your email') }
      else setLoginStatus('Failed to send code')
    }}>
      <Text style={styles.btnText}>Send Code</Text>
    </TouchableOpacity>
  </>
)}
{serverMode === 'magic-link' && codeStep && (
  <>
    <Text style={styles.label}>Enter Code</Text>
    <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="123456" keyboardType="numeric" maxLength={6} />
    <TouchableOpacity style={styles.btn} onPress={async () => {
      const deviceId = await AsyncStorage.getItem('stashbro:deviceId') ?? crypto.randomUUID()
      await AsyncStorage.setItem('stashbro:deviceId', deviceId)
      const res = await fetch(`${url}/auth/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, deviceId }) })
      if (!res.ok) { setLoginStatus('Invalid code'); return }
      const { accessToken, refreshToken } = await res.json()
      await Promise.all([
        AsyncStorage.setItem('stashbro:serverURL', url),
        AsyncStorage.setItem('stashbro:serverToken', accessToken),
        AsyncStorage.setItem('stashbro:refreshToken', refreshToken),
      ])
      setLoginStatus('Signed in!')
    }}>
      <Text style={styles.btnText}>Verify Code</Text>
    </TouchableOpacity>
  </>
)}
{loginStatus ? <Text style={{ color: '#1F7A47', fontSize: 13, marginTop: 8 }}>{loginStatus}</Text> : null}
```

- [ ] **Step 3: Update Mac SettingsView.swift for hosted login**

Add these `@State` vars and methods to `SettingsView`:

```swift
// apps/mac/StashBro/UI/SettingsView.swift

// Add to SettingsView body (after existing @State vars):
@State private var hostedEmail = ""
@State private var magicCode = ""
@State private var codeStep = false
@State private var loginStatus = ""

// Add to Form:
Section("Sign In (Hosted Mode)") {
    TextField("Email", text: $hostedEmail)
        .textContentType(.emailAddress)
    if !codeStep {
        Button("Send Code") { sendCode() }
    } else {
        TextField("6-digit code", text: $magicCode)
        Button("Verify Code") { verifyCode() }
    }
    if !loginStatus.isEmpty { Text(loginStatus).foregroundStyle(.green) }
}

// Add these methods to SettingsView:
private func sendCode() {
    guard let serverURL = UserDefaults.standard.string(forKey: "serverURL"),
          let url = URL(string: "\(serverURL)/auth/request") else {
        loginStatus = "Server URL not set"; return
    }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONSerialization.data(withJSONObject: ["email": hostedEmail])
    URLSession.shared.dataTask(with: req) { _, resp, _ in
        DispatchQueue.main.async {
            if (resp as? HTTPURLResponse)?.statusCode == 200 {
                codeStep = true
                loginStatus = "Code sent to your email"
            } else {
                loginStatus = "Failed to send code"
            }
        }
    }.resume()
}

private func verifyCode() {
    guard let serverURL = UserDefaults.standard.string(forKey: "serverURL"),
          let url = URL(string: "\(serverURL)/auth/verify") else { return }
    let deviceId: String = {
        let key = "stashbro:deviceId"
        if let id = UserDefaults.standard.string(forKey: key) { return id }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: key)
        return id
    }()
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONSerialization.data(withJSONObject: [
        "email": hostedEmail, "code": magicCode, "deviceId": deviceId
    ])
    URLSession.shared.dataTask(with: req) { data, resp, _ in
        guard let data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let accessToken = json["accessToken"],
              let refreshToken = json["refreshToken"],
              (resp as? HTTPURLResponse)?.statusCode == 200
        else {
            DispatchQueue.main.async { loginStatus = "Invalid code" }
            return
        }
        UserDefaults.standard.set(accessToken, forKey: "serverToken")
        Self.keychainSet("stashbro.refreshToken", value: refreshToken)
        DispatchQueue.main.async { loginStatus = "Signed in!" }
    }.resume()
}

// Minimal Keychain helper - uses Security framework (no extra dependency)
private static func keychainSet(_ key: String, value: String) {
    let data = Data(value.utf8)
    let query: [CFString: Any] = [
        kSecClass: kSecClassGenericPassword,
        kSecAttrAccount: key,
        kSecValueData: data,
    ]
    SecItemDelete(query as CFDictionary)
    SecItemAdd(query as CFDictionary, nil)
}
```

Add `import Security` at the top of `SettingsView.swift`.

- [ ] **Step 4: Update extension options for hosted login**

Replace `packages/extension/entrypoints/options/main.tsx` with the full magic-link-aware version:

```tsx
// packages/extension/entrypoints/options/main.tsx
import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

type AuthMode = 'token' | 'magic-link' | 'unknown'
type Step = 'settings' | 'email' | 'code' | 'done'

function OptionsApp() {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [mode, setMode] = useState<AuthMode>('unknown')
  const [step, setStep] = useState<Step>('settings')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    browser.storage.local.get(['serverURL', 'serverToken']).then((s) => {
      if (s.serverURL) setUrl(s.serverURL as string)
      if (s.serverToken) setToken(s.serverToken as string)
    })
  }, [])

  const detectMode = async (serverUrl: string): Promise<AuthMode> => {
    try {
      const res = await fetch(`${serverUrl}/health`)
      if (!res.ok) return 'unknown'
      const body: { mode?: string } = await res.json()
      return body.mode === 'magic-link' ? 'magic-link' : 'token'
    } catch { return 'unknown' }
  }

  const save = async () => {
    const detected = await detectMode(url)
    setMode(detected)
    if (detected === 'magic-link') {
      setStep('email')
      setStatus('Hosted mode detected - sign in with email')
    } else {
      await browser.storage.local.set({ serverURL: url, serverToken: token })
      setStatus('Saved!')
      setTimeout(() => setStatus(''), 2000)
    }
  }

  const test = async () => {
    try {
      const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${token}` } })
      setStatus(res.ok ? 'Connected!' : `Error: ${res.status}`)
    } catch { setStatus('Connection failed') }
    setTimeout(() => setStatus(''), 3000)
  }

  const sendCode = async () => {
    const res = await fetch(`${url}/auth/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) { setStep('code'); setStatus('Code sent to your email') }
    else setStatus('Failed to send code')
  }

  const verifyCode = async () => {
    const { stashbroDeviceId } = await browser.storage.local.get('stashbroDeviceId')
    const deviceId = (stashbroDeviceId as string | undefined) ?? crypto.randomUUID()
    await browser.storage.local.set({ stashbroDeviceId: deviceId })

    const res = await fetch(`${url}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, deviceId }),
    })
    if (!res.ok) { setStatus('Invalid code'); return }
    const { accessToken, refreshToken } = await res.json() as { accessToken: string; refreshToken: string }
    await browser.storage.local.set({ serverURL: url, serverToken: accessToken, refreshToken })
    setStep('done')
    setStatus('Signed in!')
  }

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 400, margin: '40px auto', padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>StashBro Settings</h2>

      {(step === 'settings' || step === 'done') && (
        <>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Server URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} style={inputStyle} placeholder="https://your-stashbro.fly.dev" />
          {mode !== 'magic-link' && (
            <>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Bearer Token</label>
              <input value={token} onChange={e => setToken(e.target.value)} type="password" style={inputStyle} placeholder="your-secret-token" />
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} style={primaryBtn}>Save</button>
            {mode !== 'magic-link' && <button onClick={test} style={secondaryBtn}>Test Connection</button>}
          </div>
        </>
      )}

      {step === 'email' && (
        <>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} placeholder="you@example.com" autoComplete="email" />
          <button onClick={sendCode} style={primaryBtn}>Send Code</button>
        </>
      )}

      {step === 'code' && (
        <>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>6-digit Code</label>
          <input value={code} onChange={e => setCode(e.target.value)} style={inputStyle} placeholder="123456" maxLength={6} inputMode="numeric" />
          <button onClick={verifyCode} style={primaryBtn}>Verify</button>
        </>
      )}

      {status && <div style={{ marginTop: 12, fontSize: 13, color: '#1F7A47' }}>{status}</div>}
    </div>
  )
}

const inputStyle: React.CSSProperties = { display: 'block', width: '100%', margin: '6px 0 16px', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' }
const primaryBtn: React.CSSProperties = { padding: '8px 16px', background: '#C87A38', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const secondaryBtn: React.CSSProperties = { padding: '8px 16px', background: '#f0f0f0', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }

createRoot(document.getElementById('root')!).render(<OptionsApp />)
```

- [ ] **Step 5: Add auto-refresh on 401 to StashBroClient (packages/shared)**

Access tokens expire in 15 minutes. Add 401 interception to `packages/shared/src/client.ts` so mobile and extension clients auto-refresh transparently:

```typescript
// packages/shared/src/client.ts - update the request() method:
async request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${this.baseURL}${path}`, {
    ...init,
    headers: { ...this.headers, ...(init.headers ?? {}) },
  })

  if (res.status === 401) {
    const newToken = await this.refreshAccessToken()
    if (!newToken) throw new Error('Session expired - re-authenticate')
    // Retry once with new token
    const retry = await fetch(`${this.baseURL}${path}`, {
      ...init,
      headers: { ...this.headers, Authorization: `Bearer ${newToken}`, ...(init.headers ?? {}) },
    })
    if (!retry.ok) throw new Error(`HTTP ${retry.status}`)
    return retry.json() as Promise<T>
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

// Add refreshAccessToken() method. getRefreshToken/setAccessToken are injected via constructor:
private async refreshAccessToken(): Promise<string | null> {
  if (!this.onRefresh) return null
  try {
    const refreshToken = await this.onRefresh.getRefreshToken()
    if (!refreshToken) return null
    const res = await fetch(`${this.baseURL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const { accessToken } = await res.json() as { accessToken: string }
    await this.onRefresh.setAccessToken(accessToken)
    this.headers['Authorization'] = `Bearer ${accessToken}`
    return accessToken
  } catch { return null }
}
```

Update `StashBroClient` constructor to accept optional `onRefresh`:

```typescript
// packages/shared/src/client.ts
export interface TokenRefreshHooks {
  getRefreshToken(): Promise<string | null>
  setAccessToken(token: string): Promise<void>
}

export class StashBroClient {
  private headers: Record<string, string>
  private onRefresh?: TokenRefreshHooks

  constructor(private readonly baseURL: string, token: string, onRefresh?: TokenRefreshHooks) {
    this.headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    this.onRefresh = onRefresh
  }
  // ...
}
```

Wire up in mobile `useSyncEngine.ts` when creating `StashBroClient`:

```typescript
// When AUTH_MODE is magic-link, pass refresh hooks:
const client = new StashBroClient(serverURL, serverToken, {
  getRefreshToken: async () => AsyncStorage.getItem('stashbro:refreshToken'),
  setAccessToken: async (t) => {
    await AsyncStorage.setItem('stashbro:serverToken', t)
  },
})
```

Mac uses `URLSession` directly (not `StashBroClient`). Add 401 retry to `MacSyncEngine.performSync()`:

```swift
// apps/mac/StashBro/Sync/MacSyncEngine.swift - add helper:
private func withTokenRefresh<T>(_ op: () async throws -> T) async throws -> T {
    do {
        return try await op()
    } catch let err as APIError where err.statusCode == 401 {
        guard let refreshToken = Self.keychainGet("stashbro.refreshToken"),
              let serverURL = UserDefaults.standard.string(forKey: "serverURL"),
              let url = URL(string: "\(serverURL)/auth/refresh") else { throw err }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["refreshToken": refreshToken])
        let (data, _) = try await URLSession.shared.data(for: req)
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
           let newToken = json["accessToken"] {
            UserDefaults.standard.set(newToken, forKey: "serverToken")
        }
        return try await op() // retry once
    }
}

// Minimal Keychain read helper (companion to keychainSet in SettingsView):
static func keychainGet(_ key: String) -> String? {
    let query: [CFString: Any] = [
        kSecClass: kSecClassGenericPassword,
        kSecAttrAccount: key,
        kSecReturnData: true,
        kSecMatchLimit: kSecMatchLimitOne,
    ]
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
}
```

Note: `APIError` must expose `statusCode`. In `MacSyncEngine`, wrap the OpenAPI client calls in `withTokenRefresh { ... }`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/app.ts apps/mobile/app/settings.tsx apps/mac/StashBro/UI/SettingsView.swift packages/extension/entrypoints/options/main.tsx packages/shared/src/client.ts apps/mac/StashBro/Sync/MacSyncEngine.swift
git commit -m "feat: magic-link signup flow in all clients (mobile, mac, extension) + 401 auto-refresh"
```

---

### Task 5: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: monorepo structure; `apps/server/Dockerfile`; all test suites
- Produces:
  - `ci.yml`: triggers on push to `main` and PRs; runs `pnpm install` + `pnpm test` (packages/shared + apps/server)
  - `release.yml`: triggers on `git tag v*`; builds Docker image, pushes to `ghcr.io/stashbro/server:latest` and `ghcr.io/stashbro/server:<version>`, creates GitHub Release

- [ ] **Step 1: Create .github/workflows/ci.yml**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build shared package
        run: pnpm --filter @stashbro/shared build

      - name: Test shared package
        run: pnpm --filter @stashbro/shared test

      - name: Test server
        run: pnpm --filter @stashbro/server test

      - name: Build server
        run: pnpm --filter @stashbro/server build

  docker:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build Docker image (no push on CI)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/server/Dockerfile
          push: false
          tags: stashbro/server:ci
```

- [ ] **Step 2: Create .github/workflows/release.yml**

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract version
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/server/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/stashbro-server:latest
            ghcr.io/${{ github.repository_owner }}/stashbro-server:${{ steps.version.outputs.VERSION }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body: |
            ## StashBro ${{ steps.version.outputs.VERSION }}

            ### Self-host (Docker)
            ```bash
            docker run -d \
              -v stashbro_data:/data \
              -e AUTH_TOKEN=your-secret-token \
              -p 3000:3000 \
              ghcr.io/${{ github.repository_owner }}/stashbro-server:${{ steps.version.outputs.VERSION }}
            ```

            ### Update
            ```bash
            docker pull ghcr.io/${{ github.repository_owner }}/stashbro-server:latest
            ```
```

- [ ] **Step 3: Verify workflows parse correctly**

```bash
# Validate YAML syntax
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "ci.yml OK"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "release.yml OK"
```

Expected: both print OK

- [ ] **Step 4: Commit**

```bash
git add .github/
git commit -m "feat: GitHub Actions CI (test + docker build on main, release workflow on tags)"
```

---

### Task 6: Self-Host Documentation

**Files:**
- Create: `README.md`
- Create: `apps/server/README.md`

**Interfaces:**
- Consumes: all previous phases
- Produces:
  - Root `README.md`: what StashBro is, quick self-host instructions, links to client apps
  - `apps/server/README.md`: detailed server config (env vars, Docker run, Fly.io, volume backup)

- [ ] **Step 1: Create README.md**

```markdown
# StashBro

Open-source universal reading list. Save links from Mac, iPhone, and any browser. Sync locally-first via your own server or the hosted instance.

## Self-host in 60 seconds

```bash
docker run -d \
  --name stashbro \
  -v stashbro_data:/data \
  -e AUTH_TOKEN=your-secret-token \
  -e AUTH_MODE=token \
  -p 3000:3000 \
  ghcr.io/stashbro/stashbro-server:latest
```

Then point your Mac app / mobile app / browser extension at `http://your-server:3000` with token `your-secret-token`.

## Clients

| Client | Download |
|--------|---------|
| Mac app (notch + menubar) | [GitHub Releases](https://github.com/stashbro/stashbro/releases) |
| iOS app | TestFlight (coming soon) |
| Browser extension | Chrome Web Store (coming soon) |

## Hosted instance

Sign up at [stashbro.app](https://stashbro.app) for the hosted version (email-based auth, no server required).

## License

MIT
```

- [ ] **Step 2: Create apps/server/README.md**

```markdown
# StashBro Server

Single-container server: Hono + Drizzle + SQLite.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_MODE` | Yes | `token` (self-host) or `magic-link` (hosted) |
| `AUTH_TOKEN` | If `AUTH_MODE=token` | Static bearer token for all requests |
| `JWT_SECRET` | If `AUTH_MODE=magic-link` | Min 32 chars; sign JWT access tokens |
| `RESEND_API_KEY` | If `AUTH_MODE=magic-link` | Resend API key for email |
| `DB_PATH` | No | SQLite file path (default: `/data/stashbro.db`) |
| `PORT` | No | HTTP port (default: `3000`) |

## Docker run (self-host)

```bash
docker run -d \
  -v stashbro_data:/data \
  -e AUTH_MODE=token \
  -e AUTH_TOKEN=your-32-char-secret \
  -p 3000:3000 \
  ghcr.io/stashbro/stashbro-server:latest
```

## Fly.io deploy

```bash
cd apps/server
fly launch
fly volumes create stashbro_data --size 1 --region iad
fly secrets set AUTH_TOKEN="$(openssl rand -hex 32)" JWT_SECRET="$(openssl rand -hex 32)"
fly deploy
```

## Backup

SQLite WAL file at `/data/stashbro.db`. Snapshot: `fly ssh console -C "cp /data/stashbro.db /tmp/backup.db"` then `fly sftp get /tmp/backup.db`.

## API

OpenAPI spec available at `GET /openapi.json` when the server is running.
```

- [ ] **Step 3: Commit**

```bash
git add README.md apps/server/README.md
git commit -m "docs: self-host README, server env var reference, Fly.io and Docker instructions"
```

---

### Task 7: Final Integration Test + Tag

**Files:**
- Create: `scripts/e2e-smoke.sh`

**Interfaces:**
- Consumes: running server instance (local or deployed)
- Produces: smoke test script that saves an item on the server and verifies it appears on pull

- [ ] **Step 1: Create e2e smoke test**

```bash
#!/usr/bin/env bash
# scripts/e2e-smoke.sh
# Usage: SERVER_URL=http://localhost:3000 AUTH_TOKEN=secret bash scripts/e2e-smoke.sh

set -euo pipefail

SERVER="${SERVER_URL:-http://localhost:3000}"
TOKEN="${AUTH_TOKEN:-}"

echo "==> Testing $SERVER"

# Health check
health=$(curl -sf "$SERVER/health")
echo "Health: $health"

# Save item
item=$(curl -sf -X POST "$SERVER/items" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"url":"https://example.com/e2e-test","title":"E2E Test Item"}')
echo "Created: $item"
ITEM_ID=$(echo "$item" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Item ID: $ITEM_ID"

# Pull and verify
pull=$(curl -sf "$SERVER/sync/pull?cursor=0" -H "Authorization: Bearer $TOKEN")
echo "Pull response: $pull"

if echo "$pull" | python3 -c "import sys,json; data=json.load(sys.stdin); found=any(c['id']=='$ITEM_ID' for c in data['changes']); exit(0 if found else 1)"; then
  echo "PASS: item found in pull response"
else
  echo "FAIL: item NOT found in pull response"
  exit 1
fi
```

```bash
chmod +x scripts/e2e-smoke.sh
```

- [ ] **Step 2: Run smoke test locally**

```bash
# Start server
cd apps/server && DB_PATH=:memory: AUTH_MODE=token AUTH_TOKEN=smoke-test pnpm start &
sleep 2

# Run smoke test
SERVER_URL=http://localhost:3000 AUTH_TOKEN=smoke-test bash scripts/e2e-smoke.sh
```

Expected: `PASS: item found in pull response`

- [ ] **Step 3: Final commit and tag**

```bash
git add scripts/e2e-smoke.sh
git commit -m "test: e2e smoke test script (save item → pull → verify)"
git tag -a v0.1.0 -m "StashBro v0.1.0 - all 5 phases complete"
```
