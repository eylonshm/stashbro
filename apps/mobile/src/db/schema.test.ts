import { describe, it, expect } from 'vitest'
import { MIGRATIONS } from './schema.js'

describe('MIGRATIONS', () => {
  it('items table has required columns', () => {
    const sql = MIGRATIONS.join('\n')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS items')
    expect(sql).toContain('change_seq')
    expect(sql).toContain('priority')
    expect(sql).toContain('deleted_at')
  })
  it('tags table has unique constraint', () => {
    const sql = MIGRATIONS.join('\n')
    expect(sql).toContain('UNIQUE(user_id, name)')
  })
  it('item_tags has composite primary key', () => {
    const sql = MIGRATIONS.join('\n')
    expect(sql).toContain('PRIMARY KEY')
    expect(sql).toContain('item_tags')
  })
})
