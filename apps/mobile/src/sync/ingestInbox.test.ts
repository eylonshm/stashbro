import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as nodefs } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { MIGRATIONS } from '../db/schema.js'
import { SQLiteLocalStore, type SyncDb, type CursorStorage } from './SQLiteLocalStore.js'
import { ingestShareExtensionInbox, type InboxFS } from './ingestInbox.js'

// --- test infrastructure ---

function freshDb(): Database.Database {
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
  const store = new Map<string, string>()
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, val) => { store.set(key, val) },
  }
}

function makeStore(db: Database.Database, userId = 'u1'): SQLiteLocalStore {
  return new SQLiteLocalStore(makeSyncDb(db), makeCursorStorage(), userId)
}

// node:fs-backed InboxFS for headless tests
function makeNodeInboxFS(): InboxFS {
  return {
    exists: async (p) => { try { await nodefs.access(p); return true } catch { return false } },
    listFiles: (dir) => nodefs.readdir(dir),
    readFile: (p) => nodefs.readFile(p, 'utf8'),
    deleteFile: (p) => nodefs.unlink(p),
  }
}

function validPayload(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    id: crypto.randomUUID(), url: 'https://example.com', title: 'Test',
    domain: 'example.com', type: 'article', priority: 'medium',
    createdAt: new Date().toISOString(), ...overrides,
  }
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await nodefs.mkdtemp(path.join(os.tmpdir(), 'stashbro-inbox-test-'))
})

afterEach(async () => {
  await nodefs.rm(tmpDir, { recursive: true, force: true })
})

// --- tests ---

describe('ingestShareExtensionInbox', () => {
  it('returns 0 when inbox dir does not exist', async () => {
    const db = freshDb()
    const store = makeStore(db)
    const count = await ingestShareExtensionInbox(store, `${tmpDir}/nonexistent`, makeNodeInboxFS())
    expect(count).toBe(0)
  })

  it('success: saves item with bumped change_seq and deletes file', async () => {
    const db = freshDb()
    const store = makeStore(db)
    const payload = validPayload()
    await nodefs.writeFile(path.join(tmpDir, `${payload['id']}.json`), JSON.stringify(payload))

    const count = await ingestShareExtensionInbox(store, tmpDir, makeNodeInboxFS())

    expect(count).toBe(1)
    // item saved with MAX+1 change_seq
    const row = db.prepare(`SELECT change_seq, url, status FROM items WHERE id=?`).get(payload['id']) as any
    expect(row).toBeTruthy()
    expect(row.change_seq).toBe(1)  // MAX(0)+1
    expect(row.status).toBe('unread')
    // file deleted
    const files = await nodefs.readdir(tmpDir)
    expect(files).toHaveLength(0)
  })

  it('success: ingested item appears in getChangesSince (sync-eligible)', async () => {
    const db = freshDb()
    const store = makeStore(db)
    const payload = validPayload()
    await nodefs.writeFile(path.join(tmpDir, `${payload['id']}.json`), JSON.stringify(payload))

    await ingestShareExtensionInbox(store, tmpDir, makeNodeInboxFS())

    const changes = await store.getChangesSince(0)
    expect(changes.map(c => c.id)).toContain(payload['id'])
  })

  it('malformed JSON: deletes file, does not insert item', async () => {
    const db = freshDb()
    const store = makeStore(db)
    await nodefs.writeFile(path.join(tmpDir, 'bad.json'), '{not valid json')

    const count = await ingestShareExtensionInbox(store, tmpDir, makeNodeInboxFS())

    expect(count).toBe(0)
    const files = await nodefs.readdir(tmpDir)
    expect(files).toHaveLength(0)  // deleted
    const rows = db.prepare(`SELECT COUNT(*) as n FROM items`).get() as any
    expect(rows.n).toBe(0)
  })

  it('malformed shape (missing required field): deletes file', async () => {
    const db = freshDb()
    const store = makeStore(db)
    const partial = { id: crypto.randomUUID(), url: 'https://example.com' }  // missing type, priority, etc.
    await nodefs.writeFile(path.join(tmpDir, `${partial.id}.json`), JSON.stringify(partial))

    const count = await ingestShareExtensionInbox(store, tmpDir, makeNodeInboxFS())

    expect(count).toBe(0)
    const files = await nodefs.readdir(tmpDir)
    expect(files).toHaveLength(0)
  })

  it('DB error: keeps file for retry, does not count as ingested', async () => {
    const db = freshDb()
    const payload = validPayload()
    await nodefs.writeFile(path.join(tmpDir, `${payload['id']}.json`), JSON.stringify(payload))

    // Make saveLocalItem throw by closing the DB before ingest
    const store = makeStore(db)
    db.close()

    const count = await ingestShareExtensionInbox(store, tmpDir, makeNodeInboxFS())

    expect(count).toBe(0)
    // file kept for retry
    const files = await nodefs.readdir(tmpDir)
    expect(files).toHaveLength(1)
  })

  it('processes multiple files; success+malformed mix', async () => {
    const db = freshDb()
    const store = makeStore(db)
    const good = validPayload()
    await nodefs.writeFile(path.join(tmpDir, `${good['id']}.json`), JSON.stringify(good))
    await nodefs.writeFile(path.join(tmpDir, 'corrupt.json'), 'not-json')

    const count = await ingestShareExtensionInbox(store, tmpDir, makeNodeInboxFS())

    expect(count).toBe(1)
    const files = await nodefs.readdir(tmpDir)
    expect(files).toHaveLength(0)  // both deleted (good→success, corrupt→malformed)
  })

  it('ignores non-.json files', async () => {
    const db = freshDb()
    const store = makeStore(db)
    await nodefs.writeFile(path.join(tmpDir, 'readme.txt'), 'hello')

    const count = await ingestShareExtensionInbox(store, tmpDir, makeNodeInboxFS())

    expect(count).toBe(0)
    const files = await nodefs.readdir(tmpDir)
    expect(files).toHaveLength(1)  // .txt file untouched
  })

  it('uses userId from store (carry-forward: no hardcoded "default")', async () => {
    const db = freshDb()
    const userId = 'real-user-abc'
    const store = makeStore(db, userId)
    const payload = validPayload()
    await nodefs.writeFile(path.join(tmpDir, `${payload['id']}.json`), JSON.stringify(payload))

    await ingestShareExtensionInbox(store, tmpDir, makeNodeInboxFS())

    const row = db.prepare(`SELECT user_id FROM items WHERE id=?`).get(payload['id']) as any
    expect(row.user_id).toBe(userId)
  })
})
