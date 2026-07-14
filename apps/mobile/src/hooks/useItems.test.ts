import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import { buildItemsQuery } from './buildItemsQuery.js'
import { MIGRATIONS } from '../db/schema.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const sql of MIGRATIONS) db.exec(sql)
  return db
}

function insertItem(db: Database.Database, overrides: Record<string, unknown> = {}) {
  const defaults = {
    id: 'i1', user_id: 'u1', url: 'https://example.com', title: 'Test',
    domain: 'example.com', type: 'article', status: 'unread', priority: 'medium',
    change_seq: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
  db.prepare(
    `INSERT INTO items (id,user_id,url,title,domain,type,status,priority,change_seq,created_at,updated_at)
     VALUES (@id,@user_id,@url,@title,@domain,@type,@status,@priority,@change_seq,@created_at,@updated_at)`
  ).run(defaults)
  return defaults.id as string
}

function runQuery(db: Database.Database, filters: Parameters<typeof buildItemsQuery>[0]) {
  const { sql, params } = buildItemsQuery(filters)
  return db.prepare(sql).all(...params) as Array<Record<string, unknown>>
}

describe('buildItemsQuery', () => {
  it('returns unread items by default', () => {
    const db = freshDb()
    insertItem(db, { id: 'i1', status: 'unread' })
    insertItem(db, { id: 'i2', status: 'archived' })
    const rows = runQuery(db, {})
    expect(rows.map(r => r['id'])).toEqual(['i1'])
  })

  it('filters by type', () => {
    const db = freshDb()
    insertItem(db, { id: 'i1', type: 'video' })
    insertItem(db, { id: 'i2', type: 'article' })
    const rows = runQuery(db, { type: 'video' })
    expect(rows.map(r => r['id'])).toEqual(['i1'])
  })

  it('type=all returns all types', () => {
    const db = freshDb()
    insertItem(db, { id: 'i1', type: 'video', change_seq: 2 })
    insertItem(db, { id: 'i2', type: 'article', change_seq: 1 })
    const rows = runQuery(db, { type: 'all' })
    expect(rows).toHaveLength(2)
  })

  it('filters by priority', () => {
    const db = freshDb()
    insertItem(db, { id: 'i1', priority: 'high' })
    insertItem(db, { id: 'i2', priority: 'medium' })
    const rows = runQuery(db, { priority: 'high' })
    expect(rows.map(r => r['id'])).toEqual(['i1'])
  })

  it('search matches title', () => {
    const db = freshDb()
    insertItem(db, { id: 'i1', title: 'Hello World', change_seq: 2 })
    insertItem(db, { id: 'i2', title: 'Goodbye', change_seq: 1 })
    const rows = runQuery(db, { search: 'hello' })
    expect(rows.map(r => r['id'])).toEqual(['i1'])
  })

  it('search matches url', () => {
    const db = freshDb()
    insertItem(db, { id: 'i1', url: 'https://tech.example.com', title: 'T', change_seq: 1 })
    insertItem(db, { id: 'i2', url: 'https://news.example.com', title: 'N', change_seq: 2 })
    const rows = runQuery(db, { search: 'tech' })
    expect(rows.map(r => r['id'])).toEqual(['i1'])
  })

  it('filters by tag', () => {
    const db = freshDb()
    insertItem(db, { id: 'i1', change_seq: 2 })
    insertItem(db, { id: 'i2', change_seq: 1 })
    db.prepare(`INSERT INTO tags (id,user_id,name) VALUES ('t1','u1','tech')`).run()
    db.prepare(`INSERT INTO item_tags (item_id,tag_id) VALUES ('i1','t1')`).run()
    const rows = runQuery(db, { tag: 'tech' })
    expect(rows.map(r => r['id'])).toEqual(['i1'])
  })

  it('excludes soft-deleted items', () => {
    const db = freshDb()
    insertItem(db, { id: 'i1' })
    db.prepare(`UPDATE items SET deleted_at='2026-01-02T00:00:00.000Z' WHERE id='i1'`).run()
    const rows = runQuery(db, {})
    expect(rows).toHaveLength(0)
  })

  it('orders by change_seq DESC', () => {
    const db = freshDb()
    insertItem(db, { id: 'i1', change_seq: 1 })
    insertItem(db, { id: 'i2', change_seq: 3 })
    insertItem(db, { id: 'i3', change_seq: 2 })
    const rows = runQuery(db, {})
    expect(rows.map(r => r['id'])).toEqual(['i2', 'i3', 'i1'])
  })

  it('filters by read status', () => {
    const db = freshDb()
    insertItem(db, { id: 'i1', status: 'unread' })
    insertItem(db, { id: 'i2', status: 'read', change_seq: 2 })
    const rows = runQuery(db, { status: 'read' })
    expect(rows.map(r => r['id'])).toEqual(['i2'])
  })

  it('tag_list is comma-joined tag names', () => {
    const db = freshDb()
    insertItem(db, { id: 'i1' })
    db.prepare(`INSERT INTO tags (id,user_id,name) VALUES ('t1','u1','alpha'),('t2','u1','beta')`).run()
    db.prepare(`INSERT INTO item_tags (item_id,tag_id) VALUES ('i1','t1'),('i1','t2')`).run()
    const rows = runQuery(db, {})
    const tagList = (rows[0]?.['tag_list'] as string | null) ?? ''
    expect(tagList.split(',').sort()).toEqual(['alpha', 'beta'])
  })
})
