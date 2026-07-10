import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { uuidv7 } from 'uuidv7'
import { eq, and, gt, lte, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { getDb } from '../db/index.js'
import { items, tags, item_tags } from '../db/schema.js'

type Env = { Variables: { userId: string } }

const SyncChangeSchema = z.object({
  id: z.string(),
  change_seq: z.number(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  favicon_url: z.string().nullable(),
  domain: z.string(),
  type: z.enum(['video', 'post', 'article', 'other']),
  status: z.enum(['unread', 'archived']),
  priority: z.enum(['low', 'medium', 'high']),
  tag_names: z.array(z.string()),
})

function nextSeqForUser(db: ReturnType<typeof getDb>, userId: string): number {
  const row = db.select({ seq: items.change_seq })
    .from(items).where(eq(items.user_id, userId))
    .orderBy(desc(items.change_seq)).limit(1).all()[0]
  return (row?.seq ?? 0) + 1
}

function toSyncChange(db: ReturnType<typeof getDb>, item: typeof items.$inferSelect): z.infer<typeof SyncChangeSchema> {
  const tagRows = db.select({ name: tags.name })
    .from(item_tags)
    .innerJoin(tags, eq(item_tags.tag_id, tags.id))
    .where(eq(item_tags.item_id, item.id))
    .all()
  return {
    id: item.id, change_seq: item.change_seq, updated_at: item.updated_at,
    deleted_at: item.deleted_at ?? null, url: item.url, title: item.title,
    description: item.description ?? null, thumbnail_url: item.thumbnail_url ?? null,
    favicon_url: item.favicon_url ?? null, domain: item.domain,
    type: item.type as 'video' | 'post' | 'article' | 'other',
    status: item.status as 'unread' | 'archived',
    priority: item.priority as 'low' | 'medium' | 'high',
    tag_names: tagRows.map(t => t.name),
  }
}

export function syncRouter() {
  const app = new OpenAPIHono<Env>()
  app.use('/*', authMiddleware)

  // POST /sync/push
  app.openapi(createRoute({
    method: 'post', path: '/push',
    request: { body: { content: { 'application/json': { schema: z.object({ changes: z.array(SyncChangeSchema) }) } } } },
    responses: { 200: { content: { 'application/json': { schema: z.object({ accepted: z.number() }) } }, description: 'Push result' } },
  }), (c) => {
    const userId = c.get('userId')
    const db = getDb()
    const { changes } = c.req.valid('json')
    let accepted = 0

    for (const change of changes) {
      const existing = db.select().from(items).where(and(eq(items.id, change.id), eq(items.user_id, userId))).all()[0]
      if (existing && existing.updated_at >= change.updated_at) continue // LWW: server wins

      const seq = nextSeqForUser(db, userId)
      if (existing) {
        db.update(items).set({
          url: change.url, title: change.title, description: change.description,
          thumbnail_url: change.thumbnail_url, favicon_url: change.favicon_url,
          domain: change.domain, type: change.type, status: change.status,
          priority: change.priority, updated_at: change.updated_at,
          deleted_at: change.deleted_at, change_seq: seq,
        }).where(eq(items.id, change.id)).run()
      } else {
        const now = new Date().toISOString()
        db.insert(items).values({
          id: change.id, user_id: userId, url: change.url, title: change.title,
          description: change.description, thumbnail_url: change.thumbnail_url,
          favicon_url: change.favicon_url, domain: change.domain, type: change.type,
          status: change.status, priority: change.priority,
          created_at: now, updated_at: change.updated_at,
          deleted_at: change.deleted_at, change_seq: seq,
        }).run()
      }

      // Sync tags
      db.delete(item_tags).where(eq(item_tags.item_id, change.id)).run()
      for (const name of change.tag_names) {
        let tag = db.select().from(tags).where(and(eq(tags.user_id, userId), eq(tags.name, name))).all()[0]
        if (!tag) {
          const tagId = uuidv7()
          db.insert(tags).values({ id: tagId, user_id: userId, name }).run()
          tag = db.select().from(tags).where(eq(tags.id, tagId)).all()[0]!
        }
        db.insert(item_tags).values({ item_id: change.id, tag_id: tag.id }).onConflictDoNothing().run()
      }

      accepted++
    }

    return c.json({ accepted })
  })

  // GET /sync/pull
  app.openapi(createRoute({
    method: 'get', path: '/pull',
    request: { query: z.object({ cursor: z.string().default('0') }) },
    responses: { 200: { content: { 'application/json': { schema: z.object({
      changes: z.array(SyncChangeSchema), cursor: z.number(),
    }) } }, description: 'Pull result' } },
  }), (c) => {
    const userId = c.get('userId')
    const db = getDb()
    const cursor = parseInt(c.req.valid('query').cursor, 10)

    // Purge tombstones older than 90 days
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    db.delete(items).where(and(eq(items.user_id, userId), lte(items.deleted_at, cutoff))).run()

    const rows = db.select().from(items)
      .where(and(eq(items.user_id, userId), gt(items.change_seq, cursor)))
      .orderBy(desc(items.change_seq))
      .all()

    const changes = rows.map(r => toSyncChange(db, r))
    const maxSeq = rows[0]?.change_seq ?? cursor

    return c.json({ changes, cursor: maxSeq })
  })

  return app
}
