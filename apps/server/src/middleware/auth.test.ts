import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { authMiddleware } from './auth.js'
import { createAccessToken } from '../services/auth.js'

let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv = {
    AUTH_TOKEN: process.env['AUTH_TOKEN'],
    AUTH_MODE: process.env['AUTH_MODE'],
    JWT_SECRET: process.env['JWT_SECRET'],
  }
})

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

function makeApp(token: string, mode = 'token') {
  process.env['AUTH_TOKEN'] = token
  process.env['AUTH_MODE'] = mode
  const app = new Hono<{ Variables: { userId: string } }>()
  app.use('/protected/*', authMiddleware)
  app.get('/protected/test', (c) => c.json({ userId: c.get('userId') }))
  return app
}

describe('authMiddleware token mode', () => {
  it('allows request with correct bearer token', async () => {
    const app = makeApp('secret-token')
    const res = await app.request('/protected/test', {
      headers: { Authorization: 'Bearer secret-token' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.userId).toBe('default')
  })

  it('rejects missing Authorization header', async () => {
    const app = makeApp('secret-token')
    const res = await app.request('/protected/test')
    expect(res.status).toBe(401)
  })

  it('rejects wrong token', async () => {
    const app = makeApp('secret-token')
    const res = await app.request('/protected/test', {
      headers: { Authorization: 'Bearer wrong-token' },
    })
    expect(res.status).toBe(401)
  })

  it('rejects malformed Authorization header (no Bearer prefix)', async () => {
    const app = makeApp('secret-token')
    const res = await app.request('/protected/test', {
      headers: { Authorization: 'token secret-token' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 500 when AUTH_TOKEN is unset', async () => {
    delete process.env['AUTH_TOKEN']
    process.env['AUTH_MODE'] = 'token'
    const app = new Hono<{ Variables: { userId: string } }>()
    app.use('/protected/*', authMiddleware)
    app.get('/protected/test', (c) => c.json({ userId: c.get('userId') }))
    const res = await app.request('/protected/test', {
      headers: { Authorization: 'Bearer anything' },
    })
    expect(res.status).toBe(500)
  })
})

describe('authMiddleware magic-link mode', () => {
  const JWT_SECRET = 'test-secret-min-32-chars-xxxxxxxxx'

  it('returns 500 when JWT_SECRET is not configured', async () => {
    delete process.env['JWT_SECRET']
    process.env['AUTH_MODE'] = 'magic-link'
    const app = new Hono<{ Variables: { userId: string } }>()
    app.use('/protected/*', authMiddleware)
    app.get('/protected/test', (c) => c.json({ userId: c.get('userId') }))
    const res = await app.request('/protected/test', {
      headers: { Authorization: 'Bearer some-token' },
    })
    expect(res.status).toBe(500)
  })

  it('returns 401 with no Authorization header', async () => {
    process.env['JWT_SECRET'] = JWT_SECRET
    process.env['AUTH_MODE'] = 'magic-link'
    const app = new Hono<{ Variables: { userId: string } }>()
    app.use('/protected/*', authMiddleware)
    app.get('/protected/test', (c) => c.json({ userId: c.get('userId') }))
    const res = await app.request('/protected/test')
    expect(res.status).toBe(401)
  })

  it('returns 401 for invalid JWT', async () => {
    process.env['JWT_SECRET'] = JWT_SECRET
    process.env['AUTH_MODE'] = 'magic-link'
    const app = new Hono<{ Variables: { userId: string } }>()
    app.use('/protected/*', authMiddleware)
    app.get('/protected/test', (c) => c.json({ userId: c.get('userId') }))
    const res = await app.request('/protected/test', {
      headers: { Authorization: 'Bearer not-a-valid-jwt' },
    })
    expect(res.status).toBe(401)
  })

  it('allows request with valid JWT and sets userId', async () => {
    process.env['JWT_SECRET'] = JWT_SECRET
    process.env['AUTH_MODE'] = 'magic-link'
    const accessToken = await createAccessToken('user-123')
    const app = new Hono<{ Variables: { userId: string } }>()
    app.use('/protected/*', authMiddleware)
    app.get('/protected/test', (c) => c.json({ userId: c.get('userId') }))
    const res = await app.request('/protected/test', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.userId).toBe('user-123')
  })
})
