import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import type { SyncChange } from '@stashbro/shared'
import { shouldApplyChange, cursorFromChanges, SQLiteLocalStore } from './SQLiteLocalStore'
import type { SyncDb, CursorStorage } from './SQLiteLocalStore'
import { MIGRATIONS } from '../db/schema'

// --- helpers ---

function makeChange(overrides: Partial<SyncChange> = {}): SyncChange {
  return {
    id: 'item-1', change_seq: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z', deleted_at: null,
    url: 'https://example.com', title: 'Test', description: null,
    thumbnail_url: null, favicon_url: null, domain: 'example.com',
    type: 'article', status: 'unread', priority: 'medium', tag_names: [],
    ...overrides,
  }
}

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const sql of MIGRATIONS) db.exec(sql)
  return db
}

// Adapter: better-sqlite3 → SyncDb
function makeSyncDb(db: Database.Database): SyncDb {
  return {
    queryAll: (sql, params) => db.prepare(sql).all(...params) as any[],
    queryOne: (sql, params) => db.prepare(sql).get(...params) as any ?? undefined,
    run: (sql, params) => { db.prepare(sql).run(...params) },
    transaction: (fn) => db.transaction(fn)(),
  }
}

// In-memory cursor storage for tests
function makeCursorStorage(): CursorStorage {
  const store = new Map<string, string>()
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, val) => { store.set(key, val) },
  }
}

function makeStore(db: Database.Database, userId = 'u1') {
  return new SQLiteLocalStore(makeSyncDb(db), makeCursorStorage(), userId)
}

// --- unit tests (brief-specified) ---

describe('shouldApplyChange', () => {
  it('applies change when no existing item', () => {
    expect(shouldApplyChange(makeChange(), null)).toBe(true)
  })
  it('applies when incoming is newer', () => {
    expect(shouldApplyChange(makeChange({ updated_at: '2026-01-02T00:00:00.000Z' }), '2026-01-01T00:00:00.000Z')).toBe(true)
  })
  it('skips when existing is newer', () => {
    expect(shouldApplyChange(makeChange({ updated_at: '2026-01-01T00:00:00.000Z' }), '2026-01-03T00:00:00.000Z')).toBe(false)
  })
  it('applies on tie - server wins', () => {
    expect(shouldApplyChange(makeChange({ updated_at: '2026-01-02T00:00:00.000Z' }), '2026-01-02T00:00:00.000Z')).toBe(true)
  })
})

describe('cursorFromChanges', () => {
  it('returns max change_seq', () => {
    const changes = [makeChange({ change_seq: 3 }), makeChange({ change_seq: 7 }), makeChange({ change_seq: 2 })]
    expect(cursorFromChanges(changes)).toBe(7)
  })
  it('returns 0 for empty', () => {
    expect(cursorFromChanges([])).toBe(0)
  })
})

// --- functional tests against better-sqlite3 ---

