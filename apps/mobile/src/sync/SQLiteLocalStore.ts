import type { LocalStore, SyncChange } from '@stashbro/shared'

// Minimal synchronous DB abstraction - allows headless testing via better-sqlite3
// ponytail: thin interface, one impl per env (expo-sqlite in prod, better-sqlite3 in test)
export interface SyncDb {
  queryAll<T>(sql: string, params: unknown[]): T[]
  queryOne<T>(sql: string, params: unknown[]): T | undefined
  run(sql: string, params: unknown[]): void
  transaction(fn: () => void): void
}

// Cursor storage abstraction - allows headless testing without AsyncStorage
export interface CursorStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

// --- pure helpers (exported for unit testing) ---

export function shouldApplyChange(change: SyncChange, existingUpdatedAt: string | null): boolean {
  if (!existingUpdatedAt) return true
  // LWW: server wins on tie - skip only if local is STRICTLY newer
  return change.updated_at >= existingUpdatedAt
}

export function cursorFromChanges(changes: SyncChange[]): number {
  return changes.reduce((max, c) => Math.max(max, c.change_seq), 0)
}

// --- store ---

// Normalize a server URL into a stable key fragment (host[:port], no scheme/slash).
export function serverTag(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '') || 'default'
}

export class SQLiteLocalStore implements LocalStore {
  private db: SyncDb
  private storage: CursorStorage
  private userId: string
  private server: string

  constructor(db: SyncDb, storage: CursorStorage, userId: string, serverUrl = '') {
    this.db = db
    this.storage = storage
    this.userId = userId
    this.server = serverTag(serverUrl)
  }

  // Cursor key is per-user AND per-server: switching servers (or the first sync after
  // this fix ships) starts from 0 -> a full resync -> no cross-server cursor bleed.
  private cursorKey(): string {
    return `stashbro:sync:cursor:${this.userId}:${this.server}`
  }

  async getChangesSince(cursor: number): Promise<SyncChange[]> {
    const rows = this.db.queryAll<{
      id: string; change_seq: number; created_at: string; updated_at: string; deleted_at: string | null
      url: string; title: string; description: string | null; thumbnail_url: string | null
      favicon_url: string | null; domain: string; type: string; status: string; priority: string
    }>('SELECT id,change_seq,created_at,updated_at,deleted_at,url,title,description,thumbnail_url,favicon_url,domain,type,status,priority FROM items WHERE user_id = ? AND change_seq > ? ORDER BY change_seq ASC', [this.userId, cursor])

    return rows.map(row => {
      const tagRows = this.db.queryAll<{ name: string }>(
        'SELECT t.name FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ?', [row.id]
      )
      return {
        id: row.id, change_seq: row.change_seq,
        created_at: row.created_at, updated_at: row.updated_at, deleted_at: row.deleted_at,
        url: row.url, title: row.title, description: row.description,
        thumbnail_url: row.thumbnail_url, favicon_url: row.favicon_url, domain: row.domain,
        type: row.type as SyncChange['type'],
        status: row.status as SyncChange['status'],
        priority: row.priority as SyncChange['priority'],
        tag_names: tagRows.map(t => t.name),
      }
    })
  }

