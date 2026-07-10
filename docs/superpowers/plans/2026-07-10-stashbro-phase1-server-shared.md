# StashBro Phase 1 - Server + Shared Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pnpm+Turborepo monorepo scaffold, the `packages/shared` TypeScript library (domain types, API client, sync engine), and the `apps/server` Hono API server (items/tags CRUD, sync push/pull, async metadata enrichment, token auth) - the complete foundation all other phases consume.

**Architecture:** Turborepo monorepo with strict ESM TypeScript. `packages/shared` exports platform-agnostic types and a sync engine that mobile and the extension use. `apps/server` runs Hono + @hono/zod-openapi (OpenAPI spec is the Swift client contract), Drizzle ORM over better-sqlite3, and exposes `/sync/push` + `/sync/pull` endpoints implementing per-user monotonic `change_seq` LWW sync. Metadata enrichment runs async after item save.

**Tech Stack:** Node >=20, pnpm workspaces, Turborepo, TypeScript strict ESM, Hono + @hono/zod-openapi, Zod, Drizzle ORM + better-sqlite3, uuidv7, Vitest, Docker

## Global Constraints

- Node >=20, pnpm (no npm/yarn), TypeScript strict ESM (`"module":"ESNext"`, `"moduleResolution":"Bundler"`)
- Hono + @hono/zod-openapi for all routes; Zod schemas are the single source of truth for request/response shapes
- Drizzle ORM + better-sqlite3 (no Prisma, no Postgres)
- uuidv7 for all IDs (install `uuidv7` package)
- Vitest for all tests; TDD throughout (write test first, see it fail, implement, see it pass)
- MIT license; no external auth libraries (hand-roll token middleware)
- OpenAPI spec generated from route definitions via `@hono/zod-openapi` - served at `GET /openapi.json`; this is the contract the Swift client generates from in Phase 2
- Single Docker image, SQLite stored in `/data/stashbro.db`

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`

**Interfaces:**
- Consumes: nothing
- Produces: `pnpm` workspace with `apps/server` and `packages/shared` packages; `tsc --noEmit` passes in both

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "stashbro",
  "private": true,
  "license": "MIT",
  "engines": { "node": ">=20" },
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.turbo/
*.db
*.db-shm
*.db-wal
.env
.env.local
```

- [ ] **Step 6: Create apps/server/package.json**

