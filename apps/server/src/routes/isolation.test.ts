import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from '../app.js'
import { clearDbCache } from '../db/index.js'
import { createAccessToken } from '../services/auth.js'

process.env['AUTH_MODE'] = 'magic-link'
process.env['DB_PATH'] = ':memory:'
process.env['JWT_SECRET'] = 'test-secret-min-32-chars-xxxxxxxxx'

beforeEach(() => { clearDbCache() })

async function makeAuth(userId: string) {
  const token = await createAccessToken(userId)
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

describe('per-user data isolation', () => {
  it('user A items not visible to user B', async () => {
    const app = createApp()
    const authA = await makeAuth('user-a')
    const authB = await makeAuth('user-b')

    await app.request('/items', {
      method: 'POST', headers: authA,
      body: JSON.stringify({ url: 'https://usera.com/article' }),
    })

    const res = await app.request('/items', { headers: authB })
    const body = await res.json()
    expect(body.items).toHaveLength(0)
  })

  it('user A sync/pull does not return user B changes', async () => {
    const app = createApp()
    const authA = await makeAuth('user-a')
    const authB = await makeAuth('user-b')

    await app.request('/sync/push', {
      method: 'POST', headers: authA,
      body: JSON.stringify({ changes: [{
        id: 'a-item-1', change_seq: 1, updated_at: new Date().toISOString(),
        deleted_at: null, url: 'https://usera.com', title: 'User A Item',
        description: null, thumbnail_url: null, favicon_url: null,
        domain: 'usera.com', type: 'article', status: 'unread',
        priority: 'medium', tag_names: [], created_at: new Date().toISOString(),
      }]}),
    })

    const res = await app.request('/sync/pull?cursor=0', { headers: authB })
    const body = await res.json()
    expect(body.changes).toHaveLength(0)
  })

  it('user B cannot PATCH user A item', async () => {
    const app = createApp()
    const authA = await makeAuth('user-a')
    const authB = await makeAuth('user-b')

    const createRes = await app.request('/items', {
      method: 'POST', headers: authA,
      body: JSON.stringify({ url: 'https://usera.com/private' }),
    })
    const { id } = await createRes.json()

    const patchRes = await app.request(`/items/${id}`, {
      method: 'PATCH', headers: authB,
      body: JSON.stringify({ status: 'archived' }),
    })
    expect(patchRes.status).toBe(404)
  })

  it('user B tags not visible to user A', async () => {
    const app = createApp()
    const authA = await makeAuth('user-a')
    const authB = await makeAuth('user-b')

    await app.request('/tags', {
      method: 'POST', headers: authB,
      body: JSON.stringify({ name: 'secret-tag' }),
    })

    const res = await app.request('/tags', { headers: authA })
    const body = await res.json()
    // GET /tags returns a plain array, not { tags: [] }
    expect(body).toHaveLength(0)
  })
})