describe('getChangesSince', () => {
  it('returns only items with change_seq > cursor', async () => {
    const db = freshDb()
    const store = makeStore(db)
    db.prepare(
      `INSERT INTO items (id,user_id,url,title,domain,change_seq,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)`
    ).run('i1', 'u1', 'https://a.com', 'A', 'a.com', 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    db.prepare(
      `INSERT INTO items (id,user_id,url,title,domain,change_seq,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)`
    ).run('i2', 'u1', 'https://b.com', 'B', 'b.com', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')

    const changes = await store.getChangesSince(5)
    expect(changes.map(c => c.id)).toEqual(['i2'])
  })

  it('includes tag_names', async () => {
    const db = freshDb()
    const store = makeStore(db)
    db.prepare(`INSERT INTO items (id,user_id,url,title,domain,change_seq,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('i1', 'u1', 'https://a.com', 'A', 'a.com', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    db.prepare(`INSERT INTO tags (id,user_id,name) VALUES (?,?,?)`).run('t1', 'u1', 'tech')
    db.prepare(`INSERT INTO item_tags (item_id,tag_id) VALUES (?,?)`).run('i1', 't1')

    const changes = await store.getChangesSince(0)
    expect(changes[0]?.tag_names).toEqual(['tech'])
  })

  it('excludes items of other users', async () => {
    const db = freshDb()
    const store = makeStore(db, 'u1')
    db.prepare(`INSERT INTO items (id,user_id,url,title,domain,change_seq,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('i1', 'u2', 'https://a.com', 'A', 'a.com', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    const changes = await store.getChangesSince(0)
    expect(changes).toHaveLength(0)
  })
})

describe('applyChanges - LWW', () => {
  it('inserts new item (server-newer)', async () => {
    const db = freshDb()
    const store = makeStore(db)
    await store.applyChanges([makeChange({ id: 'i1', change_seq: 3 })])
    const row = db.prepare(`SELECT * FROM items WHERE id='i1'`).get() as any
    expect(row).toBeTruthy()
    expect(row.change_seq).toBe(3)  // server's seq preserved
  })

  it('updates when server is newer', async () => {
    const db = freshDb()
    const store = makeStore(db)
    db.prepare(`INSERT INTO items (id,user_id,url,title,domain,change_seq,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('i1', 'u1', 'https://old.com', 'Old', 'old.com', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    await store.applyChanges([makeChange({ id: 'i1', change_seq: 5, updated_at: '2026-01-03T00:00:00.000Z', title: 'New' })])
    const row = db.prepare(`SELECT title, change_seq FROM items WHERE id='i1'`).get() as any
    expect(row.title).toBe('New')
    expect(row.change_seq).toBe(5)  // server's seq preserved
  })

  it('skips when local is strictly newer', async () => {
    const db = freshDb()
    const store = makeStore(db)
    db.prepare(`INSERT INTO items (id,user_id,url,title,domain,change_seq,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('i1', 'u1', 'https://new.com', 'Local', 'new.com', 10, '2026-01-05T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    await store.applyChanges([makeChange({ id: 'i1', updated_at: '2026-01-01T00:00:00.000Z', title: 'Old Server' })])
    const row = db.prepare(`SELECT title FROM items WHERE id='i1'`).get() as any
    expect(row.title).toBe('Local')
  })

  it('applies on tie - server wins', async () => {
    const db = freshDb()
    const store = makeStore(db)
    const ts = '2026-01-02T00:00:00.000Z'
    db.prepare(`INSERT INTO items (id,user_id,url,title,domain,change_seq,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('i1', 'u1', 'https://old.com', 'Local', 'old.com', 1, ts, '2026-01-01T00:00:00.000Z')
    await store.applyChanges([makeChange({ id: 'i1', updated_at: ts, title: 'Server' })])
    const row = db.prepare(`SELECT title FROM items WHERE id='i1'`).get() as any
    expect(row.title).toBe('Server')
  })

  it('applies tombstone (deleted_at set)', async () => {
    const db = freshDb()
    const store = makeStore(db)
    await store.applyChanges([makeChange({ id: 'i1', deleted_at: '2026-01-03T00:00:00.000Z' })])
    const row = db.prepare(`SELECT deleted_at FROM items WHERE id='i1'`).get() as any
    expect(row.deleted_at).toBe('2026-01-03T00:00:00.000Z')
  })

  it('replaces tags on apply', async () => {
    const db = freshDb()
    const store = makeStore(db)
    db.prepare(`INSERT INTO items (id,user_id,url,title,domain,change_seq,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('i1', 'u1', 'https://a.com', 'A', 'a.com', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    db.prepare(`INSERT INTO tags (id,user_id,name) VALUES (?,?,?)`).run('t1', 'u1', 'old-tag')
    db.prepare(`INSERT INTO item_tags (item_id,tag_id) VALUES (?,?)`).run('i1', 't1')

    await store.applyChanges([makeChange({
      id: 'i1', updated_at: '2026-01-02T00:00:00.000Z', tag_names: ['new-tag'],
    })])

    const tags = db.prepare(
      `SELECT t.name FROM tags t JOIN item_tags it ON it.tag_id=t.id WHERE it.item_id='i1'`
    ).all() as any[]
    expect(tags.map(r => r.name)).toEqual(['new-tag'])
  })

  it('rolls back entire batch on failure - no partial tag state', async () => {
    const db = freshDb()
    // inject a SyncDb whose transaction wraps but the second change throws mid-apply
    const base = makeSyncDb(db)
    let callCount = 0
    const faultySyncDb: SyncDb = {
      ...base,
      run: (sql, params) => {
        // Throw on the second item_tags insert to simulate crash mid-batch
        if (sql.includes('item_tags') && sql.startsWith('INSERT') && ++callCount === 2) throw new Error('crash')
        base.run(sql, params)
      },
    }
    const store = new SQLiteLocalStore(faultySyncDb, makeCursorStorage(), 'u1')
    const changes = [
      makeChange({ id: 'i1', tag_names: ['tag-a'] }),
      makeChange({ id: 'i2', tag_names: ['tag-b'] }),
    ]
    await expect(store.applyChanges(changes)).rejects.toThrow('crash')
    // transaction rolled back - neither item should exist
    const count = (db.prepare(`SELECT COUNT(*) as n FROM items`).get() as any).n
    expect(count).toBe(0)
  })

  it('server-applied items not re-pushed (change_seq <= cursor after setCursor)', async () => {
    const db = freshDb()
    const store = makeStore(db)
    const change = makeChange({ id: 'i1', change_seq: 10 })
    await store.applyChanges([change])
    await store.setCursor(10)

    const repush = await store.getChangesSince(10)
    expect(repush).toHaveLength(0)  // change_seq=10, cursor=10, nothing with > 10
  })
})

describe('saveLocalItem - MAX+1 seq allocation', () => {
  it('assigns MAX(change_seq)+1 for first item', async () => {
    const db = freshDb()
    const store = makeStore(db)
    store.saveLocalItem({
      id: 'i1', url: 'https://a.com', title: 'A', description: null,
      thumbnail_url: null, favicon_url: null, domain: 'a.com',
      type: 'article', status: 'unread', priority: 'medium',
      updated_at: new Date().toISOString(), deleted_at: null, tag_names: [],
    })
    const row = db.prepare(`SELECT change_seq FROM items WHERE id='i1'`).get() as any
    expect(row.change_seq).toBe(1)
  })

  it('assigns MAX+1 when items already exist', async () => {
    const db = freshDb()
    const store = makeStore(db)
    db.prepare(`INSERT INTO items (id,user_id,url,title,domain,change_seq,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('existing', 'u1', 'https://e.com', 'E', 'e.com', 7, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    store.saveLocalItem({
      id: 'i2', url: 'https://b.com', title: 'B', description: null,
      thumbnail_url: null, favicon_url: null, domain: 'b.com',
      type: 'article', status: 'unread', priority: 'medium',
      updated_at: new Date().toISOString(), deleted_at: null, tag_names: [],
    })
    const row = db.prepare(`SELECT change_seq FROM items WHERE id='i2'`).get() as any
    expect(row.change_seq).toBe(8)
  })

  it('locally-saved item appears in getChangesSince after cursor', async () => {
    const db = freshDb()
    const store = makeStore(db)
    store.saveLocalItem({
      id: 'i1', url: 'https://a.com', title: 'A', description: null,
      thumbnail_url: null, favicon_url: null, domain: 'a.com',
      type: 'article', status: 'unread', priority: 'medium',
      updated_at: new Date().toISOString(), deleted_at: null, tag_names: [],
    })
    const changes = await store.getChangesSince(0)
    expect(changes.map(c => c.id)).toContain('i1')
  })
})

describe('cursor - keyed per user', () => {
  it('getCursor returns 0 before set', async () => {
    const store = makeStore(freshDb(), 'u1')
    expect(await store.getCursor()).toBe(0)
  })

  it('setCursor/getCursor round-trips', async () => {
    const store = makeStore(freshDb(), 'u1')
    await store.setCursor(42)
    expect(await store.getCursor()).toBe(42)
  })

  it('cursor is isolated per userId', async () => {
    const db = freshDb()
    const storage = makeCursorStorage()
    const storeA = new SQLiteLocalStore(makeSyncDb(db), storage, 'u1')
    const storeB = new SQLiteLocalStore(makeSyncDb(db), storage, 'u2')
    await storeA.setCursor(100)
    expect(await storeB.getCursor()).toBe(0)
  })
})

describe('archive mutation (MAX+1 seq - mirrors index.tsx archive callback)', () => {
  it('archived item appears in getChangesSince with bumped change_seq', async () => {
    const db = freshDb()
    const store = makeStore(db)
    db.prepare(`INSERT INTO items (id,user_id,url,title,domain,change_seq,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run('i1', 'u1', 'https://a.com', 'A', 'a.com', 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    await store.setCursor(5)

    // Simulate the archive mutation: MAX+1 seq allocation (same logic as archive in index.tsx)
    const maxSeq = (db.prepare('SELECT MAX(change_seq) as seq FROM items').get() as any).seq + 1
    db.prepare('UPDATE items SET status=?, updated_at=?, change_seq=? WHERE id=?')
      .run('archived', new Date().toISOString(), maxSeq, 'i1')

    const changes = await store.getChangesSince(5)
    expect(changes).toHaveLength(1)
    expect(changes[0]?.id).toBe('i1')
    expect(changes[0]?.status).toBe('archived')
    expect(changes[0]?.change_seq).toBe(6)
  })
})