```json
{
  "name": "@stashbro/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch --experimental-vm-modules dist/index.js",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@hono/zod-openapi": "^0.18.0",
    "better-sqlite3": "^11.5.0",
    "drizzle-orm": "^0.38.0",
    "hono": "^4.6.0",
    "uuidv7": "^1.0.2",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.0.0",
    "drizzle-kit": "^0.29.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 7: Create apps/server/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 8: Create packages/shared/package.json**

```json
{
  "name": "@stashbro/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 9: Create packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 10: Install dependencies and verify**

```bash
pnpm install
pnpm build
```

Expected: no errors; `dist/` folders created in both packages.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: monorepo scaffold (pnpm+Turborepo, TS strict ESM)"
```

---

### Task 2: packages/shared - Domain Types

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/types.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `ItemType = 'video' | 'post' | 'article' | 'other'`
  - `Priority = 'low' | 'medium' | 'high'`
  - `Status = 'unread' | 'archived'`
  - `Item { id, user_id, url, title, description, thumbnail_url, favicon_url, domain, type, status, priority, created_at, updated_at, deleted_at, change_seq, tags }`
  - `Tag { id, user_id, name }`
  - `SyncChange` (item snapshot for sync wire format)
  - `CreateItemInput { url, title?, type?, priority?, tag_names? }`
  - `UpdateItemInput { title?, type?, status?, priority?, deleted_at? }`
  - `DOMAIN_TYPE_MAP: Record<string, ItemType>`
  - `detectType(url: string): ItemType`

- [ ] **Step 1: Write failing test**

```typescript
// packages/shared/src/types.test.ts
import { describe, it, expect } from 'vitest'
import { detectType, DOMAIN_TYPE_MAP } from './types.js'

describe('detectType', () => {
  it('detects youtube as video', () => {
    expect(detectType('https://youtube.com/watch?v=abc')).toBe('video')
  })
  it('detects vimeo as video', () => {
    expect(detectType('https://vimeo.com/123456')).toBe('video')
  })
  it('detects x.com as post', () => {
    expect(detectType('https://x.com/user/status/123')).toBe('post')
  })
  it('detects twitter.com as post', () => {
    expect(detectType('https://twitter.com/user/status/123')).toBe('post')
  })
  it('detects reddit.com as post', () => {
    expect(detectType('https://reddit.com/r/programming')).toBe('post')
  })
  it('detects threads.net as post', () => {
    expect(detectType('https://threads.net/@user')).toBe('post')
  })
  it('defaults unknown domain to article', () => {
    expect(detectType('https://stratechery.com/2026/post')).toBe('article')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/shared && pnpm test
```

Expected: FAIL - `detectType` not found

- [ ] **Step 3: Implement types.ts**

```typescript
// packages/shared/src/types.ts
export type ItemType = 'video' | 'post' | 'article' | 'other'
export type Priority = 'low' | 'medium' | 'high'
export type Status = 'unread' | 'archived'

export interface Tag {
  id: string
  user_id: string
  name: string
}

export interface Item {
  id: string           // uuidv7
  user_id: string
  url: string
  title: string
  description: string | null
  thumbnail_url: string | null
  favicon_url: string | null
  domain: string
  type: ItemType
  status: Status
  priority: Priority
  created_at: string   // ISO 8601
  updated_at: string   // ISO 8601
  deleted_at: string | null
  change_seq: number
  tags: Tag[]
}

export interface SyncChange {
  id: string
  change_seq: number
  updated_at: string
  deleted_at: string | null
  url: string
  title: string
  description: string | null
  thumbnail_url: string | null
  favicon_url: string | null
  domain: string
  type: ItemType
  status: Status
  priority: Priority
  tag_names: string[]
}

export interface CreateItemInput {
  url: string
  title?: string
  type?: ItemType
  priority?: Priority
  tag_names?: string[]
}

export interface UpdateItemInput {
  title?: string
  type?: ItemType
  status?: Status
  priority?: Priority
  deleted_at?: string | null
  tag_names?: string[]
}

// Domain -> type map. Checked by substring match on hostname.
export const DOMAIN_TYPE_MAP: Record<string, ItemType> = {
  'youtube.com': 'video',
  'youtu.be': 'video',
  'vimeo.com': 'video',
  'x.com': 'post',
  'twitter.com': 'post',
  'reddit.com': 'post',
  'threads.net': 'post',
}

export function detectType(url: string): ItemType {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    for (const [domain, type] of Object.entries(DOMAIN_TYPE_MAP)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return type
    }
  } catch {
    // invalid URL - fall through
  }
  return 'article'
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
```

- [ ] **Step 4: Create packages/shared/src/index.ts**

```typescript
// packages/shared/src/index.ts
export * from './types.js'
export * from './api-client.js'
export * from './sync-engine.js'
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/shared && pnpm test -- types.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): domain types, ItemType detection, SyncChange shape"
```

---

### Task 3: packages/shared - API Client

**Files:**
- Create: `packages/shared/src/api-client.ts`
- Test: `packages/shared/src/api-client.test.ts`

**Interfaces:**
- Consumes: `Item`, `Tag`, `SyncChange`, `CreateItemInput`, `UpdateItemInput` from Task 2
- Produces:
  - `StashBroClient` class with methods:
    - `createItem(input: CreateItemInput): Promise<Item>`
    - `updateItem(id: string, input: UpdateItemInput): Promise<Item>`
    - `pullChanges(cursor: number): Promise<{ changes: SyncChange[]; cursor: number }>`
    - `pushChanges(changes: SyncChange[]): Promise<{ accepted: number }>`
    - `getTags(): Promise<Tag[]>`
    - `createTag(name: string): Promise<Tag>`
  - `StashBroClientConfig { baseUrl: string; token: string }`

- [ ] **Step 1: Write failing test**

```typescript
// packages/shared/src/api-client.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/shared && pnpm test -- api-client.test.ts
```

Expected: FAIL - `StashBroClient` not found

- [ ] **Step 3: Implement api-client.ts**

```typescript
// packages/shared/src/api-client.ts
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
    return this.request<{ changes: SyncChange[]; cursor: number }>(
      `/sync/pull?cursor=${cursor}`
    )
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/shared && pnpm test -- api-client.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/api-client.ts packages/shared/src/api-client.test.ts
git commit -m "feat(shared): StashBroClient typed API client"
```

---

### Task 4: packages/shared - Sync Engine

**Files:**
- Create: `packages/shared/src/sync-engine.ts`
- Test: `packages/shared/src/sync-engine.test.ts`

**Interfaces:**
- Consumes: `SyncChange`, `StashBroClient` from Tasks 2-3
- Produces:
  - `LocalStore` interface: `{ getChangesSince(cursor: number): Promise<SyncChange[]>; applyChanges(changes: SyncChange[]): Promise<void>; getCursor(): Promise<number>; setCursor(cursor: number): Promise<void> }`
  - `OfflineQueue` class: `{ enqueue(change: SyncChange): void; flush(client: StashBroClient): Promise<void>; getQueue(): SyncChange[] }`
  - `SyncEngine` class: `{ sync(): Promise<void>; onLocalWrite(change: SyncChange): void }`
  - `SyncEngineConfig { client: StashBroClient; store: LocalStore; onSyncComplete?: () => void; onSyncError?: (err: Error) => void }`

- [ ] **Step 1: Write failing test**

```typescript
// packages/shared/src/sync-engine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncEngine, OfflineQueue } from './sync-engine.js'
import type { LocalStore } from './sync-engine.js'
import type { SyncChange } from './types.js'

function makeChange(overrides: Partial<SyncChange> = {}): SyncChange {
  return {
    id: 'item-1',
    change_seq: 1,
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/shared && pnpm test -- sync-engine.test.ts
```

Expected: FAIL - modules not found

- [ ] **Step 3: Implement sync-engine.ts**

```typescript
// packages/shared/src/sync-engine.ts
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
      // keep queue intact for retry
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
  private onSyncComplete?: () => void
  private onSyncError?: (err: Error) => void
  private syncing = false

  constructor(config: SyncEngineConfig) {
    this.client = config.client
    this.store = config.store
    this.onSyncComplete = config.onSyncComplete
    this.onSyncError = config.onSyncError
  }

  onLocalWrite(change: SyncChange): void {
    // Debounced callers trigger sync; this is a hook for subclasses
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/shared && pnpm test -- sync-engine.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Build shared package**

```bash
cd packages/shared && pnpm build
```

Expected: `dist/` with index.js + .d.ts files, no errors

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/sync-engine.ts packages/shared/src/sync-engine.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): LocalStore interface, OfflineQueue, SyncEngine push/pull cycle"
```

---

### Task 5: apps/server - Project Bootstrap

**Files:**
- Create: `apps/server/src/index.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/vitest.config.ts`
- Test: `apps/server/src/app.test.ts`

**Interfaces:**
- Consumes: nothing (standalone server bootstrap)
- Produces:
  - `createApp(): Hono` - returns configured Hono instance with OpenAPI middleware
  - Server listens on `PORT` env var (default 3000)
  - `GET /health` returns `{ ok: true }`
  - `GET /openapi.json` returns OpenAPI spec

- [ ] **Step 1: Write failing test**

```typescript
// apps/server/src/app.test.ts
import { describe, it, expect } from 'vitest'
import { createApp } from './app.js'

describe('app bootstrap', () => {
  it('GET /health returns ok', async () => {
    const app = createApp()
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('GET /openapi.json returns valid spec', async () => {
    const app = createApp()
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(200)
    const spec = await res.json()
    expect(spec.openapi).toMatch(/^3/)
    expect(spec.info.title).toBe('StashBro API')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm test -- app.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Create vitest.config.ts**

```typescript
// apps/server/vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node' },
})
```

- [ ] **Step 4: Implement app.ts**

```typescript
// apps/server/src/app.ts
import { OpenAPIHono } from '@hono/zod-openapi'

export function createApp() {
  const app = new OpenAPIHono()

  app.get('/health', (c) => c.json({ ok: true }))

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'StashBro API', version: '1.0.0' },
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
    security: [{ BearerAuth: [] }],
  })

  return app
}
```

- [ ] **Step 5: Implement index.ts**

```typescript
// apps/server/src/index.ts
import { serve } from '@hono/node-server'
import { createApp } from './app.js'

const app = createApp()
const port = parseInt(process.env['PORT'] ?? '3000', 10)

serve({ fetch: app.fetch, port }, () => {
  console.log(`StashBro server listening on :${port}`)
})
```

Note: install `@hono/node-server` for production serving:

```bash
cd apps/server && pnpm add @hono/node-server
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/server && pnpm test -- app.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/server/
git commit -m "feat(server): Hono+OpenAPI bootstrap, /health, /openapi.json"
```

---

### Task 6: apps/server - DB Schema + Migrations

**Files:**
- Create: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/db/index.ts`
- Create: `apps/server/drizzle.config.ts`
- Test: `apps/server/src/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `getDb(path?: string): Database` - returns Drizzle DB instance
  - Drizzle tables: `items`, `tags`, `item_tags`, `users`
  - `items` table columns: `id`, `user_id`, `url`, `title`, `description`, `thumbnail_url`, `favicon_url`, `domain`, `type`, `status`, `priority`, `created_at`, `updated_at`, `deleted_at`, `change_seq`
  - `tags` table: `id`, `user_id`, `name` (unique per user_id)
  - `item_tags` table: `item_id`, `tag_id` (composite PK)
  - `users` table: `id`, `email` (for Phase 5; created now, unused until then)

- [ ] **Step 1: Write failing test**

```typescript
// apps/server/src/db/schema.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { getDb } from './index.js'
import { items, tags, item_tags } from './schema.js'
import { eq } from 'drizzle-orm'

let db: ReturnType<typeof getDb>

afterEach(() => {
  // In-memory DB is discarded after each test
})

describe('DB schema', () => {
  it('inserts and retrieves an item', () => {
    db = getDb(':memory:')
    db.insert(items).values({
      id: 'test-id',
      user_id: 'user-1',
      url: 'https://example.com',
      title: 'Test',
      domain: 'example.com',
      type: 'article',
      status: 'unread',
      priority: 'medium',
      change_seq: 1,
    }).run()

    const result = db.select().from(items).where(eq(items.id, 'test-id')).all()
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('Test')
    expect(result[0]?.priority).toBe('medium')
  })

  it('enforces unique tag name per user', () => {
    db = getDb(':memory:')
    db.insert(tags).values({ id: 't1', user_id: 'u1', name: 'AI' }).run()
    expect(() =>
      db.insert(tags).values({ id: 't2', user_id: 'u1', name: 'AI' }).run()
    ).toThrow()
  })

  it('allows same tag name for different users', () => {
    db = getDb(':memory:')
    db.insert(tags).values({ id: 't1', user_id: 'u1', name: 'AI' }).run()
    expect(() =>
      db.insert(tags).values({ id: 't2', user_id: 'u2', name: 'AI' }).run()
    ).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm test -- schema.test.ts
```

Expected: FAIL - modules not found

- [ ] **Step 3: Implement schema.ts**

```typescript
// apps/server/src/db/schema.ts
import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
})

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  thumbnail_url: text('thumbnail_url'),
  favicon_url: text('favicon_url'),
  domain: text('domain').notNull(),
  type: text('type', { enum: ['video', 'post', 'article', 'other'] }).notNull().default('article'),
  status: text('status', { enum: ['unread', 'archived'] }).notNull().default('unread'),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  deleted_at: text('deleted_at'),
  change_seq: integer('change_seq').notNull().default(0),
})

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
}, (t) => ({
  uniqueUserTag: uniqueIndex('tags_user_name_idx').on(t.user_id, t.name),
}))

export const item_tags = sqliteTable('item_tags', {
  item_id: text('item_id').notNull(),
  tag_id: text('tag_id').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.item_id, t.tag_id] }),
}))
```

- [ ] **Step 4: Implement db/index.ts**

```typescript
// apps/server/src/db/index.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import { sql } from 'drizzle-orm'

export type AppDb = ReturnType<typeof getDb>

export function getDb(path = process.env['DB_PATH'] ?? '/data/stashbro.db') {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  // Create tables if not exist (simple inline DDL - no migration runner needed for SQLite)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE
    )
  `)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      thumbnail_url TEXT,
      favicon_url TEXT,
      domain TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'article' CHECK(type IN ('video','post','article','other')),
      status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','archived')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      change_seq INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.run(sql`CREATE INDEX IF NOT EXISTS items_user_seq ON items(user_id, change_seq)`)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      UNIQUE(user_id, name)
    )
  `)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS item_tags (
      item_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (item_id, tag_id)
    )
  `)

  return db
}
```

- [ ] **Step 5: Create drizzle.config.ts** (for drizzle-kit studio, not required at runtime)

```typescript
// apps/server/drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: process.env['DB_PATH'] ?? '/data/stashbro.db' },
})
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/server && pnpm test -- schema.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db/ apps/server/drizzle.config.ts
git commit -m "feat(server): Drizzle schema (items/tags/item_tags/users) with inline DDL"
```

---

### Task 7: apps/server - Auth Middleware

**Files:**
- Create: `apps/server/src/middleware/auth.ts`
- Modify: `apps/server/src/app.ts` (register middleware)
- Test: `apps/server/src/middleware/auth.test.ts`

**Interfaces:**
- Consumes: `getDb()` from Task 6
- Produces:
  - `authMiddleware`: Hono middleware that reads `Authorization: Bearer <token>`, validates against `AUTH_TOKEN` env var (token mode), sets `c.set('userId', 'default')` on success, returns 401 on failure
  - `c.get('userId'): string` available in all protected routes
  - Design: `AUTH_MODE` env var (`token` | `magic-link`); magic-link slot is a stub that returns 401 until Phase 5

- [ ] **Step 1: Write failing test**

```typescript
// apps/server/src/middleware/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { authMiddleware } from './auth.js'

function makeApp(token: string) {
  process.env['AUTH_TOKEN'] = token
  process.env['AUTH_MODE'] = 'token'
  const app = new Hono<{ Variables: { userId: string } }>()
  app.use('/protected/*', authMiddleware)
  app.get('/protected/test', (c) => c.json({ userId: c.get('userId') }))
  return app
}

describe('authMiddleware token mode', () => {
  it('allows request with correct bearer token', async () => {
    const app = makeApp('secret-token')
    const res = await app.request('/protected/test', {
      headers: { Authorization: 'Bearer secret-token' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.userId).toBe('default')
  })

  it('rejects missing Authorization header', async () => {
    const app = makeApp('secret-token')
    const res = await app.request('/protected/test')
    expect(res.status).toBe(401)
  })

  it('rejects wrong token', async () => {
    const app = makeApp('secret-token')
    const res = await app.request('/protected/test', {
      headers: { Authorization: 'Bearer wrong-token' },
    })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm test -- auth.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement auth.ts**

```typescript
// apps/server/src/middleware/auth.ts
import type { MiddlewareHandler } from 'hono'

// ponytail: AUTH_MODE=magic-link stub always 401s until Phase 5 wires it up
export const authMiddleware: MiddlewareHandler<{ Variables: { userId: string } }> = async (c, next) => {
  const mode = process.env['AUTH_MODE'] ?? 'token'

  if (mode === 'token') {
    const expected = process.env['AUTH_TOKEN']
    if (!expected) return c.json({ error: 'AUTH_TOKEN not configured' }, 500)

    const header = c.req.header('Authorization')
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (token !== expected) return c.json({ error: 'Unauthorized' }, 401)

    c.set('userId', 'default')
    return next()
  }

  // magic-link mode: stub - Phase 5 replaces this block
  return c.json({ error: 'Unauthorized' }, 401)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/server && pnpm test -- auth.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/middleware/
git commit -m "feat(server): token auth middleware, AUTH_MODE stub for magic-link"
```

---

### Task 8: apps/server - Items Endpoints

**Files:**
- Create: `apps/server/src/routes/items.ts`
- Modify: `apps/server/src/app.ts` (register items router)
- Test: `apps/server/src/routes/items.test.ts`

**Interfaces:**
- Consumes: `getDb()` from Task 6, `authMiddleware` from Task 7, `detectType`, `extractDomain` from Task 2 (via `@stashbro/shared`)
- Produces:
  - `POST /items` body: `{ url, title?, type?, priority?, tag_names? }` - creates item, returns `Item`
  - `GET /items?status=unread&type=video&tag=AI&since=<change_seq>&limit=50` - returns `{ items: Item[], nextCursor: number|null }`
  - `PATCH /items/:id` body: `UpdateItemInput` - returns updated `Item`
  - All routes protected by `authMiddleware`; `user_id` from `c.get('userId')`
  - item `id` is uuidv7; `change_seq` is per-user monotonic integer (MAX + 1)

- [ ] **Step 1: Write failing test**

```typescript
// apps/server/src/routes/items.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm test -- items.test.ts
```

Expected: FAIL - routes not registered

- [ ] **Step 3: Implement routes/items.ts**

```typescript
// apps/server/src/routes/items.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { uuidv7 } from 'uuidv7'
import { eq, and, desc, gt, inArray } from 'drizzle-orm'
import { detectType, extractDomain } from '@stashbro/shared'
import { authMiddleware } from '../middleware/auth.js'
import { getDb } from '../db/index.js'
import { items, tags, item_tags } from '../db/schema.js'
import { enrichMetadataAsync } from '../services/metadata.js'

type Env = { Variables: { userId: string } }

const ItemSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  favicon_url: z.string().nullable(),
  domain: z.string(),
  type: z.enum(['video', 'post', 'article', 'other']),
  status: z.enum(['unread', 'archived']),
  priority: z.enum(['low', 'medium', 'high']),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  change_seq: z.number(),
  tags: z.array(z.object({ id: z.string(), user_id: z.string(), name: z.string() })),
})

function nextSeq(db: ReturnType<typeof getDb>, userId: string): number {
  const row = db.select({ seq: items.change_seq })
    .from(items)
    .where(eq(items.user_id, userId))
    .orderBy(desc(items.change_seq))
    .limit(1)
    .all()[0]
  return (row?.seq ?? 0) + 1
}

async function itemWithTags(db: ReturnType<typeof getDb>, itemId: string, userId: string) {
  const [item] = db.select().from(items).where(and(eq(items.id, itemId), eq(items.user_id, userId))).all()
  if (!item) return null
  const tagRows = db.select({ id: tags.id, user_id: tags.user_id, name: tags.name })
    .from(item_tags)
    .innerJoin(tags, eq(item_tags.tag_id, tags.id))
    .where(eq(item_tags.item_id, itemId))
    .all()
  return { ...item, tags: tagRows }
}

async function upsertTags(db: ReturnType<typeof getDb>, userId: string, tagNames: string[], itemId: string) {
  db.delete(item_tags).where(eq(item_tags.item_id, itemId)).run()
  for (const name of tagNames) {
    let tag = db.select().from(tags).where(and(eq(tags.user_id, userId), eq(tags.name, name))).all()[0]
    if (!tag) {
      const tagId = uuidv7()
      db.insert(tags).values({ id: tagId, user_id: userId, name }).run()
      tag = db.select().from(tags).where(eq(tags.id, tagId)).all()[0]!
    }
    db.insert(item_tags).values({ item_id: itemId, tag_id: tag.id }).onConflictDoNothing().run()
  }
}

export function itemsRouter() {
  const app = new OpenAPIHono<Env>()
  app.use('/*', authMiddleware)

  // POST /items
  const createRoute_ = createRoute({
    method: 'post', path: '/',
    request: {
      body: { content: { 'application/json': { schema: z.object({
        url: z.string().url(),
        title: z.string().optional(),
        type: z.enum(['video','post','article','other']).optional(),
        priority: z.enum(['low','medium','high']).optional(),
        tag_names: z.array(z.string()).optional(),
      })}}}
    },
    responses: { 201: { content: { 'application/json': { schema: ItemSchema }}, description: 'Created item' }},
  })
  app.openapi(createRoute_, async (c) => {
    const userId = c.get('userId')
    const body = c.req.valid('json')
    const db = getDb()
    const now = new Date().toISOString()
    const id = uuidv7()
    const domain = extractDomain(body.url)
    const type = body.type ?? detectType(body.url)
    const seq = nextSeq(db, userId)

    db.insert(items).values({
      id, user_id: userId, url: body.url,
      title: body.title ?? body.url,
      domain, type,
      status: 'unread',
      priority: body.priority ?? 'medium',
      created_at: now, updated_at: now,
      change_seq: seq,
    }).run()

    if (body.tag_names?.length) await upsertTags(db, userId, body.tag_names, id)

    // Fire-and-forget metadata enrichment
    enrichMetadataAsync(db, id, body.url).catch(() => {})

    const result = await itemWithTags(db, id, userId)
    return c.json(result!, 201)
  })

  // GET /items
  const listRoute = createRoute({
    method: 'get', path: '/',
    request: { query: z.object({
      status: z.enum(['unread','archived']).optional(),
      type: z.enum(['video','post','article','other']).optional(),
      tag: z.string().optional(),
      since: z.string().optional(),
      limit: z.string().optional(),
    })},
    responses: { 200: { content: { 'application/json': { schema: z.object({
      items: z.array(ItemSchema),
      nextCursor: z.number().nullable(),
    })}}, description: 'List items' }},
  })
  app.openapi(listRoute, async (c) => {
    const userId = c.get('userId')
    const db = getDb()
    const q = c.req.valid('query')
    const limit = Math.min(parseInt(q.limit ?? '50', 10), 200)
    const since = parseInt(q.since ?? '0', 10)

    let rows = db.select().from(items)
      .where(and(
        eq(items.user_id, userId),
        q.status ? eq(items.status, q.status) : undefined,
        q.type ? eq(items.type, q.type) : undefined,
        since > 0 ? gt(items.change_seq, since) : undefined,
      ))
      .orderBy(desc(items.change_seq))
      .limit(limit + 1)
      .all()

    const hasMore = rows.length > limit
    if (hasMore) rows = rows.slice(0, limit)

    // Filter by tag if requested
    let filtered = rows
    if (q.tag) {
      const taggedItemIds = db.select({ item_id: item_tags.item_id })
        .from(item_tags)
        .innerJoin(tags, eq(item_tags.tag_id, tags.id))
        .where(and(eq(tags.user_id, userId), eq(tags.name, q.tag)))
        .all()
        .map(r => r.item_id)
      filtered = rows.filter(r => taggedItemIds.includes(r.id))
    }

    const withTags = await Promise.all(filtered.map(r => itemWithTags(db, r.id, userId)))
    const valid = withTags.filter((r): r is NonNullable<typeof r> => r !== null)

    return c.json({
      items: valid,
      nextCursor: hasMore ? (valid[valid.length - 1]?.change_seq ?? null) : null,
    })
  })

  // PATCH /items/:id
  const patchRoute = createRoute({
    method: 'patch', path: '/:id',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: z.object({
        title: z.string().optional(),
        type: z.enum(['video','post','article','other']).optional(),
        status: z.enum(['unread','archived']).optional(),
        priority: z.enum(['low','medium','high']).optional(),
        deleted_at: z.string().nullable().optional(),
        tag_names: z.array(z.string()).optional(),
      })}}}
    },
    responses: {
      200: { content: { 'application/json': { schema: ItemSchema }}, description: 'Updated item' },
      404: { content: { 'application/json': { schema: z.object({ error: z.string() })}}, description: 'Not found' },
    },
  })
  app.openapi(patchRoute, async (c) => {
    const userId = c.get('userId')
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const db = getDb()

    const existing = db.select().from(items).where(and(eq(items.id, id), eq(items.user_id, userId))).all()[0]
    if (!existing) return c.json({ error: 'Not found' }, 404)

    const seq = nextSeq(db, userId)
    const now = new Date().toISOString()
    db.update(items).set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.deleted_at !== undefined && { deleted_at: body.deleted_at }),
      updated_at: now,
      change_seq: seq,
    }).where(eq(items.id, id)).run()

    if (body.tag_names !== undefined) await upsertTags(db, userId, body.tag_names, id)

    const result = await itemWithTags(db, id, userId)
    return c.json(result!, 200)
  })

  return app
}
```

- [ ] **Step 4: Register items router in app.ts**

```typescript
// apps/server/src/app.ts  (replace full file)
import { OpenAPIHono } from '@hono/zod-openapi'
import { itemsRouter } from './routes/items.js'
import { tagsRouter } from './routes/tags.js'
import { syncRouter } from './routes/sync.js'

export function createApp() {
  const app = new OpenAPIHono()

  app.get('/health', (c) => c.json({ ok: true }))

  app.route('/items', itemsRouter())
  app.route('/tags', tagsRouter())
  app.route('/sync', syncRouter())

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'StashBro API', version: '1.0.0' },
    components: {
      securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer' } },
    },
    security: [{ BearerAuth: [] }],
  })

  return app
}
```

Note: `tagsRouter` and `syncRouter` will be created in Tasks 9-10; create stub files to unblock compilation:

```typescript
// apps/server/src/routes/tags.ts (stub)
import { OpenAPIHono } from '@hono/zod-openapi'
export function tagsRouter() { return new OpenAPIHono() }

// apps/server/src/routes/sync.ts (stub)
import { OpenAPIHono } from '@hono/zod-openapi'
export function syncRouter() { return new OpenAPIHono() }

// apps/server/src/services/metadata.ts (stub)
import type { AppDb } from '../db/index.js'
export async function enrichMetadataAsync(_db: AppDb, _id: string, _url: string): Promise<void> {}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/server && pnpm test -- items.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/ apps/server/src/services/
git commit -m "feat(server): items CRUD (POST/GET/PATCH /items) with auth, uuidv7, change_seq"
```

---

### Task 9: apps/server - Tags Endpoints

**Files:**
- Modify: `apps/server/src/routes/tags.ts` (replace stub)
- Test: `apps/server/src/routes/tags.test.ts`

**Interfaces:**
- Consumes: `getDb()` from Task 6, `authMiddleware` from Task 7
- Produces:
  - `GET /tags` - returns `Tag[]` for current user
  - `POST /tags` body: `{ name: string }` - creates tag if not exists, returns `Tag`

- [ ] **Step 1: Write failing test**

```typescript
// apps/server/src/routes/tags.test.ts
import { describe, it, expect } from 'vitest'
import { createApp } from '../app.js'

process.env['AUTH_TOKEN'] = 'test'
process.env['AUTH_MODE'] = 'token'
process.env['DB_PATH'] = ':memory:'

const AUTH = { Authorization: 'Bearer test', 'Content-Type': 'application/json' }

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
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm test -- tags.test.ts
```

Expected: FAIL - routes return empty

- [ ] **Step 3: Implement routes/tags.ts**

```typescript
// apps/server/src/routes/tags.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { uuidv7 } from 'uuidv7'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { getDb } from '../db/index.js'
import { tags } from '../db/schema.js'

type Env = { Variables: { userId: string } }

const TagSchema = z.object({ id: z.string(), user_id: z.string(), name: z.string() })

export function tagsRouter() {
  const app = new OpenAPIHono<Env>()
  app.use('/*', authMiddleware)

  app.openapi(createRoute({
    method: 'get', path: '/',
    responses: { 200: { content: { 'application/json': { schema: z.array(TagSchema) }}, description: 'Tags' }},
  }), (c) => {
    const db = getDb()
    const userId = c.get('userId')
    return c.json(db.select().from(tags).where(eq(tags.user_id, userId)).all())
  })

  app.openapi(createRoute({
    method: 'post', path: '/',
    request: { body: { content: { 'application/json': { schema: z.object({ name: z.string().min(1) })}}}},
    responses: { 201: { content: { 'application/json': { schema: TagSchema }}, description: 'Created tag' }},
  }), (c) => {
    const db = getDb()
    const userId = c.get('userId')
    const { name } = c.req.valid('json')
    const existing = db.select().from(tags).where(and(eq(tags.user_id, userId), eq(tags.name, name))).all()[0]
    if (existing) return c.json(existing, 201)
    const id = uuidv7()
    db.insert(tags).values({ id, user_id: userId, name }).run()
    return c.json(db.select().from(tags).where(eq(tags.id, id)).all()[0]!, 201)
  })

  return app
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/server && pnpm test -- tags.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/tags.ts apps/server/src/routes/tags.test.ts
git commit -m "feat(server): GET/POST /tags with idempotent create"
```

---

### Task 10: apps/server - Sync Push/Pull Endpoints

**Files:**
- Modify: `apps/server/src/routes/sync.ts` (replace stub)
- Test: `apps/server/src/routes/sync.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `authMiddleware`; `SyncChange` shape from `@stashbro/shared`
- Produces:
  - `POST /sync/push` body: `{ changes: SyncChange[] }` - applies changes LWW by `updated_at`, returns `{ accepted: number }`
  - `GET /sync/pull?cursor=<n>` - returns `{ changes: SyncChange[], cursor: number }` where cursor is max change_seq
  - LWW rule: if server item `updated_at >= change.updated_at`, skip that change
  - Tombstones: `deleted_at` non-null items are included in pull; server purges items where `deleted_at` is older than 90 days on `GET /sync/pull`

- [ ] **Step 1: Write failing test**

```typescript
// apps/server/src/routes/sync.test.ts
import { describe, it, expect } from 'vitest'
import { createApp } from '../app.js'

process.env['AUTH_TOKEN'] = 'test'
process.env['AUTH_MODE'] = 'token'
process.env['DB_PATH'] = ':memory:'

const AUTH = { Authorization: 'Bearer test', 'Content-Type': 'application/json' }

function makeChange(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sync-item-1',
    change_seq: 1,
    updated_at: new Date().toISOString(),
    deleted_at: null,
    url: 'https://example.com',
    title: 'Synced Item',
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

describe('POST /sync/push', () => {
  it('accepts changes and returns accepted count', async () => {
    const app = createApp()
    const res = await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange()] }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accepted).toBe(1)
  })

  it('LWW: skips change if server updated_at is newer', async () => {
    const app = createApp()
    // First push - old timestamp
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ updated_at: '2026-01-02T00:00:00.000Z', title: 'New' })] }),
    })
    // Second push - even older timestamp should be ignored
    const res = await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ updated_at: '2026-01-01T00:00:00.000Z', title: 'Old' })] }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accepted).toBe(0)
  })
})

