import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { uuidv7 } from 'uuidv7'
import { eq, and, asc, desc, gt, isNull } from 'drizzle-orm'
import { detectType, extractDomain } from '@stashbro/shared'
import { authMiddleware } from '../middleware/auth.js'
import { getDb } from '../db/index.js'
import { items, tags, item_tags } from '../db/schema.js'
import { enrichMetadataAsync } from '../services/metadata.js'

type Env = { Variables: { userId: string } }

const ItemSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  favicon_url: z.string().nullable(),
  domain: z.string(),
  type: z.enum(['video', 'post', 'article', 'other']),
  status: z.enum(['unread', 'read', 'archived']),
  priority: z.enum(['low', 'medium', 'high']),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  change_seq: z.number(),
  tags: z.array(z.object({ id: z.string(), user_id: z.string(), name: z.string() })),
})

function nextSeq(db: ReturnType<typeof getDb>, userId: string): number {
  const row = db.select({ seq: items.change_seq })
    .from(items)
    .where(eq(items.user_id, userId))
    .orderBy(desc(items.change_seq))
    .limit(1)
    .all()[0]
  return (row?.seq ?? 0) + 1
}

function itemWithTags(db: ReturnType<typeof getDb>, itemId: string, userId: string) {
  const [item] = db.select().from(items).where(and(eq(items.id, itemId), eq(items.user_id, userId))).all()
  if (!item) return null
  const tagRows = db.select({ id: tags.id, user_id: tags.user_id, name: tags.name })
    .from(item_tags)
    .innerJoin(tags, eq(item_tags.tag_id, tags.id))
    .where(eq(item_tags.item_id, itemId))
    .all()
  return { ...item, tags: tagRows }
}

function upsertTags(db: ReturnType<typeof getDb>, userId: string, tagNames: string[], itemId: string) {
  const names = tagNames.map(n => n.trim()).filter(Boolean)
  db.transaction((tx) => {
    tx.delete(item_tags).where(eq(item_tags.item_id, itemId)).run()
    for (const name of names) {
      let tag = tx.select().from(tags).where(and(eq(tags.user_id, userId), eq(tags.name, name))).all()[0]
      if (!tag) {
        const tagId = uuidv7()
        tx.insert(tags).values({ id: tagId, user_id: userId, name }).run()
        tag = tx.select().from(tags).where(eq(tags.id, tagId)).all()[0]!
      }
      tx.insert(item_tags).values({ item_id: itemId, tag_id: tag.id }).onConflictDoNothing().run()
    }
  })
}

