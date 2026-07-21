import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createApp } from '../app.js'
import { clearDbCache, getDb } from '../db/index.js'
import { items } from '../db/schema.js'

// Mock metadata so enrichment tests don't make real network calls
vi.mock('../services/metadata.js', () => ({
  enrichMetadataAsync: vi.fn().mockResolvedValue(undefined),
}))

process.env['AUTH_TOKEN'] = 'test'
process.env['AUTH_MODE'] = 'token'
process.env['DB_PATH'] = ':memory:'

const AUTH = { Authorization: 'Bearer test', 'Content-Type': 'application/json' }

beforeEach(() => { clearDbCache() })

function makeChange(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sync-item-1',
    change_seq: 1,
    created_at: new Date().toISOString(),
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

describe('POST /sync/push - enrichment trigger', () => {
  it('triggers enrichment for new item where title === url (Mac app default)', async () => {
    const { enrichMetadataAsync } = await import('../services/metadata.js')
    const mockEnrich = vi.mocked(enrichMetadataAsync)
    mockEnrich.mockClear()
    const app = createApp()
    const url = 'https://github.com/conductor-oss/conductor'
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ id: 'gh-item', url, title: url, domain: 'github.com' })] }),
    })
    expect(mockEnrich).toHaveBeenCalledWith(expect.anything(), 'gh-item', url)
  })

  it('does not trigger enrichment when item is fully enriched (title set + reading time present)', async () => {
    const { enrichMetadataAsync } = await import('../services/metadata.js')
    const mockEnrich = vi.mocked(enrichMetadataAsync)
    mockEnrich.mockClear()
    const app = createApp()
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ title: 'GitHub - conductor-oss/conductor: ...', reading_time_seconds: 300 })] }),
    })
    expect(mockEnrich).not.toHaveBeenCalled()
  })

  it('re-triggers enrichment for an already-titled article still missing reading time (retry transient miss)', async () => {
    const { enrichMetadataAsync } = await import('../services/metadata.js')
    const mockEnrich = vi.mocked(enrichMetadataAsync)
    mockEnrich.mockClear()
    const app = createApp()
    const url = 'https://blog.example.com/stuck'
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ id: 'stuck-sync', url, title: 'Enriched Title', type: 'article', reading_time_seconds: null })] }),
    })
    expect(mockEnrich).toHaveBeenCalledWith(expect.anything(), 'stuck-sync', url)
  })

  it('does not re-trigger enrichment for a video missing reading time', async () => {
    const { enrichMetadataAsync } = await import('../services/metadata.js')
    const mockEnrich = vi.mocked(enrichMetadataAsync)
    mockEnrich.mockClear()
    const app = createApp()
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ id: 'vid', title: 'Some Video', type: 'video', reading_time_seconds: null })] }),
    })
    expect(mockEnrich).not.toHaveBeenCalled()
  })
})

describe('I2: created_at round-trip', () => {
  it('push item with explicit created_at stores it verbatim', async () => {
    const app = createApp()
    const createdAt = '2026-01-15T08:30:00.000Z'
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ id: 'ca-test', created_at: createdAt })] }),
    })
    const pull = await app.request('/sync/pull?cursor=0', { headers: AUTH })
    const body = await pull.json()
    const change = body.changes.find((c: { id: string }) => c.id === 'ca-test')
    expect(change?.created_at).toBe(createdAt)
  })

  it('pull response always includes created_at', async () => {
    const app = createApp()
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange()] }),
    })
    const pull = await app.request('/sync/pull?cursor=0', { headers: AUTH })
    const body = await pull.json()
    const change = body.changes.find((c: { id: string }) => c.id === 'sync-item-1')
    expect(typeof change?.created_at).toBe('string')
    expect(change?.created_at).toBeTruthy()
  })
})

