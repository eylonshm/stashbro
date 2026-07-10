import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StashBroClient } from './api-client.js'

const mockFetch = vi.fn()

describe('StashBroClient', () => {
  let client: StashBroClient

  beforeEach(() => {
    client = new StashBroClient({ baseUrl: 'http://localhost:3000', token: 'test-token' }, mockFetch as typeof fetch)
    mockFetch.mockReset()
  })

  it('sends Authorization header on createItem', async () => {
    const item = { id: 'abc', url: 'https://example.com', title: 'Test', type: 'article', status: 'unread', priority: 'medium', domain: 'example.com', description: null, thumbnail_url: null, favicon_url: null, user_id: 'u1', created_at: '', updated_at: '', deleted_at: null, change_seq: 1, tags: [] }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => item })
    await client.createItem({ url: 'https://example.com' })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/items',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) })
    )
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
    await expect(client.createItem({ url: 'https://example.com' })).rejects.toThrow('401')
  })

  it('pullChanges includes cursor param', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ changes: [], cursor: 5 }) })
    const result = await client.pullChanges(3)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/sync/pull?cursor=3',
      expect.anything()
    )
    expect(result.cursor).toBe(5)
  })
})
