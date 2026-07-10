import { OpenAPIHono } from '@hono/zod-openapi'

export function createApp() {
  const app = new OpenAPIHono()

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
