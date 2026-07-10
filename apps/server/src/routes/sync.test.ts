import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from '../app.js'
import { clearDbCache } from '../db/index.js'

process.env['AUTH_TOKEN'] = 'test'
process.env['AUTH_MODE'] = 'token'
process.env['DB_PATH'] = ':memory:'

const AUTH = { Authorization: 'Bearer test', 'Content-Type': 'application/json' }

beforeEach(() => { clearDbCache() })

function makeChange(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sync-item-1',
    change_seq: 1,
    updated_at: new Date().toISOString(),
    deleted_at: null,
    url: 'https://example.com',
    title: 'Synced Item',
    description: null,
    thumbnail_url: null,
    favicon_url: null,
    domain: 'example.com',
    type: 'article',
    status: 'unread',
    priority: 'medium',
    tag_names: [],
    ...overrides,
  }
}

describe('POST /sync/push', () => {
  it('accepts changes and returns accepted count', async () => {
    const app = createApp()
    const res = await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange()] }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accepted).toBe(1)
  })

  it('LWW: skips change if server updated_at is newer', async () => {
    const app = createApp()
    // First push - newer timestamp wins
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ updated_at: '2026-01-02T00:00:00.000Z', title: 'New' })] }),
    })
    // Second push - older timestamp should be skipped
    const res = await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ updated_at: '2026-01-01T00:00:00.000Z', title: 'Old' })] }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accepted).toBe(0)
  })

  it('LWW: newer updated_at wins over existing', async () => {
    const app = createApp()
    // First push - old timestamp
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ updated_at: '2026-01-01T00:00:00.000Z', title: 'Old' })] }),
    })
    // Second push - newer timestamp should win
    const res = await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ updated_at: '2026-01-02T00:00:00.000Z', title: 'New' })] }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accepted).toBe(1)
  })

  it('tombstone: deleted_at is stored and returned in pull', async () => {
    const app = createApp()
    const deletedAt = '2026-06-01T00:00:00.000Z'
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ deleted_at: deletedAt })] }),
    })
    const pull = await app.request('/sync/pull?cursor=0', { headers: AUTH })
    const body = await pull.json()
    const change = body.changes.find((c: { id: string }) => c.id === 'sync-item-1')
    expect(change?.deleted_at).toBe(deletedAt)
  })
})

describe('GET /sync/pull', () => {
  it('returns all changes since cursor', async () => {
    const app = createApp()
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ id: 'p1', change_seq: 1 }), makeChange({ id: 'p2', change_seq: 2 })] }),
    })
    const res = await app.request('/sync/pull?cursor=0', { headers: AUTH })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.changes.length).toBeGreaterThanOrEqual(2)
    expect(typeof body.cursor).toBe('number')
  })

  it('excludes tombstones older than 90 days', async () => {
    const app = createApp()
    // Push item with deleted_at > 90 days ago
    const oldTombstone = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString()
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ id: 'old-tomb', deleted_at: oldTombstone })] }),
    })
    const res = await app.request('/sync/pull?cursor=0', { headers: AUTH })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.changes.find((c: { id: string }) => c.id === 'old-tomb')).toBeUndefined()
  })

  it('cursor filters to only newer changes', async () => {
    const app = createApp()
    // Push two items - get the cursor after first
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ id: 'first' })] }),
    })
    const pull1 = await app.request('/sync/pull?cursor=0', { headers: AUTH })
    const { cursor } = await pull1.json()

    // Push second item after recording cursor
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ id: 'second', updated_at: new Date().toISOString() })] }),
    })

    // Pull since cursor - should only get second item
    const pull2 = await app.request(`/sync/pull?cursor=${cursor}`, { headers: AUTH })
    const body = await pull2.json()
    expect(body.changes.every((c: { id: string }) => c.id !== 'first')).toBe(true)
    expect(body.changes.some((c: { id: string }) => c.id === 'second')).toBe(true)
  })
})
