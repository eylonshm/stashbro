import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from '../app.js'
import { getDb } from '../db/index.js'

process.env['AUTH_TOKEN'] = 'test'
process.env['AUTH_MODE'] = 'token'
process.env['DB_PATH'] = ':memory:'

const AUTH = { Authorization: 'Bearer test' }

describe('POST /items', () => {
  it('creates item with auto-detected type and domain', async () => {
    const app = createApp()
    const res = await app.request('/items', {
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
    const app = createApp()
    const res = await app.request('/items', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com', title: 'My Title' }),
    })
    expect(res.status).toBe(201)
    const item = await res.json()
    expect(item.title).toBe('My Title')
  })

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('PATCH /items/:id', () => {
  it('updates status to archived', async () => {
    const app = createApp()
    const createRes = await app.request('/items', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    const { id } = await createRes.json()

    const patchRes = await app.request(`/items/${id}`, {
      method: 'PATCH',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    expect(patchRes.status).toBe(200)
    const updated = await patchRes.json()
    expect(updated.status).toBe('archived')
  })
})

describe('GET /items', () => {
  it('returns created items', async () => {
    const app = createApp()
    await app.request('/items', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a' }),
    })
    const res = await app.request('/items', { headers: AUTH })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items.length).toBeGreaterThan(0)
  })
})
