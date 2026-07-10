import { OpenAPIHono } from '@hono/zod-openapi'
import { authMiddleware } from './middleware/auth.js'

export function createApp() {
  const app = new OpenAPIHono()

  // Guard all data routes - items/tags/sync added in Tasks 8-10
  app.use('/items/*', authMiddleware)
  app.use('/tags/*', authMiddleware)
  app.use('/sync/*', authMiddleware)

  app.get('/health', (c) => c.json({ ok: true }))

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'StashBro API', version: '1.0.0' },
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
    security: [{ BearerAuth: [] }],
  })

  return app
}
