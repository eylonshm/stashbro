# Mobile (iOS)

Expo SDK, expo-router, expo-sqlite.

## Build

```bash
cd apps/mobile
npx expo prebuild              # generates ios/
npx expo run:ios               # simulator
npx expo run:ios --device      # real device (needs signing)
```

Share extension + widget need `appleTeamId` in `app.json` (not yet configured).

## WAL Checkpoint (widget bridge)

expo-sqlite stores the DB in the app sandbox, not the app group. The widget can't access it. After each sync, `copyDbToAppGroup()` runs:

1. `PRAGMA wal_checkpoint(TRUNCATE)` - flushes WAL into main DB and zeroes WAL
2. Atomic copy: `copyFile` to `.tmp`, then `moveFile` to final path

The widget reads this copy via sqlite3 C API with `SQLITE_OPEN_READONLY`. Widget freshness ceiling: 0-15 min behind sync.

## Share Extension (inbox pattern)

expo-share-extension v5.0.6 (patched via `patches/expo-share-extension@5.0.6.patch`):
- Shared data arrives as `InitialProps` component props
- Patch 1: iOS deployment target 15.1 → 16.4 (ExtensionStorage pod needs it)
- Patch 2 (backport of upstream 6.0.0-beta): use `ExpoReactNativeFactory` instead of
  `RCTReactNativeFactory` in `ShareExtensionViewController.swift`. Without it the
  Expo JSI host (`globalThis.expo`) is never installed in the extension runtime, so
  any `expo-*` JS import (incl. expo-share-extension itself) throws
  "Cannot read property 'EventEmitter' of undefined" at module load →
  `AppRegistry.registerComponent` never runs → blank white sheet.
- No global `crypto` in Hermes: use `genId()` (src/sync/SQLiteLocalStore.ts), never `crypto.randomUUID()`
- Dev-mode bundle routing: metro.config.js wraps `withShareExtension` and adds a
  monorepo-aware rewrite (`?shareExtension=true` → `apps/mobile/index.share.bundle`);
  the lib's own rewrite only matches non-monorepo `index.bundle` URLs

Writes JSON to `{appGroup}/inbox/`. On foreground, `ingestShareExtensionInbox()` reads each file, calls `saveLocalItem`, deletes on success, keeps on DB error for retry.

### App group files

| File | Writer | Reader | Purpose |
|------|--------|--------|---------|
| `inbox/*.json` | share ext | host app | saved item queue |
| `stashbro.db` | host app (`copyDbToAppGroup`) | widget | widget data |
| `tags.json` | host app (`writeTagsToAppGroup`, after each sync) | share ext | tag suggestions |
| `credentials.json` | host app (`useSyncEngine` init) | share ext | direct upload creds (`{serverURL, token}`) |

### Share extension features (PR feat/share-ext-polish)
- **Auto-fetch metadata**: on open, fetches shared URL (5s timeout), populates title + description; user edits take precedence
- **Tags input**: chips + free-text, suggests from `tags.json`, included in inbox JSON and direct upload
- **Direct upload**: POSTs to `/sync/push` using `credentials.json`; inbox always written first (offline-safe). Status: "Saved & synced" vs "Saved - will sync later"
- **Dark/light theme**: follows system via `useColorScheme()`; `backgroundColor` removed from plugin config so Swift falls back to `.systemBackground`
- **Clipping fix**: sheet height raised to 600pt to accommodate new description + tags fields

## Sync Engine Lifecycle

Module-level refs `_initFn` and `_syncFn` let the settings screen reinitialize without React context wiring. `reinitializeSyncEngine()` and `triggerSync()` are exported for this.

`useSyncEngine` hook: creates `SQLiteLocalStore` + `StashBroClient`, starts sync on mount, re-syncs on AppState `active`.

## Gotchas

- **Metro pnpm**: `metro.config.js` has `watchFolders` for `packages/shared`, `nodeModulesPaths` for hoisted deps, `disableHierarchicalLookup: true`. Missing any of these causes "module not found" at build.
- **Tag deletion propagation**: `deleteTagLocal` must call `saveLocalItem` on each affected item (with reduced `tag_names`) before deleting the tag row. Raw DELETE on the tag without bumping items' change_seq means the server re-delivers the tag on next pull.
- **App group**: `group.com.stashbro.mobile` - shared container for inbox + widget DB.

## AsyncStorage Keys

`stashbro:serverURL`, `stashbro:serverToken`, `stashbro:refreshToken`, `stashbro:userId`, `stashbro:deviceId`
