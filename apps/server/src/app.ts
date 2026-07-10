import { OpenAPIHono } from '@hono/zod-openapi'
import { itemsRouter } from './routes/items.js'
import { tagsRouter } from './routes/tags.js'
import { syncRouter } from './routes/sync.js'

export function createApp() {
  const app = new OpenAPIHono()

  app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', { type: 'http', scheme: 'bearer' })

  app.get('/health', (c) => c.json({ ok: true }))

  app.route('/items', itemsRouter())
  app.route('/tags', tagsRouter())
  app.route('/sync', syncRouter())

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'StashBro API', version: '1.0.0' },
    security: [{ BearerAuth: [] }],
  })

  return app
}
