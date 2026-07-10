import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { MIGRATIONS } from './db/schema.js'

// Tests tag query/mutation logic using in-memory better-sqlite3
// (mirrors the SQL used in tags.tsx)

function freshDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const sql of MIGRATIONS) db.exec(sql)
  return db
}

interface TagRow { id: string; name: string; count: number }

const TAGS_QUERY = `
  SELECT t.id, t.name, COUNT(it.item_id) as count
  FROM tags t
  LEFT JOIN item_tags it ON it.tag_id = t.id
  GROUP BY t.id
  ORDER BY t.name
`

describe('tag list query', () => {
  let db: ReturnType<typeof freshDb>
  beforeEach(() => { db = freshDb() })

  it('returns empty array when no tags', () => {
    const rows = db.prepare(TAGS_QUERY).all() as TagRow[]
    expect(rows).toHaveLength(0)
  })

  it('returns tag with count 0 when no items tagged', () => {
    db.prepare(`INSERT INTO tags (id, user_id, name) VALUES ('t1','u1','tech')`).run()
    const rows = db.prepare(TAGS_QUERY).all() as TagRow[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('tech')
    expect(rows[0]!.count).toBe(0)
  })

  it('counts items correctly', () => {
    db.prepare(`INSERT INTO tags (id, user_id, name) VALUES ('t1','u1','tech')`).run()
    db.prepare(`INSERT INTO items (id, user_id, url, title, domain) VALUES ('i1','u1','https://a.com','A','a.com')`).run()
    db.prepare(`INSERT INTO items (id, user_id, url, title, domain) VALUES ('i2','u1','https://b.com','B','b.com')`).run()
    db.prepare(`INSERT INTO item_tags (item_id, tag_id) VALUES ('i1','t1')`).run()
    db.prepare(`INSERT INTO item_tags (item_id, tag_id) VALUES ('i2','t1')`).run()
    const rows = db.prepare(TAGS_QUERY).all() as TagRow[]
    expect(rows[0]!.count).toBe(2)
  })

  it('orders tags alphabetically', () => {
    db.prepare(`INSERT INTO tags (id, user_id, name) VALUES ('t1','u1','zzz')`).run()
    db.prepare(`INSERT INTO tags (id, user_id, name) VALUES ('t2','u1','aaa')`).run()
    const rows = db.prepare(TAGS_QUERY).all() as TagRow[]
    expect(rows[0]!.name).toBe('aaa')
    expect(rows[1]!.name).toBe('zzz')
  })
})

describe('deleteTag mutation', () => {
  let db: ReturnType<typeof freshDb>
  beforeEach(() => {
    db = freshDb()
    db.prepare(`INSERT INTO tags (id, user_id, name) VALUES ('t1','u1','tech')`).run()
    db.prepare(`INSERT INTO items (id, user_id, url, title, domain) VALUES ('i1','u1','https://a.com','A','a.com')`).run()
    db.prepare(`INSERT INTO item_tags (item_id, tag_id) VALUES ('i1','t1')`).run()
  })

  it('removes item_tags rows', () => {
    db.prepare(`DELETE FROM item_tags WHERE tag_id = ?`).run('t1')
    db.prepare(`DELETE FROM tags WHERE id = ?`).run('t1')
    expect((db.prepare(`SELECT COUNT(*) as n FROM item_tags`).get() as any).n).toBe(0)
  })

  it('removes tag row', () => {
    db.prepare(`DELETE FROM item_tags WHERE tag_id = ?`).run('t1')
    db.prepare(`DELETE FROM tags WHERE id = ?`).run('t1')
    expect((db.prepare(`SELECT COUNT(*) as n FROM tags`).get() as any).n).toBe(0)
  })

  it('leaves item intact after tag delete', () => {
    db.prepare(`DELETE FROM item_tags WHERE tag_id = ?`).run('t1')
    db.prepare(`DELETE FROM tags WHERE id = ?`).run('t1')
    expect((db.prepare(`SELECT COUNT(*) as n FROM items`).get() as any).n).toBe(1)
  })
})
