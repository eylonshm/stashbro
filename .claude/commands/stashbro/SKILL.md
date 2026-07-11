---
name: stashbro
description: Use when building, running, debugging, or modifying StashBro - the reading list monorepo. Branches by client - server, mac, mobile, extension, shared. Routes to per-client reference.
---

# StashBro

Universal reading list. Five clients share one sync protocol over a single SQLite-backed server.

## Branches

Each client is a branch. Read the file matching your work - load one, not all:

| You're touching | Read | Leading concerns |
|-----------------|------|-----------------|
| API routes, sync protocol, auth, Docker | [server.md](server.md) | cursor-based sync, LWW, rate limiting |
| Mac notch, menubar, hotkey, share ext | [mac.md](mac.md) | notch panel, GRDB observation, inbox pattern |
| Expo iOS app, share ext, widget | [mobile.md](mobile.md) | WAL checkpoint, inbox pattern, app group |
| Browser popup, background, options | [extension.md](extension.md) | offline queue, port conflict |
| Types, API client, sync engine | [shared.md](shared.md) | saveLocalItem funnel, 401 refresh |

## Invariants (bind every branch)

These hold across all clients. Violating any creates sync bugs:

- **saveLocalItem funnel**: every local mutation allocates `MAX(change_seq)+1` through one function. Bypassing it (raw INSERT/UPDATE) means the change never appears in `getChangesSince` and never syncs.
- **Inbox pattern**: share extensions write one JSON file per item to an app-group directory (atomic write, uuidv7 filename). The host app ingests on foreground. Share extensions never open SQLite.
- **Widget readonly**: widgets open the database read-only (`config.readonly=true` on Mac, `SQLITE_OPEN_READONLY` on iOS). A widget that opens read-write will run migrations and corrupt the schema for the main app.
- **Cursor-based sync**: push then pull. Pull uses ASC ordering by change_seq. DESC ordering causes infinite re-serve of the same page.
- **LWW by updated_at**: server wins on tie (`>=` on server push, `>` on client apply). Enrichment bumps change_seq with anti-clobber guards so metadata doesn't overwrite user edits.
- **Nullish contract**: server zod schemas use `.nullish()` for optional fields. Swift clients omit nil values; server coerces with `?? null`. Changing to `.nullable()` or `.optional()` breaks the contract.

## Quick Start

```bash
pnpm test                                                              # all tests
AUTH_MODE=token AUTH_TOKEN=secret pnpm --filter @stashbro/server dev    # server
cd packages/extension && pnpm build                                    # extension
cd apps/mac && xcodegen generate && open StashBro.xcodeproj             # mac (Cmd+R)
cd apps/mobile && npx expo run:ios                                     # ios
```

## Specs

Design spec: `docs/superpowers/specs/2026-07-10-stashbro-design.md`
Build ledger: `.superpowers/sdd/progress.md`
