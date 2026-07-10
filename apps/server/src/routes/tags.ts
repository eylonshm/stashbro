import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { uuidv7 } from 'uuidv7'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { getDb } from '../db/index.js'
import { tags } from '../db/schema.js'

type Env = { Variables: { userId: string } }

const TagSchema = z.object({ id: z.string(), user_id: z.string(), name: z.string() })

export function tagsRouter() {
  const app = new OpenAPIHono<Env>()
  app.use('/*', authMiddleware)

  app.openapi(createRoute({
    method: 'get', path: '/',
    responses: { 200: { content: { 'application/json': { schema: z.array(TagSchema) } }, description: 'Tags' } },
  }), (c) => {
    const db = getDb()
    const userId = c.get('userId')
    return c.json(db.select().from(tags).where(eq(tags.user_id, userId)).all())
  })

  app.openapi(createRoute({
    method: 'post', path: '/',
    request: { body: { required: true, content: { 'application/json': { schema: z.object({ name: z.string().trim().min(1) }) } } } },
    responses: { 201: { content: { 'application/json': { schema: TagSchema } }, description: 'Created tag' } },
  }), (c) => {
    const db = getDb()
    const userId = c.get('userId')
    const { name } = c.req.valid('json')
    const existing = db.select().from(tags).where(and(eq(tags.user_id, userId), eq(tags.name, name))).all()[0]
    if (existing) return c.json(existing, 201)
    const id = uuidv7()
    try {
      db.insert(tags).values({ id, user_id: userId, name }).run()
      return c.json(db.select().from(tags).where(eq(tags.id, id)).all()[0]!, 201)
    } catch {
      // ponytail: UNIQUE race - concurrent create lost; re-select the winner
      return c.json(db.select().from(tags).where(and(eq(tags.user_id, userId), eq(tags.name, name))).all()[0]!, 201)
    }
  })

  return app
}
