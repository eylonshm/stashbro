import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OfflineRetryQueue } from './OfflineRetryQueue.js'

// Mock chrome.storage.local
const store: Record<string, unknown> = {}
const mockStorage = {
  get: vi.fn(async (key: string) => ({ [key]: store[key] })),
  set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
}

describe('OfflineRetryQueue', () => {
  beforeEach(() => { Object.keys(store).forEach(k => delete store[k]); vi.clearAllMocks() })

  it('enqueues item to storage', async () => {
    const q = new OfflineRetryQueue(mockStorage as any)
    await q.enqueue({ url: 'https://example.com', title: 'Test' })
    expect(mockStorage.set).toHaveBeenCalled()
    const queue = await q.getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]!.url).toBe('https://example.com')
  })

  it('flush calls save for each item and clears on success', async () => {
    const q = new OfflineRetryQueue(mockStorage as any)
    await q.enqueue({ url: 'https://example.com', title: 'Test' })
    const mockSave = vi.fn(async () => true)
    await q.flush(mockSave)
    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(await q.getQueue()).toHaveLength(0)
  })

  it('keeps items in queue if flush fails', async () => {
    const q = new OfflineRetryQueue(mockStorage as any)
    await q.enqueue({ url: 'https://example.com', title: 'Test' })
    const mockSave = vi.fn(async () => false)
    await q.flush(mockSave)
    expect(await q.getQueue()).toHaveLength(1)
  })
})
