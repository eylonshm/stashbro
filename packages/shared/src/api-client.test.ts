import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StashBroClient } from './api-client.js'
import type { Item, Tag, SyncChange } from './types.js'

const mockFetch = vi.fn()

const baseItem: Item = {
  id: 'abc', url: 'https://example.com', title: 'Test', type: 'article',
  status: 'unread', priority: 'medium', domain: 'example.com',
  description: null, thumbnail_url: null, favicon_url: null,
  user_id: 'u1', created_at: '', updated_at: '', deleted_at: null,
  change_seq: 1, tags: [],
}

const baseTag: Tag = { id: 't1', name: 'dev', user_id: 'u1', created_at: '' }

describe('StashBroClient', () => {
  let client: StashBroClient

  beforeEach(() => {
    client = new StashBroClient({ baseUrl: 'http://localhost:3000', token: 'test-token' }, mockFetch as typeof fetch)
    mockFetch.mockReset()
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
    await expect(client.createItem({ url: 'https://example.com' })).rejects.toThrow('401')
  })

  it('createItem: POST /items with auth header and body, returns Item', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => baseItem })
    const result = await client.createItem({ url: 'https://example.com' })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' }),
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    )
    expect(result).toEqual(baseItem)
  })

  it('updateItem: PATCH /items/:id with body, returns Item', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => baseItem })
    const result = await client.updateItem('abc', { title: 'Updated' })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/items/abc',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated' }),
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    )
    expect(result).toEqual(baseItem)
  })

  it('pullChanges: GET /sync/pull?cursor=3, returns changes and cursor', async () => {
    const payload = { changes: [] as SyncChange[], cursor: 5 }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload })
    const result = await client.pullChanges(3)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/sync/pull?cursor=3',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) })
    )
    expect(result).toEqual(payload)
  })

  it('pushChanges: POST /sync/push with changes body, returns accepted count', async () => {
    const changes: SyncChange[] = [{ type: 'item', id: 'abc', payload: baseItem, seq: 1 }]
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ accepted: 1 }) })
    const result = await client.pushChanges(changes)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/sync/push',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ changes }),
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    )
    expect(result).toEqual({ accepted: 1 })
  })

  it('getTags: GET /tags, returns Tag[]', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [baseTag] })
    const result = await client.getTags()
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/tags',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) })
    )
    expect(result).toEqual([baseTag])
  })

  it('createTag: POST /tags with name body, returns Tag', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => baseTag })
    const result = await client.createTag('dev')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/tags',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'dev' }),
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    )
    expect(result).toEqual(baseTag)
  })
})
