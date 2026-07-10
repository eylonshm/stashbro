import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import { sql } from 'drizzle-orm'

export type AppDb = ReturnType<typeof getDb>

export function getDb(path = process.env['DB_PATH'] ?? '/data/stashbro.db') {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  // ponytail: inline DDL instead of migration runner - simple enough for SQLite, add drizzle-kit push if schema gets complex
  // WARNING: this DDL (with CHECK constraints) is the source of truth. Do NOT use `drizzle-kit push` - it strips CHECK constraints and will diverge.
  db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE
    )
  `)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      thumbnail_url TEXT,
      favicon_url TEXT,
      domain TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'article' CHECK(type IN ('video','post','article','other')),
      status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','archived')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      deleted_at TEXT,
      change_seq INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.run(sql`CREATE INDEX IF NOT EXISTS items_user_seq ON items(user_id, change_seq)`)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      UNIQUE(user_id, name)
    )
  `)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS item_tags (
      item_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (item_id, tag_id)
    )
  `)

  return db
}
