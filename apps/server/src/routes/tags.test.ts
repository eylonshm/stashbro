import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from '../app.js'
import { getDb, clearDbCache } from '../db/index.js'
import { tags } from '../db/schema.js'

process.env['AUTH_TOKEN'] = 'test'
process.env['AUTH_MODE'] = 'token'
process.env['DB_PATH'] = ':memory:'

const AUTH = { Authorization: 'Bearer test', 'Content-Type': 'application/json' }

beforeEach(() => { clearDbCache() })

describe('tags routes', () => {
  it('POST /tags creates a tag', async () => {
    const app = createApp()
    const res = await app.request('/tags', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ name: 'AI' }),
    })
    expect(res.status).toBe(201)
    const tag = await res.json()
    expect(tag.name).toBe('AI')
    expect(tag.id).toBeTruthy()
  })

  it('POST /tags is idempotent - returns existing tag', async () => {
    const app = createApp()
    const r1 = await app.request('/tags', { method: 'POST', headers: AUTH, body: JSON.stringify({ name: 'AI' }) })
    const t1 = await r1.json()
    const r2 = await app.request('/tags', { method: 'POST', headers: AUTH, body: JSON.stringify({ name: 'AI' }) })
    const t2 = await r2.json()
    expect(t1.id).toBe(t2.id)
  })

  it('GET /tags returns created tags', async () => {
    const app = createApp()
    await app.request('/tags', { method: 'POST', headers: AUTH, body: JSON.stringify({ name: 'startups' }) })
    const res = await app.request('/tags', { headers: AUTH })
    expect(res.status).toBe(200)
    const tagList = await res.json()
    expect(Array.isArray(tagList)).toBe(true)
    expect(tagList.some((t: { name: string }) => t.name === 'startups')).toBe(true)
  })

  it('GET /tags does not return tags owned by another user', async () => {
    // Direct insert for a different user
    const db = getDb()
    db.insert(tags).values({ id: 'other-tag', user_id: 'user2', name: 'private' }).run()

    const res = await createApp().request('/tags', { headers: AUTH })
    expect(res.status).toBe(200)
    const tagList = await res.json()
    expect(tagList.every((t: { id: string }) => t.id !== 'other-tag')).toBe(true)
  })
})
