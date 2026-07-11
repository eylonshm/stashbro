# StashBro

Open-source universal reading list. Save links from Mac, iPhone, browser. Local-first sync.

## Quick Start

```bash
pnpm test                    # 92+ tests across all packages
pnpm --filter @stashbro/server dev   # start server (needs AUTH_MODE + AUTH_TOKEN env vars)
```

## Monorepo Layout

| Path | What | Tech |
|------|------|------|
| `apps/server` | API server | Hono + Drizzle + better-sqlite3 |
| `apps/mac` | Mac app (notch + menubar + share ext + Safari ext + widget) | SwiftUI + GRDB + XcodeGen |
| `apps/mobile` | iOS app (share ext + widget) | Expo + expo-sqlite |
| `packages/shared` | Types, API client, sync engine | TypeScript |
| `packages/extension` | Browser extension | WXT MV3 + React |

## Key Commands

| Task | Command |
|------|---------|
| Run all tests | `pnpm test` |
| Server dev | `AUTH_MODE=token AUTH_TOKEN=secret pnpm --filter @stashbro/server dev` |
| Build extension | `cd packages/extension && pnpm build` |
| Build Mac project | `cd apps/mac && xcodegen generate && open StashBro.xcodeproj` |
| E2E smoke | `SERVER_URL=http://localhost:3000 AUTH_TOKEN=secret bash scripts/e2e-smoke.sh` |

Use `/server`, `/mac`, `/mobile`, `/extension` commands for detailed client reference.

## Architecture Invariants

- All local writes funnel through `saveLocalItem` (allocates MAX(change_seq)+1) - never bypass
- Share extensions write JSON to inbox dir, never touch SQLite cross-process
- Widgets read DB readonly (Mac: GRDB config.readonly; iOS: WAL checkpoint + atomic copy to app group)
- Sync: push then pull, LWW by updated_at, tombstones via deleted_at
- Server enriches metadata async after ingest; bumps change_seq with anti-clobber guards
- Auth: AUTH_MODE=token (self-host) | magic-link (hosted, JWT via jose)

## Specs & Plans

- Design spec: `docs/superpowers/specs/2026-07-10-stashbro-design.md`
- Phase plans: `docs/superpowers/plans/2026-07-10-stashbro-phase{1-5}-*.md`
- Build ledger: `.superpowers/sdd/progress.md`
- Mockups: `docs/design/mockups.html`

## Open Items

See memory `stashbro-carry` for deferred items. Key blockers for hosted mode: userId migration, per-user query filters, appleTeamId.
