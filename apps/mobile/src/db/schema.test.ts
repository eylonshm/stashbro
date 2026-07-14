import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import { MIGRATIONS } from './schema.js'

describe('MIGRATIONS (string assertions)', () => {
  const sql = MIGRATIONS.join('\n')

  it('items table has required NOT NULL columns', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS items')
    expect(sql).toContain('user_id TEXT NOT NULL')
    expect(sql).toContain('url TEXT NOT NULL')
    expect(sql).toContain('title TEXT NOT NULL')
    expect(sql).toContain('domain TEXT NOT NULL')
    expect(sql).toContain('change_seq')
    expect(sql).toContain('priority')
    expect(sql).toContain('deleted_at')
  })

  it('items has ISO timestamp defaults', () => {
    expect(sql).toContain("created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
    expect(sql).toContain("updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
  })

  it('items has CHECK enums for type/status/priority', () => {
    expect(sql).toContain("CHECK(type IN ('video','post','article','other'))")
    expect(sql).toContain("CHECK(status IN ('unread','read','archived'))")
    expect(sql).toContain("CHECK(priority IN ('low','medium','high'))")
  })

  it('items_user_seq index exists', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS items_user_seq ON items(user_id, change_seq)')
  })

  it('tags table has unique constraint', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS tags')
    expect(sql).toContain('UNIQUE(user_id, name)')
  })

  it('item_tags has composite PK and FK cascades', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS item_tags')
    expect(sql).toContain('PRIMARY KEY (item_id, tag_id)')
    expect(sql).toContain('FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE')
    expect(sql).toContain('FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE')
  })
})

describe('MIGRATIONS (functional - better-sqlite3)', () => {
  function freshDb() {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    for (const sql of MIGRATIONS) db.exec(sql)
    return db
  }

  it('insert omitting timestamps gets ISO defaults', () => {
    const db = freshDb()
    db.prepare(
      `INSERT INTO items (id, user_id, url, title, domain) VALUES ('i1','u1','https://x.com','X','x.com')`
    ).run()
    const row = db.prepare(`SELECT created_at, updated_at FROM items WHERE id='i1'`).get() as any
    // ISO-8601 with T and Z
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/)
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/)
  })

  it('deleting item cascades to item_tags', () => {
    const db = freshDb()
    db.prepare(`INSERT INTO items (id, user_id, url, title, domain) VALUES ('i1','u1','https://x.com','X','x.com')`).run()
    db.prepare(`INSERT INTO tags (id, user_id, name) VALUES ('t1','u1','tech')`).run()
    db.prepare(`INSERT INTO item_tags (item_id, tag_id) VALUES ('i1','t1')`).run()
    expect((db.prepare(`SELECT COUNT(*) as n FROM item_tags`).get() as any).n).toBe(1)
    db.prepare(`DELETE FROM items WHERE id='i1'`).run()
    expect((db.prepare(`SELECT COUNT(*) as n FROM item_tags`).get() as any).n).toBe(0)
  })
})
