import type { MiddlewareHandler } from 'hono'

// ponytail: AUTH_MODE=magic-link stub always 401s until Phase 5 wires it up
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

  // magic-link mode: stub - Phase 5 replaces this block
  return c.json({ error: 'Unauthorized' }, 401)
}
