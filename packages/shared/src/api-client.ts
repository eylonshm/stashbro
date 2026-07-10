import type { Item, Tag, SyncChange, CreateItemInput, UpdateItemInput } from './types.js'

export interface StashBroClientConfig {
  baseUrl: string
  token: string
}

export class StashBroClient {
  private baseUrl: string
  private headers: Record<string, string>
  private _fetch: typeof fetch

  constructor(config: StashBroClientConfig, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
    }
    this._fetch = fetchImpl
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers, ...(init.headers ?? {}) },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(`${res.status}: ${JSON.stringify(body)}`)
    }
    return res.json() as Promise<T>
  }

  createItem(input: CreateItemInput): Promise<Item> {
    return this.request<Item>('/items', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  updateItem(id: string, input: UpdateItemInput): Promise<Item> {
    return this.request<Item>(`/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  pullChanges(cursor: number): Promise<{ changes: SyncChange[]; cursor: number }> {
    const params = new URLSearchParams({ cursor: String(cursor) })
    return this.request<{ changes: SyncChange[]; cursor: number }>(`/sync/pull?${params}`)
  }

  pushChanges(changes: SyncChange[]): Promise<{ accepted: number }> {
    return this.request<{ accepted: number }>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    })
  }

  getTags(): Promise<Tag[]> {
    return this.request<Tag[]>('/tags')
  }

  createTag(name: string): Promise<Tag> {
    return this.request<Tag>('/tags', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  }
}
