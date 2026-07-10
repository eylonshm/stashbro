import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
})

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  thumbnail_url: text('thumbnail_url'),
  favicon_url: text('favicon_url'),
  domain: text('domain').notNull(),
  type: text('type', { enum: ['video', 'post', 'article', 'other'] }).notNull().default('article'),
  status: text('status', { enum: ['unread', 'archived'] }).notNull().default('unread'),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deleted_at: text('deleted_at'),
  change_seq: integer('change_seq').notNull().default(0),
})

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
}, (t) => ({
  uniqueUserTag: uniqueIndex('tags_user_name_idx').on(t.user_id, t.name),
}))

export const item_tags = sqliteTable('item_tags', {
  item_id: text('item_id').notNull(),
  tag_id: text('tag_id').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.item_id, t.tag_id] }),
}))
