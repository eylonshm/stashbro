# Shared Package

TypeScript types, API client, sync engine. Used by mobile + extension. Mac reimplements in Swift.

## Build

```bash
pnpm --filter @stashbro/shared build    # tsc
pnpm --filter @stashbro/shared test     # vitest
```

## saveLocalItem Funnel

The single mutation path for all local writes across every client. Each implementation (expo-sqlite `SQLiteLocalStore`, GRDB `GRDBLocalStore`) allocates `MAX(change_seq)+1` atomically. This is how local changes become visible to `getChangesSince` for push.

Every code path that creates or modifies an item locally - save from share extension, archive from list, tag edit, priority change - must route through `saveLocalItem`. A raw INSERT/UPDATE that skips it produces an item that exists locally but never syncs.

## StashBroClient

```typescript
constructor(config: { baseUrl, token }, fetchImpl?, onRefresh?: TokenRefreshHooks)
```

On 401: if `onRefresh` provided, calls `/auth/refresh`, updates Authorization header, retries once. If refresh fails, throws "Session expired".

`TokenRefreshHooks`: `{ getRefreshToken(): Promise<string|null>, setAccessToken(t): Promise<void> }`

## SyncEngine

```typescript
constructor({ client, store: LocalStore, onSyncComplete? })
```

`sync()`: push local changes -> pull remote changes -> `onSyncComplete()`.

## LocalStore Interface

| Method | What |
|--------|------|
| `getChangesSince(seq)` | local changes for push |
| `applyRemoteChanges(changes)` | apply pulled changes - preserves server seq (no echo loop) |
| `getCursor()` / `setCursor()` | per-user sync cursor |
| `saveLocalItem(item)` | the funnel - MAX+1 seq allocation |

## Gotchas

- **Echo loop prevention**: `applyRemoteChanges` must preserve the server's `change_seq`, not allocate a new local one. Allocating `MAX+1` on apply means the item re-appears in `getChangesSince` and gets pushed back to the server forever.
- **SyncChange nullish fields**: `description`, `thumbnail_url`, `favicon_url`, `deleted_at` are `.nullish()` in zod. Swift sends nothing for nil; TypeScript sends `undefined`. Server coerces both to `null` with `?? null`.
