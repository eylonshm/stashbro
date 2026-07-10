import { describe, it, expect, afterEach } from 'vitest'
import { getDb, clearDbCache } from './index.js'
import { items, tags, item_tags } from './schema.js'
import { eq } from 'drizzle-orm'

let db: ReturnType<typeof getDb>

afterEach(() => {
  clearDbCache() // reset singleton so each test gets a fresh :memory: db
})

describe('DB schema', () => {
  it('inserts and retrieves an item', () => {
    db = getDb(':memory:')
    db.insert(items).values({
      id: 'test-id',
      user_id: 'user-1',
      url: 'https://example.com',
      title: 'Test',
      domain: 'example.com',
      type: 'article',
      status: 'unread',
      priority: 'medium',
      change_seq: 1,
    }).run()

    const result = db.select().from(items).where(eq(items.id, 'test-id')).all()
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('Test')
    expect(result[0]?.priority).toBe('medium')
  })

  it('enforces unique tag name per user', () => {
    db = getDb(':memory:')
    db.insert(tags).values({ id: 't1', user_id: 'u1', name: 'AI' }).run()
    expect(() =>
      db.insert(tags).values({ id: 't2', user_id: 'u1', name: 'AI' }).run()
    ).toThrow()
  })

  it('defaults created_at/updated_at to ISO timestamps when omitted', () => {
    db = getDb(':memory:')
    db.insert(items).values({
      id: 'ts-test',
      user_id: 'user-1',
      url: 'https://example.com',
      title: 'TS Test',
      domain: 'example.com',
      type: 'article',
      status: 'unread',
      priority: 'medium',
      change_seq: 1,
    }).run()
    const [row] = db.select().from(items).where(eq(items.id, 'ts-test')).all()
    const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/
    expect(row?.created_at).toMatch(isoRe)
    expect(row?.updated_at).toMatch(isoRe)
  })

  it('allows same tag name for different users', () => {
    db = getDb(':memory:')
    db.insert(tags).values({ id: 't1', user_id: 'u1', name: 'AI' }).run()
    expect(() =>
      db.insert(tags).values({ id: 't2', user_id: 'u2', name: 'AI' }).run()
    ).not.toThrow()
  })
})
