import type { SyncChange } from './types.js'
import type { StashBroClient } from './api-client.js'

export interface LocalStore {
  getChangesSince(cursor: number): Promise<SyncChange[]>
  applyChanges(changes: SyncChange[]): Promise<void>
  getCursor(): Promise<number>
  setCursor(cursor: number): Promise<void>
}

export class OfflineQueue {
  private queue: SyncChange[] = []

  enqueue(change: SyncChange): void {
    // Replace existing entry with same id (LWW)
    const idx = this.queue.findIndex(c => c.id === change.id)
    if (idx >= 0) this.queue[idx] = change
    else this.queue.push(change)
  }

  getQueue(): SyncChange[] {
    return [...this.queue]
  }

  async flush(client: Pick<StashBroClient, 'pushChanges'>): Promise<void> {
    if (this.queue.length === 0) return
    const batch = [...this.queue]
    try {
      await client.pushChanges(batch)
      this.queue = []
    } catch {
      // ponytail: keep queue intact for retry
    }
  }
}

export interface SyncEngineConfig {
  client: StashBroClient
  store: LocalStore
  onSyncComplete?: () => void
  onSyncError?: (err: Error) => void
}

export class SyncEngine {
  private client: StashBroClient
  private store: LocalStore
  private onSyncComplete: (() => void) | undefined
  private onSyncError: ((err: Error) => void) | undefined
  private syncing = false

  constructor(config: SyncEngineConfig) {
    this.client = config.client
    this.store = config.store
    this.onSyncComplete = config.onSyncComplete
    this.onSyncError = config.onSyncError
  }

  onLocalWrite(change: SyncChange): void {
    void this.sync()
  }

  async sync(): Promise<void> {
    if (this.syncing) return
    this.syncing = true
    try {
      const cursor = await this.store.getCursor()
      const localChanges = await this.store.getChangesSince(cursor)

      if (localChanges.length > 0) {
        await this.client.pushChanges(localChanges)
      }

      const { changes: remoteChanges, cursor: newCursor } = await this.client.pullChanges(cursor)
      if (remoteChanges.length > 0) {
        await this.store.applyChanges(remoteChanges)
      }
      await this.store.setCursor(newCursor)
      this.onSyncComplete?.()
    } catch (err) {
      this.onSyncError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.syncing = false
    }
  }
}
