import { describe, it, expect, vi } from 'vitest'
import { SyncEngine, OfflineQueue } from './sync-engine.js'
import type { LocalStore } from './sync-engine.js'
import type { SyncChange } from './types.js'

function makeChange(overrides: Partial<SyncChange> = {}): SyncChange {
  return {
    id: 'item-1',
    change_seq: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    url: 'https://example.com',
    title: 'Test',
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

function makeStore(cursor = 0, localChanges: SyncChange[] = []): LocalStore {
  let _cursor = cursor
  const applied: SyncChange[] = []
  return {
    getChangesSince: vi.fn(async (c) => localChanges.filter(ch => ch.change_seq > c)),
    applyChanges: vi.fn(async (changes) => applied.push(...changes)),
    getCursor: vi.fn(async () => _cursor),
    setCursor: vi.fn(async (c) => { _cursor = c }),
    _applied: applied,
  } as unknown as LocalStore & { _applied: SyncChange[] }
}

function makeClient(remoteChanges: SyncChange[] = [], cursor = 5) {
  return {
    pushChanges: vi.fn(async () => ({ accepted: 0 })),
    pullChanges: vi.fn(async () => ({ changes: remoteChanges, cursor })),
  }
}

describe('SyncEngine', () => {
  it('pushes local changes and pulls remote on sync()', async () => {
    const localChange = makeChange({ id: 'local-1', change_seq: 1 })
    const store = makeStore(0, [localChange])
    const remoteChange = makeChange({ id: 'remote-1', change_seq: 2 })
    const client = makeClient([remoteChange], 10)
    const onComplete = vi.fn()
    const engine = new SyncEngine({ client: client as any, store, onSyncComplete: onComplete })

    await engine.sync()

    expect(client.pushChanges).toHaveBeenCalledWith([localChange])
    expect(client.pullChanges).toHaveBeenCalledWith(0)
    expect(store.applyChanges).toHaveBeenCalledWith([remoteChange])
    expect(store.setCursor).toHaveBeenCalledWith(10)
    expect(onComplete).toHaveBeenCalled()
  })

  it('calls onSyncError when client throws', async () => {
    const store = makeStore()
    const client = { pushChanges: vi.fn(async () => { throw new Error('offline') }), pullChanges: vi.fn() }
    const onError = vi.fn()
    const engine = new SyncEngine({ client: client as any, store, onSyncError: onError })
    await engine.sync()
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })

  it('onLocalWrite triggers sync', async () => {
    const store = makeStore()
    const client = makeClient()
    const onComplete = vi.fn()
    const engine = new SyncEngine({ client: client as any, store, onSyncComplete: onComplete })
    engine.onLocalWrite(makeChange())
    // flush microtasks so the void sync() promise runs
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(client.pullChanges).toHaveBeenCalled()
  })

  it('write during in-flight sync schedules a second cycle', async () => {
    const store = makeStore()
    let resolvePull!: () => void
    const client = {
      pushChanges: vi.fn(async () => ({ accepted: 0 })),
      pullChanges: vi.fn(() => new Promise<{ changes: SyncChange[]; cursor: number }>(resolve => {
        resolvePull = () => resolve({ changes: [], cursor: 1 })
      })),
    }
    const engine = new SyncEngine({ client: client as any, store })

    // start first sync - stalls at pullChanges
    const firstSync = engine.sync()
    // flush microtasks so sync() progresses through getCursor/getChangesSince and enters pullChanges
    await new Promise(resolve => setTimeout(resolve, 0))

    // write arrives while pullChanges is in-flight - sets pendingSync
    engine.onLocalWrite(makeChange())

    // release pullChanges; first sync completes, then pendingSync triggers second sync
    resolvePull()
    await firstSync
    // flush so the void second sync() runs to completion
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(client.pullChanges).toHaveBeenCalledTimes(2)
  })
})

describe('OfflineQueue', () => {
  it('enqueues and flushes changes', async () => {
    const queue = new OfflineQueue()
    const change = makeChange()
    queue.enqueue(change)
    expect(queue.getQueue()).toHaveLength(1)
    const client = { pushChanges: vi.fn(async () => ({ accepted: 1 })) }
    await queue.flush(client as any)
    expect(client.pushChanges).toHaveBeenCalledWith([change])
    expect(queue.getQueue()).toHaveLength(0)
  })

  it('keeps queue if flush fails', async () => {
    const queue = new OfflineQueue()
    queue.enqueue(makeChange())
    const client = { pushChanges: vi.fn(async () => { throw new Error('net') }) }
    await queue.flush(client as any)
    expect(queue.getQueue()).toHaveLength(1)
  })
})
