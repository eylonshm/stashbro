import { describe, it, expect, afterEach } from 'vitest'
import { getDb } from './index.js'
import { items, tags, item_tags } from './schema.js'
import { eq } from 'drizzle-orm'

let db: ReturnType<typeof getDb>

afterEach(() => {
  // In-memory DB is discarded after each test
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

  it('allows same tag name for different users', () => {
    db = getDb(':memory:')
    db.insert(tags).values({ id: 't1', user_id: 'u1', name: 'AI' }).run()
    expect(() =>
      db.insert(tags).values({ id: 't2', user_id: 'u2', name: 'AI' }).run()
    ).not.toThrow()
  })
})
