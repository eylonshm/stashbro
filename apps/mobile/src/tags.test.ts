import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { MIGRATIONS } from './db/schema.js'
import { SQLiteLocalStore } from './sync/SQLiteLocalStore.js'
import type { SyncDb, CursorStorage } from './sync/SQLiteLocalStore.js'
import { deleteTagLocal } from './lib/tags.js'

// --- helpers (mirror SQLiteLocalStore.test.ts pattern) ---

function freshDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const sql of MIGRATIONS) db.exec(sql)
  return db
}

function makeSyncDb(db: Database.Database): SyncDb {
  return {
    queryAll: (sql, params) => db.prepare(sql).all(...params) as any[],
    queryOne: (sql, params) => db.prepare(sql).get(...params) as any ?? undefined,
    run: (sql, params) => { db.prepare(sql).run(...params) },
    transaction: (fn) => db.transaction(fn)(),
  }
}

function makeCursorStorage(): CursorStorage {
  const m = new Map<string, string>()
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => { m.set(k, v) } }
}

function makeStore(db: Database.Database, userId = 'u1') {
  return new SQLiteLocalStore(makeSyncDb(db), makeCursorStorage(), userId)
}

// --- tag list query (SQL string tests) ---

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

// --- deleteTagLocal (coordinator-specified scenario) ---

describe('deleteTagLocal', () => {
  it('[A,B] delete A → getChangesSince sees item with bumped change_seq and tag_names=[B]; tag A gone', async () => {
    const db = freshDb()
    const syncDb = makeSyncDb(db)
    const store = makeStore(db)

    db.prepare(`INSERT INTO items (id, user_id, url, title, domain, change_seq) VALUES ('i1','u1','https://x.com','X','x.com',5)`).run()
    db.prepare(`INSERT INTO tags (id, user_id, name) VALUES ('tA','u1','A')`).run()
    db.prepare(`INSERT INTO tags (id, user_id, name) VALUES ('tB','u1','B')`).run()
    db.prepare(`INSERT INTO item_tags (item_id, tag_id) VALUES ('i1','tA')`).run()
    db.prepare(`INSERT INTO item_tags (item_id, tag_id) VALUES ('i1','tB')`).run()

    const cursorBefore = 5
    deleteTagLocal(syncDb, store, 'tA')

    const changes = await store.getChangesSince(cursorBefore)
    expect(changes).toHaveLength(1)
    expect(changes[0]!.id).toBe('i1')
    expect(changes[0]!.change_seq).toBeGreaterThan(cursorBefore)
    expect(changes[0]!.tag_names).toEqual(['B'])

    expect(db.prepare(`SELECT id FROM tags WHERE id = 'tA'`).get()).toBeUndefined()
    expect(db.prepare(`SELECT id FROM tags WHERE id = 'tB'`).get()).toBeDefined()
  })

  it('deletes orphaned tag when no items reference it', () => {
    const db = freshDb()
    const syncDb = makeSyncDb(db)
    const store = makeStore(db)

    db.prepare(`INSERT INTO tags (id, user_id, name) VALUES ('tA','u1','A')`).run()
    deleteTagLocal(syncDb, store, 'tA')

    expect(db.prepare(`SELECT id FROM tags WHERE id = 'tA'`).get()).toBeUndefined()
  })

  it('item_tags after delete: only B remains for the item', () => {
    const db = freshDb()
    const syncDb = makeSyncDb(db)
    const store = makeStore(db)

    db.prepare(`INSERT INTO items (id, user_id, url, title, domain, change_seq) VALUES ('i1','u1','https://x.com','X','x.com',1)`).run()
    db.prepare(`INSERT INTO tags (id, user_id, name) VALUES ('tA','u1','A')`).run()
    db.prepare(`INSERT INTO tags (id, user_id, name) VALUES ('tB','u1','B')`).run()
    db.prepare(`INSERT INTO item_tags (item_id, tag_id) VALUES ('i1','tA')`).run()
    db.prepare(`INSERT INTO item_tags (item_id, tag_id) VALUES ('i1','tB')`).run()

    deleteTagLocal(syncDb, store, 'tA')

    const rows = db.prepare(`SELECT tag_id FROM item_tags WHERE item_id = 'i1'`).all() as Array<{ tag_id: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tag_id).not.toBe('tA')
  })
})
