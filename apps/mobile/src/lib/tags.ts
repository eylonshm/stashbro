import type { SyncDb } from '../sync/SQLiteLocalStore.js'
import { SQLiteLocalStore } from '../sync/SQLiteLocalStore.js'

type ItemFields = {
  id: string; url: string; title: string; description: string | null
  thumbnail_url: string | null; favicon_url: string | null; domain: string
  type: string; status: string; priority: string; deleted_at: string | null
}

// Deletes a tag by re-saving each affected item with updated tag_names (minus this tag),
// which bumps change_seq so the change propagates on next sync.
// Wrapped in a single transaction for atomicity.
export function deleteTagLocal(db: SyncDb, store: SQLiteLocalStore, tagId: string): void {
  const now = new Date().toISOString()
  db.transaction(() => {
    const affected = db.queryAll<{ item_id: string }>(
      'SELECT item_id FROM item_tags WHERE tag_id = ?', [tagId]
    )
    for (const { item_id } of affected) {
      const item = db.queryOne<ItemFields>(
        'SELECT id,url,title,description,thumbnail_url,favicon_url,domain,type,status,priority,deleted_at FROM items WHERE id = ?',
        [item_id]
      )
      if (!item) continue
      const remaining = db.queryAll<{ name: string }>(
        'SELECT t.name FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ? AND it.tag_id != ?',
        [item_id, tagId]
      ).map(r => r.name)
      store.saveLocalItem({ ...item, tag_names: remaining, updated_at: now })
    }
    // item_tags rows for this tag are now gone (saveLocalItem rewrote them).
    // Delete the orphaned tag row.
    db.run('DELETE FROM tags WHERE id = ?', [tagId])
  })
}
