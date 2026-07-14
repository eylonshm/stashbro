export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    favicon_url TEXT,
    domain TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'article' CHECK(type IN ('video','post','article','other')),
    status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read','archived')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at TEXT,
    change_seq INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS items_user_seq ON items(user_id, change_seq)`,
  `CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(user_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS item_tags (
    item_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (item_id, tag_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  )`,
]
