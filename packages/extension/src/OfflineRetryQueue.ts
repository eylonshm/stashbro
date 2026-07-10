type SaveFn = (item: QueueItem) => Promise<boolean>

interface QueueItem {
  url: string
  title?: string
  tag_names?: string[]
  priority?: string
  queuedAt: number
}

type StorageArea = typeof chrome.storage.local

export class OfflineRetryQueue {
  private storage: StorageArea
  private readonly key = 'stashbro:offlineQueue'
  // ponytail: promise chain serializes enqueue/flush to prevent read-modify-write races
  private mutex: Promise<unknown> = Promise.resolve()

  constructor(storage: StorageArea = chrome.storage.local) {
    this.storage = storage
  }

  private runExclusive<T>(op: () => Promise<T>): Promise<T> {
    const next = this.mutex.then(op)
    this.mutex = next.catch(() => undefined)
    return next
  }

  async enqueue(item: Omit<QueueItem, 'queuedAt'>): Promise<void> {
    return this.runExclusive(async () => {
      const queue = await this.getQueue()
      queue.push({ ...item, queuedAt: Date.now() })
      await this.storage.set({ [this.key]: queue })
    })
  }

  async getQueue(): Promise<QueueItem[]> {
    const result = await this.storage.get(this.key)
    return (result[this.key] as QueueItem[]) ?? []
  }

  async flush(save: SaveFn): Promise<void> {
    return this.runExclusive(async () => {
      const queue = await this.getQueue()
      const remaining: QueueItem[] = []
      for (const item of queue) {
        const ok = await save(item)
        if (!ok) remaining.push(item)
      }
      await this.storage.set({ [this.key]: remaining })
    })
  }
}