describe('POST /sync/push - edge cases', () => {
  it('same item id twice in batch: newer wins, correct final state', async () => {
    const app = createApp()
    const res = await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [
        makeChange({ id: 'dup', updated_at: '2026-01-02T00:00:00.000Z', title: 'Newer' }),
        makeChange({ id: 'dup', updated_at: '2026-01-01T00:00:00.000Z', title: 'Older' }),
      ]}),
    })
    expect(res.status).toBe(200)
    const { accepted } = await res.json()
    expect(accepted).toBe(1) // second is skipped by LWW
    const pull = await app.request('/sync/pull?cursor=0', { headers: AUTH })
    const body = await pull.json()
    const change = body.changes.find((c: { id: string }) => c.id === 'dup')
    expect(change?.title).toBe('Newer')
  })

  it('LWW: exact-equal updated_at → server wins (skip)', async () => {
    const app = createApp()
    const ts = '2026-01-01T12:00:00.000Z'
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ updated_at: ts, title: 'First' })] }),
    })
    const res = await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ updated_at: ts, title: 'Tie' })] }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).accepted).toBe(0) // server wins on tie
  })

  it('tombstone then push older live update → tombstone survives', async () => {
    const app = createApp()
    // Use a recent tombstone (30 days ago) so the 90-day purge doesn't remove it
    const tombTs = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const olderTs = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ updated_at: tombTs, deleted_at: tombTs })] }),
    })
    // Older live update - should be rejected by LWW
    const res = await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ updated_at: olderTs, deleted_at: null })] }),
    })
    expect((await res.json()).accepted).toBe(0)
    const pull = await app.request('/sync/pull?cursor=0', { headers: AUTH })
    const body = await pull.json()
    const change = body.changes.find((c: { id: string }) => c.id === 'sync-item-1')
    expect(change?.deleted_at).toBe(tombTs)
  })

  it('user B pushes user A UUID → change skipped, no 500, batch continues', async () => {
    // Insert item owned by 'user-a' directly
    const db = getDb()
    db.insert(items).values({
      id: 'user-a-item',
      user_id: 'user-a',
      url: 'https://example.com',
      title: 'User A Item',
      domain: 'example.com',
      type: 'article',
      status: 'unread',
      priority: 'medium',
      change_seq: 1,
    }).run()

    // Auth token gives userId='default' - pushing 'user-a-item' hits PK collision on INSERT
    const app = createApp()
    const res = await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [
        makeChange({ id: 'user-a-item' }),    // collides → skipped
        makeChange({ id: 'safe-item' }),       // should be accepted
      ]}),
    })
    expect(res.status).toBe(200)
    const { accepted } = await res.json()
    expect(accepted).toBe(1) // safe-item accepted, collision skipped
  })
})

describe('POST /sync/push - Swift client (absent nil fields)', () => {
  it('push with deleted_at/description/thumbnail_url/favicon_url absent → 200, stored with nulls', async () => {
    const app = createApp()
    // Omit all 4 optional nullable fields entirely (Swift omits nil fields from JSON)
    const swiftChange = {
      id: 'swift-nil-test',
      change_seq: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      url: 'https://example.com/swift',
      title: 'Swift Item',
      domain: 'example.com',
      type: 'article',
      status: 'unread',
      priority: 'medium',
      tag_names: [],
    }
    const res = await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [swiftChange] }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).accepted).toBe(1)

    const pull = await app.request('/sync/pull?cursor=0', { headers: AUTH })
    const body = await pull.json()
    const change = body.changes.find((c: { id: string }) => c.id === 'swift-nil-test')
    expect(change).toBeDefined()
    expect(change.deleted_at).toBeNull()
    expect(change.description).toBeNull()
    expect(change.thumbnail_url).toBeNull()
    expect(change.favicon_url).toBeNull()
  })
})

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

  it('cursor beyond max → cursor returned unchanged', async () => {
    const app = createApp()
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange()] }),
    })
    const res = await app.request('/sync/pull?cursor=9999', { headers: AUTH })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.changes).toHaveLength(0)
    expect(body.cursor).toBe(9999)
  })

  it('purge boundary: <90d NOT purged, >90d IS purged', async () => {
    const app = createApp()
    const MS_90D = 90 * 24 * 60 * 60 * 1000
    // 1s inside boundary → must survive
    const recentTomb = new Date(Date.now() - MS_90D + 1000).toISOString()
    // 1s outside boundary → must be purged
    const oldTomb = new Date(Date.now() - MS_90D - 1000).toISOString()
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [
        makeChange({ id: 'recent', deleted_at: recentTomb, updated_at: recentTomb }),
        makeChange({ id: 'old', deleted_at: oldTomb, updated_at: oldTomb }),
      ]}),
    })
    const res = await app.request('/sync/pull?cursor=0', { headers: AUTH })
    const body = await res.json()
    expect(body.changes.some((c: { id: string }) => c.id === 'recent')).toBe(true)
    expect(body.changes.some((c: { id: string }) => c.id === 'old')).toBe(false)
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

describe('GET /sync/events - SSE realtime', () => {
  it('streams a change event when an item is pushed', async () => {
    const app = createApp()
    const res = await app.request('/sync/events', { headers: { Authorization: 'Bearer test' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    // First frame is the initial "connected" hello.
    const hello = await reader.read()
    expect(decoder.decode(hello.value)).toContain('connected')

    // A push must produce a "change" frame on the open stream.
    await app.request('/sync/push', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ id: 'sse-1' })] }),
    })
    const frame = await reader.read()
    expect(decoder.decode(frame.value)).toContain('change')

    await reader.cancel()
  })
})
