import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { authMiddleware } from './auth.js'

function makeApp(token: string) {
  process.env['AUTH_TOKEN'] = token
  process.env['AUTH_MODE'] = 'token'
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
})
