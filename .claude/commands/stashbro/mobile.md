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

expo-share-extension v1.10.7 API surface:
- Uses `InitialProps` (not `getShareData`)
- Uses `pathForGroup` (not `AppGroupDirectoryPath`)
- No metro subpath support

Writes JSON to `{appGroup}/inbox/`. On foreground, `ingestShareExtensionInbox()` reads each file, calls `saveLocalItem`, deletes on success, keeps on DB error for retry.

## Sync Engine Lifecycle

Module-level refs `_initFn` and `_syncFn` let the settings screen reinitialize without React context wiring. `reinitializeSyncEngine()` and `triggerSync()` are exported for this.

`useSyncEngine` hook: creates `SQLiteLocalStore` + `StashBroClient`, starts sync on mount, re-syncs on AppState `active`.

## Gotchas

- **Metro pnpm**: `metro.config.js` has `watchFolders` for `packages/shared`, `nodeModulesPaths` for hoisted deps, `disableHierarchicalLookup: true`. Missing any of these causes "module not found" at build.
- **Tag deletion propagation**: `deleteTagLocal` must call `saveLocalItem` on each affected item (with reduced `tag_names`) before deleting the tag row. Raw DELETE on the tag without bumping items' change_seq means the server re-delivers the tag on next pull.
- **App group**: `group.com.stashbro.mobile` - shared container for inbox + widget DB.

## AsyncStorage Keys

`stashbro:serverURL`, `stashbro:serverToken`, `stashbro:refreshToken`, `stashbro:userId`, `stashbro:deviceId`
