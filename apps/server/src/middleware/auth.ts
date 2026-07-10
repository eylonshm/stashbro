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

  // magic-link mode: fail loud on misconfiguration, then validate JWT
  if (!process.env['JWT_SECRET']) return c.json({ error: 'JWT_SECRET not configured' }, 500)

  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  const userId = await verifyAccessToken(token)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  c.set('userId', userId)
  return next()
}
