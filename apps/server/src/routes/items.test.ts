import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from '../app.js'
import { getDb, clearDbCache } from '../db/index.js'
import { items, tags } from '../db/schema.js'

process.env['AUTH_TOKEN'] = 'test'
process.env['AUTH_MODE'] = 'token'
process.env['DB_PATH'] = ':memory:'

const AUTH = { Authorization: 'Bearer test' }

function app() { return createApp() }

beforeEach(() => { clearDbCache() })

describe('POST /items', () => {
  it('creates item with auto-detected type and domain', async () => {
    const res = await app().request('/items', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://youtube.com/watch?v=abc' }),
    })
    expect(res.status).toBe(201)
    const item = await res.json()
    expect(item.type).toBe('video')
    expect(item.domain).toBe('youtube.com')
    expect(item.priority).toBe('medium')
    expect(item.status).toBe('unread')
    expect(item.id).toBeTruthy()
  })

  it('uses provided title if given', async () => {
    const res = await app().request('/items', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com', title: 'My Title' }),
    })
    expect(res.status).toBe(201)
    const item = await res.json()
    expect(item.title).toBe('My Title')
  })

  it('returns 401 without auth', async () => {
    const res = await app().request('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    expect(res.status).toBe(401)
  })

  it('POST with tag_names returns tags in response and populates db', async () => {
    const a = app()
    const res = await a.request('/items', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com', tag_names: ['AI', 'Tech'] }),
    })
    expect(res.status).toBe(201)
    const item = await res.json()
    expect(item.tags.map((t: { name: string }) => t.name).sort()).toEqual(['AI', 'Tech'])
    const db = getDb()
    const tagRows = db.select().from(tags).all()
    expect(tagRows.map(t => t.name).sort()).toEqual(['AI', 'Tech'])
  })
})

describe('PATCH /items/:id', () => {
  it('updates status to archived', async () => {
    const a = app()
    const createRes = await a.request('/items', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    const { id } = await createRes.json()

    const patchRes = await a.request(`/items/${id}`, {
      method: 'PATCH',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    expect(patchRes.status).toBe(200)
    const updated = await patchRes.json()
    expect(updated.status).toBe('archived')
  })

  it('replaces tags on PATCH', async () => {
    const a = app()
    const createRes = await a.request('/items', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com', tag_names: ['A', 'B'] }),
    })
    const { id } = await createRes.json()

    const patchRes = await a.request(`/items/${id}`, {
      method: 'PATCH',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_names: ['C'] }),
    })
    expect(patchRes.status).toBe(200)
    const updated = await patchRes.json()
    expect(updated.tags.map((t: { name: string }) => t.name)).toEqual(['C'])
  })

  it('returns 404 for nonexistent id', async () => {
    const res = await app().request('/items/does-not-exist', {
      method: 'PATCH',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 when accessing another user item', async () => {
    // Insert an item owned by a different user directly
    const db = getDb()
    db.insert(items).values({
      id: 'other-user-item',
      user_id: 'user2',
      url: 'https://example.com',
      title: 'Other',
      domain: 'example.com',
      type: 'article',
      status: 'unread',
      priority: 'medium',
      change_seq: 1,
    }).run()

    // Auth token mode sets userId='default' - cannot access user2's item
    const res = await app().request('/items/other-user-item', {
      method: 'PATCH',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /items', () => {
  it('returns created items', async () => {
    const a = app()
    await a.request('/items', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a' }),
    })
    const res = await a.request('/items', { headers: AUTH })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items.length).toBeGreaterThan(0)
  })

  it('pages through all items exactly once using nextCursor', async () => {
    const a = app()
    // Insert 12 items
    for (let i = 1; i <= 12; i++) {
      await a.request('/items', {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://example.com/${i}` }),
      })
    }

    const seen = new Set<string>()
    let cursor = 0
    let pages = 0

    while (true) {
      const url = `/items?limit=5${cursor > 0 ? `&since=${cursor}` : ''}`
      const res = await a.request(url, { headers: AUTH })
      expect(res.status).toBe(200)
      const body = await res.json()

      for (const item of body.items) {
        expect(seen.has(item.id)).toBe(false) // no duplicates
        seen.add(item.id)
      }

      pages++
      if (body.nextCursor === null) break
      cursor = body.nextCursor
      if (pages > 10) throw new Error('pagination loop detected')
    }

    expect(seen.size).toBe(12)
  })

  it('does not return another user item', async () => {
    const db = getDb()
    db.insert(items).values({
      id: 'other-user-item',
      user_id: 'user2',
      url: 'https://example.com',
      title: 'Other',
      domain: 'example.com',
      type: 'article',
      status: 'unread',
      priority: 'medium',
      change_seq: 99,
    }).run()

    const res = await app().request('/items', { headers: AUTH })
    const body = await res.json()
    expect(body.items.every((item: { id: string }) => item.id !== 'other-user-item')).toBe(true)
  })
})