describe('GET /sync/pull', () => {
  it('returns all changes since cursor', async () => {
    const app = createApp()
    await app.request('/sync/push', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ changes: [makeChange({ id: 'p1', change_seq: 1 }), makeChange({ id: 'p2', change_seq: 2 })] }),
    })
    const res = await app.request('/sync/pull?cursor=0', { headers: AUTH })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.changes.length).toBeGreaterThanOrEqual(2)
    expect(typeof body.cursor).toBe('number')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm test -- sync.test.ts
```

Expected: FAIL - routes return empty

- [ ] **Step 3: Implement routes/sync.ts**

```typescript
// apps/server/src/routes/sync.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { uuidv7 } from 'uuidv7'
import { eq, and, gt, lte, desc, max } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { getDb } from '../db/index.js'
import { items, tags, item_tags } from '../db/schema.js'

type Env = { Variables: { userId: string } }

const SyncChangeSchema = z.object({
  id: z.string(),
  change_seq: z.number(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  url: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  favicon_url: z.string().nullable(),
  domain: z.string(),
  type: z.enum(['video','post','article','other']),
  status: z.enum(['unread','archived']),
  priority: z.enum(['low','medium','high']),
  tag_names: z.array(z.string()),
})

function nextSeqForUser(db: ReturnType<typeof getDb>, userId: string): number {
  const row = db.select({ seq: items.change_seq })
    .from(items).where(eq(items.user_id, userId))
    .orderBy(desc(items.change_seq)).limit(1).all()[0]
  return (row?.seq ?? 0) + 1
}

async function toSyncChange(db: ReturnType<typeof getDb>, item: typeof items.$inferSelect): Promise<z.infer<typeof SyncChangeSchema>> {
  const tagRows = db.select({ name: tags.name })
    .from(item_tags)
    .innerJoin(tags, eq(item_tags.tag_id, tags.id))
    .where(eq(item_tags.item_id, item.id))
    .all()
  return {
    id: item.id, change_seq: item.change_seq, updated_at: item.updated_at,
    deleted_at: item.deleted_at ?? null, url: item.url, title: item.title,
    description: item.description ?? null, thumbnail_url: item.thumbnail_url ?? null,
    favicon_url: item.favicon_url ?? null, domain: item.domain,
    type: item.type as 'video'|'post'|'article'|'other',
    status: item.status as 'unread'|'archived',
    priority: item.priority as 'low'|'medium'|'high',
    tag_names: tagRows.map(t => t.name),
  }
}

export function syncRouter() {
  const app = new OpenAPIHono<Env>()
  app.use('/*', authMiddleware)

  // POST /sync/push
  app.openapi(createRoute({
    method: 'post', path: '/push',
    request: { body: { content: { 'application/json': { schema: z.object({ changes: z.array(SyncChangeSchema) })}}}},
    responses: { 200: { content: { 'application/json': { schema: z.object({ accepted: z.number() })}}, description: 'Push result' }},
  }), async (c) => {
    const userId = c.get('userId')
    const db = getDb()
    const { changes } = c.req.valid('json')
    let accepted = 0

    for (const change of changes) {
      const existing = db.select().from(items).where(and(eq(items.id, change.id), eq(items.user_id, userId))).all()[0]
      if (existing && existing.updated_at >= change.updated_at) continue // LWW: server wins

      const seq = nextSeqForUser(db, userId)
      if (existing) {
        db.update(items).set({
          url: change.url, title: change.title, description: change.description,
          thumbnail_url: change.thumbnail_url, favicon_url: change.favicon_url,
          domain: change.domain, type: change.type, status: change.status,
          priority: change.priority, updated_at: change.updated_at,
          deleted_at: change.deleted_at, change_seq: seq,
        }).where(eq(items.id, change.id)).run()
      } else {
        const now = new Date().toISOString()
        db.insert(items).values({
          id: change.id, user_id: userId, url: change.url, title: change.title,
          description: change.description, thumbnail_url: change.thumbnail_url,
          favicon_url: change.favicon_url, domain: change.domain, type: change.type,
          status: change.status, priority: change.priority,
          created_at: now, updated_at: change.updated_at,
          deleted_at: change.deleted_at, change_seq: seq,
        }).run()
      }

      // Sync tags
      db.delete(item_tags).where(eq(item_tags.item_id, change.id)).run()
      for (const name of change.tag_names) {
        let tag = db.select().from(tags).where(and(eq(tags.user_id, userId), eq(tags.name, name))).all()[0]
        if (!tag) {
          const tagId = uuidv7()
          db.insert(tags).values({ id: tagId, user_id: userId, name }).run()
          tag = db.select().from(tags).where(eq(tags.id, tagId)).all()[0]!
        }
        db.insert(item_tags).values({ item_id: change.id, tag_id: tag.id }).onConflictDoNothing().run()
      }

      accepted++
    }

    return c.json({ accepted })
  })

  // GET /sync/pull
  app.openapi(createRoute({
    method: 'get', path: '/pull',
    request: { query: z.object({ cursor: z.string().default('0') }) },
    responses: { 200: { content: { 'application/json': { schema: z.object({
      changes: z.array(SyncChangeSchema), cursor: z.number(),
    })}}, description: 'Pull result' }},
  }), async (c) => {
    const userId = c.get('userId')
    const db = getDb()
    const cursor = parseInt(c.req.valid('query').cursor, 10)

    // Purge tombstones older than 90 days
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    db.delete(items).where(and(eq(items.user_id, userId), lte(items.deleted_at, cutoff))).run()

    const rows = db.select().from(items)
      .where(and(eq(items.user_id, userId), gt(items.change_seq, cursor)))
      .orderBy(desc(items.change_seq))
      .all()

    const changes = await Promise.all(rows.map(r => toSyncChange(db, r)))
    const maxSeq = rows[0]?.change_seq ?? cursor

    return c.json({ changes, cursor: maxSeq })
  })

  return app
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/server && pnpm test -- sync.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/sync.ts apps/server/src/routes/sync.test.ts
git commit -m "feat(server): sync push/pull (LWW by updated_at, tombstones, 90-day purge)"
```

---

### Task 11: apps/server - Metadata Enrichment

**Files:**
- Modify: `apps/server/src/services/metadata.ts` (replace stub)
- Test: `apps/server/src/services/metadata.test.ts`

**Interfaces:**
- Consumes: `getDb()` from Task 6; `items` schema table
- Produces:
  - `enrichMetadataAsync(db, itemId, url): Promise<void>` - fetches og tags + oEmbed, updates item row; 3 retries with exponential backoff; URL-as-title fallback on permanent failure
  - `fetchOgMeta(url: string): Promise<{ title?: string; description?: string; image?: string; favicon?: string }>` - exported for testing
  - `fetchOEmbed(url: string): Promise<{ title?: string; thumbnail_url?: string } | null>` - oEmbed for YouTube (`https://www.youtube.com/oembed?url=<url>&format=json`) and X/Twitter (`https://publish.twitter.com/oembed?url=<url>`)

- [ ] **Step 1: Write failing test**

```typescript
// apps/server/src/services/metadata.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchOgMeta, fetchOEmbed } from './metadata.js'

// mock fetch globally for this test file
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function htmlResponse(html: string) {
  return { ok: true, text: async () => html, headers: { get: () => 'text/html' } }
}

describe('fetchOgMeta', () => {
  beforeEach(() => mockFetch.mockReset())

  it('extracts og:title and og:image', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(`
      <html><head>
        <meta property="og:title" content="Test Title">
        <meta property="og:description" content="Test Desc">
        <meta property="og:image" content="https://example.com/img.jpg">
        <link rel="icon" href="/favicon.ico">
      </head></html>
    `))
    const result = await fetchOgMeta('https://example.com')
    expect(result.title).toBe('Test Title')
    expect(result.description).toBe('Test Desc')
    expect(result.image).toBe('https://example.com/img.jpg')
  })

  it('returns empty object on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'))
    const result = await fetchOgMeta('https://example.com')
    expect(result).toEqual({})
  })
})

describe('fetchOEmbed', () => {
  beforeEach(() => mockFetch.mockReset())

  it('fetches YouTube oEmbed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: 'YT Video', thumbnail_url: 'https://i.ytimg.com/vi/abc/hq.jpg' }),
    })
    const result = await fetchOEmbed('https://youtube.com/watch?v=abc')
    expect(result?.title).toBe('YT Video')
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('youtube.com/oembed'))
  })

  it('returns null for non-oEmbed URLs', async () => {
    const result = await fetchOEmbed('https://stratechery.com/article')
    expect(result).toBeNull()
  })
})

describe('fetchOgMeta SSRF guard', () => {
  it('returns {} for localhost URL (SSRF block)', async () => {
    const result = await fetchOgMeta('http://localhost/admin')
    expect(result).toEqual({})
  })

  it('returns {} for 192.168.x private IP', async () => {
    const result = await fetchOgMeta('http://192.168.1.1/secret')
    expect(result).toEqual({})
  })

  it('returns {} for 10.x private IP', async () => {
    const result = await fetchOgMeta('http://10.0.0.1/internal')
    expect(result).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm test -- metadata.test.ts
```

Expected: FAIL - exports not found

- [ ] **Step 3: Implement services/metadata.ts**

```typescript
// apps/server/src/services/metadata.ts
import { eq } from 'drizzle-orm'
import { lookup } from 'dns/promises'
import type { AppDb } from '../db/index.js'
import { items } from '../db/schema.js'

// ponytail: SSRF guard - blocks fetches to private/loopback IPs; required since users supply URLs
function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges + loopback
  const privateRanges = [
    /^127\./,                              // loopback
    /^10\./,                               // RFC1918
    /^192\.168\./,                         // RFC1918
    /^172\.(1[6-9]|2\d|3[0-1])\./,       // RFC1918
    /^169\.254\./,                         // link-local
    /^0\./,                                // unspecified
    /^::1$/,                               // IPv6 loopback
    /^fc00:/,                              // IPv6 unique local
    /^fd[0-9a-f]{2}:/i,                   // IPv6 unique local
    /^fe80:/i,                             // IPv6 link-local
  ]
  return privateRanges.some(r => r.test(ip))
}

async function assertSSRFSafe(url: string): Promise<void> {
  const parsed = new URL(url)
  const host = parsed.hostname
  // Block raw IP addresses that are private
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    if (isPrivateIP(host)) throw new Error(`SSRF: private IP blocked: ${host}`)
    return
  }
  // Resolve hostname and check resolved IPs
  try {
    const addresses = await lookup(host, { all: true })
    for (const { address } of addresses) {
      if (isPrivateIP(address)) throw new Error(`SSRF: hostname resolves to private IP: ${address}`)
    }
  } catch (err) {
    if ((err as Error).message.startsWith('SSRF:')) throw err
    // DNS resolution failed - block to be safe
    throw new Error(`SSRF: DNS resolution failed for ${host}`)
  }
}

const OEMBED_PROVIDERS: Array<{ pattern: RegExp; endpoint: string }> = [
  { pattern: /youtube\.com|youtu\.be/, endpoint: 'https://www.youtube.com/oembed' },
  { pattern: /twitter\.com|x\.com/, endpoint: 'https://publish.twitter.com/oembed' },
]

export async function fetchOgMeta(url: string): Promise<{
  title?: string; description?: string; image?: string; favicon?: string
}> {
  try {
    await assertSSRFSafe(url)
    const res = await fetch(url, {
      headers: { 'User-Agent': 'StashBro/1.0 (+https://github.com/stashbro)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return {}
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return {}
    const html = await res.text()
    const get = (prop: string) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
      return m?.[1]
    }
    const faviconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)
      ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i)
    let favicon = faviconMatch?.[1]
    if (favicon && !favicon.startsWith('http')) {
      try { favicon = new URL(favicon, url).href } catch { favicon = undefined }
    }
    return {
      title: get('og:title') ?? get('twitter:title'),
      description: get('og:description') ?? get('twitter:description'),
      image: get('og:image') ?? get('twitter:image'),
      favicon,
    }
  } catch {
    return {}
  }
}

export async function fetchOEmbed(url: string): Promise<{ title?: string; thumbnail_url?: string } | null> {
  const provider = OEMBED_PROVIDERS.find(p => p.pattern.test(url))
  if (!provider) return null
  // oEmbed endpoints are hardcoded to trusted providers - no SSRF check needed here
  try {
    const endpoint = `${provider.endpoint}?url=${encodeURIComponent(url)}&format=json`
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return res.json() as Promise<{ title?: string; thumbnail_url?: string }>
  } catch {
    return null
  }
}

async function enrichOnce(db: AppDb, itemId: string, url: string): Promise<void> {
  const [og, oembed] = await Promise.all([fetchOgMeta(url), fetchOEmbed(url)])
  const update: Record<string, string | null> = {}
  const title = oembed?.title ?? og.title
  if (title) update['title'] = title
  if (og.description) update['description'] = og.description
  const thumbnail = oembed?.thumbnail_url ?? og.image ?? null
  if (thumbnail !== undefined) update['thumbnail_url'] = thumbnail
  if (og.favicon) update['favicon_url'] = og.favicon
  if (Object.keys(update).length > 0) {
    db.update(items).set({ ...update, updated_at: new Date().toISOString() }).where(eq(items.id, itemId)).run()
  }
}

export async function enrichMetadataAsync(db: AppDb, itemId: string, url: string): Promise<void> {
  // ponytail: immediate first attempt, then exponential backoff; 3 total attempts per spec
  const delays = [0, 2000, 8000]
  for (const delay of delays) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    try {
      await enrichOnce(db, itemId, url)
      return
    } catch {
      // retry - URL-as-title fallback already in place from insert
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/server && pnpm test -- metadata.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/metadata.ts apps/server/src/services/metadata.test.ts
git commit -m "feat(server): async metadata enrichment (og tags + oEmbed, 3-retry backoff)"
```

---

### Task 12: apps/server - OpenAPI Export + Dockerfile

**Files:**
- Modify: `apps/server/src/app.ts` (ensure `/openapi.json` serves complete spec)
- Create: `apps/server/Dockerfile`
- Create: `apps/server/src/scripts/export-openapi.ts`
- Test: `apps/server/src/routes/openapi.test.ts`

**Interfaces:**
- Consumes: fully wired `createApp()` from Tasks 5-11
- Produces:
  - `GET /openapi.json` returns valid OpenAPI 3.1 spec with all item/tag/sync routes documented
  - `apps/server/openapi.json` static file (generated by `pnpm run export-openapi`) - this is what Phase 2 feeds to `swift-openapi-generator`
  - Docker image: `EXPOSE 3000`, `ENV DB_PATH=/data/stashbro.db`, volume at `/data`

- [ ] **Step 1: Write failing test**

```typescript
// apps/server/src/routes/openapi.test.ts
import { describe, it, expect } from 'vitest'
import { createApp } from '../app.js'

process.env['AUTH_TOKEN'] = 'test'
process.env['AUTH_MODE'] = 'token'
process.env['DB_PATH'] = ':memory:'

describe('OpenAPI spec', () => {
  it('includes /items POST endpoint', async () => {
    const app = createApp()
    const res = await app.request('/openapi.json')
    const spec = await res.json()
    expect(spec.paths['/items']).toBeDefined()
    expect(spec.paths['/items']['post']).toBeDefined()
  })

  it('includes /sync/pull GET endpoint', async () => {
    const app = createApp()
    const res = await app.request('/openapi.json')
    const spec = await res.json()
    expect(spec.paths['/sync/pull']).toBeDefined()
  })

  it('includes /sync/push POST endpoint', async () => {
    const app = createApp()
    const res = await app.request('/openapi.json')
    const spec = await res.json()
    expect(spec.paths['/sync/push']).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm test -- openapi.test.ts
```

Expected: FAIL - paths missing (routes not correctly mounted with OpenAPI path prefix)

- [ ] **Step 3: Fix app.ts route mounting for correct OpenAPI path registration**

`@hono/zod-openapi` requires routes to be mounted with the base path included in the route definitions when using `.route()`. Update each router to include the base path prefix in route definitions, or use `app.route()` with explicit prefix and verify the spec output. Confirm all routes appear in the spec:

```bash
cd apps/server && pnpm build && node -e "
import('./dist/app.js').then(({createApp}) => {
  const app = createApp()
  app.request('/openapi.json').then(r => r.json()).then(spec => {
    console.log('Paths:', Object.keys(spec.paths ?? {}))
  })
})"
```

Expected output includes: `/items`, `/items/{id}`, `/tags`, `/sync/push`, `/sync/pull`

- [ ] **Step 4: Create export-openapi.ts script**

```typescript
// apps/server/src/scripts/export-openapi.ts
import { createApp } from '../app.js'
import { writeFileSync } from 'fs'

const app = createApp()
app.request('/openapi.json').then(async (res) => {
  const spec = await res.json()
  writeFileSync('openapi.json', JSON.stringify(spec, null, 2))
  console.log('Exported openapi.json')
})
```

Add to `apps/server/package.json` scripts:
```json
"export-openapi": "node dist/scripts/export-openapi.js"
```

- [ ] **Step 5: Generate openapi.json**

```bash
cd apps/server && pnpm build && pnpm run export-openapi
```

Expected: `apps/server/openapi.json` created (~3-5KB JSON)

- [ ] **Step 6: Create Dockerfile**

```dockerfile
# apps/server/Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared/
COPY apps/server ./apps/server/
RUN pnpm --filter @stashbro/shared build
RUN pnpm --filter @stashbro/server build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
VOLUME /data
ENV DB_PATH=/data/stashbro.db
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
```

- [ ] **Step 7: Run test to verify it passes**

```bash
cd apps/server && pnpm test -- openapi.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 8: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass across `packages/shared` and `apps/server`

- [ ] **Step 9: Commit**

```bash
git add apps/server/Dockerfile apps/server/openapi.json apps/server/src/scripts/ apps/server/package.json
git commit -m "feat(server): OpenAPI spec export + Dockerfile; all Phase 1 tests green"
```

