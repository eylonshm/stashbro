# StashBro Mobile (iOS) Reference

Expo SDK app with expo-router, expo-sqlite, share extension, WidgetKit widget.

## Build & Run

```bash
cd apps/mobile
npx expo prebuild              # generates ios/ folder
npx expo run:ios               # builds + runs on simulator
npx expo run:ios --device      # builds + runs on real device (needs signing)
```

Share extension + widget need Apple team ID: set `appleTeamId` in `app.json` (not yet configured).

## Metro Config

`metro.config.js` has pnpm monorepo support: `watchFolders` includes `packages/shared`, `nodeModulesPaths` for hoisted deps, `disableHierarchicalLookup` for pnpm.

## File Structure

```
apps/mobile/
  app.json                    # Expo config, plugins (share-extension, apple-targets)
  metro.config.js             # pnpm monorepo support
  app/
    _layout.tsx               # expo-router root layout
    index.tsx                 # Main list (Swipeable archive, pull-to-sync)
    settings.tsx              # Server URL + token/magic-link login
    tags.tsx                  # Tag management
  src/
    db/
      schema.ts               # MIGRATIONS array (incremental DDL)
      database.ts             # openDatabase() singleton
    sync/
      SQLiteLocalStore.ts     # LocalStore impl, saveLocalItem (MAX+1 seq), SyncDb/CursorStorage injection
      ingestInbox.ts          # Reads JSON files from share extension inbox
    hooks/
      useItems.ts             # buildItemsQuery with filters, GRDB-style observation
      useSyncEngine.ts        # SyncEngine lifecycle, AppState foreground trigger, DB->app-group copy
      useTheme.ts             # Light/dark theme hook
    lib/
      config.ts               # validateServerUrl
      tags.ts                 # deleteTagLocal with saveLocalItem propagation
  share-extension/
    index.tsx                 # JSON inbox writer (InitialProps API, pathForGroup)
  ios-widgets/
    StashBroIOSWidget/        # WidgetKit (sqlite3 C API, readonly, reads from app group)
```

## Key Patterns

- **Local DB:** expo-sqlite in app sandbox (NOT app group). Widget can't access it directly.
- **Widget DB access:** After each sync, `copyDbToAppGroup()` runs `PRAGMA wal_checkpoint(TRUNCATE)` then atomic copy (tmp + rename) to app group. Widget reads via sqlite3 C API with `SQLITE_OPEN_READONLY`.
- **Share extension:** Uses `expo-share-extension` v1.10.7 `InitialProps` API (not `getShareData`). Writes JSON to app-group inbox with `pathForGroup` (not `AppGroupDirectoryPath`).
- **Inbox ingestion:** On app foreground, `ingestShareExtensionInbox()` reads JSON files, calls `saveLocalItem` for each, deletes on success, keeps on DB error for retry.
- **Sync engine:** Module-level refs (`_initFn`, `_syncFn`) so settings screen can reinitialize without React context. `reinitializeSyncEngine()` exported for settings save.
- **401 auto-refresh:** StashBroClient constructor takes optional `TokenRefreshHooks` for hosted mode. Reads/writes refresh token from AsyncStorage.

## AsyncStorage Keys

| Key | What |
|-----|------|
| `stashbro:serverURL` | Server base URL |
| `stashbro:serverToken` | Bearer/access token |
| `stashbro:refreshToken` | Refresh token (hosted mode) |
| `stashbro:userId` | User ID for sync cursor isolation |
| `stashbro:deviceId` | Device ID for token rotation |

## App Group

`group.com.stashbro.mobile` - shared container for share extension inbox + widget DB copy.