export function itemsRouter() {
  const app = new OpenAPIHono<Env>()
  app.use('/*', authMiddleware)

  // POST /items
  const createRoute_ = createRoute({
    method: 'post', path: '/',
    request: {
      body: { content: { 'application/json': { schema: z.object({
        url: z.string().url(),
        title: z.string().optional(),
        type: z.enum(['video', 'post', 'article', 'other']).optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        tag_names: z.array(z.string()).optional(),
      })}}}
    },
    responses: { 201: { content: { 'application/json': { schema: ItemSchema }}, description: 'Created item' }},
  })
  app.openapi(createRoute_, async (c) => {
    const userId = c.get('userId')
    const body = c.req.valid('json')
    const db = getDb()
    const now = new Date().toISOString()

    // Dedup: look up existing item by (user_id, url), including deleted/archived
    const existing = db.select().from(items)
      .where(and(eq(items.user_id, userId), eq(items.url, body.url)))
      .all()[0]

    if (existing) {
      const seq = nextSeq(db, userId)
      db.update(items).set({
        change_seq: seq, updated_at: now, status: 'unread', deleted_at: null,
      }).where(eq(items.id, existing.id)).run()
      if (body.tag_names?.length) upsertTags(db, userId, body.tag_names, existing.id)
      // Re-enrich if title was never set (still equals url)
      if (existing.title === existing.url) enrichMetadataAsync(db, existing.id, existing.url).catch(() => {})
      return c.json(itemWithTags(db, existing.id, userId)!, 201)
    }

    const id = uuidv7()
    const domain = extractDomain(body.url)
    const type = body.type ?? detectType(body.url)
    const seq = nextSeq(db, userId)

    db.insert(items).values({
      id, user_id: userId, url: body.url,
      title: body.title ?? body.url,
      domain, type,
      status: 'unread',
      priority: body.priority ?? 'medium',
      created_at: now, updated_at: now,
      change_seq: seq,
    }).run()

    if (body.tag_names?.length) upsertTags(db, userId, body.tag_names, id)

    // Fire-and-forget metadata enrichment
    enrichMetadataAsync(db, id, body.url).catch(() => {})

    return c.json(itemWithTags(db, id, userId)!, 201)
  })

  // GET /items
  // ponytail: asc(change_seq) so since=gt(cursor) pages forward correctly; hasMore computed pre-tag-filter - when tag filter empties a whole page, advance cursor to end of dead page so client doesn't stop early
  const listRoute = createRoute({
    method: 'get', path: '/',
    request: { query: z.object({
      status: z.enum(['unread', 'read', 'archived']).optional(),
      type: z.enum(['video', 'post', 'article', 'other']).optional(),
      tag: z.string().optional(),
      since: z.string().optional(),
      limit: z.string().optional(),
    })},
    responses: { 200: { content: { 'application/json': { schema: z.object({
      items: z.array(ItemSchema),
      nextCursor: z.number().nullable(),
    })}}, description: 'List items' }},
  })
  app.openapi(listRoute, async (c) => {
    const userId = c.get('userId')
    const db = getDb()
    const q = c.req.valid('query')
    const limit = Math.min(parseInt(q.limit ?? '50', 10), 200)
    const since = parseInt(q.since ?? '0', 10)

    let rows = db.select().from(items)
      .where(and(
        eq(items.user_id, userId),
        isNull(items.deleted_at),
        q.status ? eq(items.status, q.status) : undefined,
        q.type ? eq(items.type, q.type) : undefined,
        since > 0 ? gt(items.change_seq, since) : undefined,
      ))
      .orderBy(asc(items.change_seq))
      .limit(limit + 1)
      .all()

    const hasMore = rows.length > limit
    if (hasMore) rows = rows.slice(0, limit)

    // Filter by tag if requested
    let filtered = rows
    if (q.tag) {
      const taggedItemIds = db.select({ item_id: item_tags.item_id })
        .from(item_tags)
        .innerJoin(tags, eq(item_tags.tag_id, tags.id))
        .where(and(eq(tags.user_id, userId), eq(tags.name, q.tag)))
        .all()
        .map(r => r.item_id)
      filtered = rows.filter(r => taggedItemIds.includes(r.id))
    }

    const withTags = filtered.map(r => itemWithTags(db, r.id, userId)).filter((r): r is NonNullable<typeof r> => r !== null)

    // If tag filter empties the whole page but there are more rows, advance past dead page
    const deadPageCursor = rows[rows.length - 1]?.change_seq ?? null
    return c.json({
      items: withTags,
      nextCursor: hasMore ? (withTags[withTags.length - 1]?.change_seq ?? deadPageCursor) : null,
    })
  })

  // PATCH /items/:id
  const patchRoute = createRoute({
    method: 'patch', path: '/{id}',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: z.object({
        title: z.string().optional(),
        type: z.enum(['video', 'post', 'article', 'other']).optional(),
        status: z.enum(['unread', 'read', 'archived']).optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        deleted_at: z.string().nullable().optional(),
        tag_names: z.array(z.string()).optional(),
      })}}}
    },
    responses: {
      200: { content: { 'application/json': { schema: ItemSchema }}, description: 'Updated item' },
      404: { content: { 'application/json': { schema: z.object({ error: z.string() })}}, description: 'Not found' },
    },
  })
  app.openapi(patchRoute, async (c) => {
    const userId = c.get('userId')
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const db = getDb()

    const existing = db.select().from(items).where(and(eq(items.id, id), eq(items.user_id, userId))).all()[0]
    if (!existing) return c.json({ error: 'Not found' }, 404)

    const seq = nextSeq(db, userId)
    const now = new Date().toISOString()
    db.update(items).set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.deleted_at !== undefined && { deleted_at: body.deleted_at }),
      updated_at: now,
      change_seq: seq,
    }).where(and(eq(items.id, id), eq(items.user_id, userId))).run()

    if (body.tag_names !== undefined) upsertTags(db, userId, body.tag_names, id)

    return c.json(itemWithTags(db, id, userId)!, 200)
  })

  return app
}