  async applyChanges(changes: SyncChange[]): Promise<void> {
    this.db.transaction(() => {
      for (const change of changes) {
        const existing = this.db.queryOne<{ updated_at: string; created_at: string }>(
          'SELECT updated_at, created_at FROM items WHERE id = ? AND user_id = ?', [change.id, this.userId]
        )
        if (!shouldApplyChange(change, existing?.updated_at ?? null)) continue

        // Preserve server's change_seq so these items stay <= newCursor and are never re-pushed
        if (existing) {
          this.db.run(
            'UPDATE items SET url=?,title=?,description=?,thumbnail_url=?,favicon_url=?,domain=?,type=?,status=?,priority=?,updated_at=?,deleted_at=?,change_seq=? WHERE id=?',
            [change.url, change.title, change.description, change.thumbnail_url, change.favicon_url,
             change.domain, change.type, change.status, change.priority, change.updated_at,
             change.deleted_at, change.change_seq, change.id]
          )
        } else {
          this.db.run(
            'INSERT INTO items(id,user_id,url,title,description,thumbnail_url,favicon_url,domain,type,status,priority,created_at,updated_at,deleted_at,change_seq) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [change.id, this.userId, change.url, change.title, change.description, change.thumbnail_url,
             change.favicon_url, change.domain, change.type, change.status, change.priority,
             change.created_at, change.updated_at, change.deleted_at, change.change_seq]
          )
        }

        this.upsertTags(change.id, change.tag_names)
      }
    })
  }

  // Returns the first item matching url for this user (any status, including soft-deleted).
  // Used by ingestShareExtensionInbox for URL dedup.
  findByUrl(url: string): { id: string; title: string; description: string | null; thumbnail_url: string | null; favicon_url: string | null; domain: string; type: string; priority: string; tag_names: string[] } | undefined {
    const row = this.db.queryOne<{ id: string; title: string; description: string | null; thumbnail_url: string | null; favicon_url: string | null; domain: string; type: string; priority: string }>(
      'SELECT id,title,description,thumbnail_url,favicon_url,domain,type,priority FROM items WHERE user_id = ? AND url = ? LIMIT 1',
      [this.userId, url]
    )
    if (!row) return undefined
    const tagRows = this.db.queryAll<{ name: string }>(
      'SELECT t.name FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ?', [row.id]
    )
    return { ...row, tag_names: tagRows.map(t => t.name) }
  }

  // Local-origin write: allocates MAX(change_seq)+1 so item appears in next getChangesSince
  // Not on LocalStore interface - used by mobile UI layer for user-created items
  saveLocalItem(item: {
    id: string; url: string; title: string; description: string | null
    thumbnail_url: string | null; favicon_url: string | null; domain: string
    type: string; status: string; priority: string
    updated_at: string; deleted_at: string | null; tag_names: string[]
  }): void {
    const maxRow = this.db.queryOne<{ seq: number | null }>(
      'SELECT MAX(change_seq) as seq FROM items WHERE user_id = ?', [this.userId]
    )
    const nextSeq = (maxRow?.seq ?? 0) + 1
    const now = new Date().toISOString()

    const existing = this.db.queryOne<{ created_at: string }>(
      'SELECT created_at FROM items WHERE id = ?', [item.id]
    )

    if (existing) {
      this.db.run(
        'UPDATE items SET url=?,title=?,description=?,thumbnail_url=?,favicon_url=?,domain=?,type=?,status=?,priority=?,updated_at=?,deleted_at=?,change_seq=? WHERE id=?',
        [item.url, item.title, item.description, item.thumbnail_url, item.favicon_url,
         item.domain, item.type, item.status, item.priority, item.updated_at,
         item.deleted_at, nextSeq, item.id]
      )
    } else {
      this.db.run(
        'INSERT INTO items(id,user_id,url,title,description,thumbnail_url,favicon_url,domain,type,status,priority,created_at,updated_at,deleted_at,change_seq) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [item.id, this.userId, item.url, item.title, item.description, item.thumbnail_url,
         item.favicon_url, item.domain, item.type, item.status, item.priority, now,
         item.updated_at, item.deleted_at, nextSeq]
      )
    }

    this.upsertTags(item.id, item.tag_names)
  }

  async getCursor(): Promise<number> {
    const val = await this.storage.getItem(this.cursorKey())
    return val ? parseInt(val, 10) : 0
  }

  async setCursor(cursor: number): Promise<void> {
    await this.storage.setItem(this.cursorKey(), String(cursor))
  }

  private upsertTags(itemId: string, tagNames: string[]): void {
    this.db.run('DELETE FROM item_tags WHERE item_id = ?', [itemId])
    for (const name of tagNames) {
      let tag = this.db.queryOne<{ id: string }>(
        'SELECT id FROM tags WHERE user_id = ? AND name = ?', [this.userId, name]
      )
      if (!tag) {
        const tagId = crypto.randomUUID()
        this.db.run('INSERT INTO tags(id,user_id,name) VALUES(?,?,?)', [tagId, this.userId, name])
        tag = { id: tagId }
      }
      this.db.run('INSERT OR IGNORE INTO item_tags(item_id,tag_id) VALUES(?,?)', [itemId, tag.id])
    }
  }
}

// --- adapters ---

// Wraps expo-sqlite's synchronous API into SyncDb (used in production)
// ponytail: typed as 'any' since we can't import expo-sqlite in test env
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeExpoSyncDb(db: any): SyncDb {
  return {
    queryAll: (sql, params) => db.getAllSync(sql, params),
    queryOne: (sql, params) => db.getFirstSync(sql, params) ?? undefined,
    run: (sql, params) => db.runSync(sql, params),
    transaction: (fn) => db.withTransactionSync(fn),
  }
}
