# Server

Hono + Drizzle + better-sqlite3. SQLite WAL. Single Docker image.

## Run

```bash
AUTH_MODE=token AUTH_TOKEN=secret pnpm --filter @stashbro/server dev    # tsx watch
pnpm --filter @stashbro/server test                                     # 92+ tests
```

## Env Vars

| Var | When | Notes |
|-----|------|-------|
| `AUTH_MODE` | always | `token` or `magic-link` |
| `AUTH_TOKEN` | token mode | static bearer |
| `JWT_SECRET` | magic-link | min 32 chars |
| `RESEND_API_KEY` | magic-link | email delivery |
| `DB_PATH` | optional | default `/data/stashbro.db`, `:memory:` for tests |
| `PORT` | optional | default `3000` |

## Routes

All data routes need `Authorization: Bearer <token>`.

| Route | Method | Notes |
|-------|--------|-------|
| `/health` | GET | `{ ok, mode }` |
| `/items` | GET | query: `status`, `type`, `tag`, `cursor`, `limit` |
| `/items` | POST | `{ url, title?, priority?, tag_names? }` |
| `/items/:id` | PATCH | partial update |
| `/tags` | GET | returns **plain array** (not `{ tags }`) |
| `/tags` | POST | `{ name }` - idempotent, trims whitespace |
| `/sync/pull` | GET | `?cursor=N` - ASC by change_seq |
| `/sync/push` | POST | `{ changes }` - per-change try/catch, LWW |
| `/auth/request` | POST | `{ email }` - 6-digit code, rate limited 5/15min |
| `/auth/verify` | POST | `{ email, code, deviceId }` - rate limited 10/15min, max 5 attempts/code |
| `/auth/refresh` | POST | `{ refreshToken }` |

## Gotchas

- **Tags response shape**: `GET /tags` returns `Tag[]`, not `{ tags: Tag[] }`. Tests that destructure `body.tags` fail silently.
- **DB singleton**: `getDb()` caches. Tests must call `clearDbCache()` in `beforeEach` or they share state.
- **Enrichment sync**: metadata enrichment must bump `change_seq` via the same `MAX+1` allocation path - raw UPDATE on title/thumbnail without seq bump means clients never pull the enriched data.
- **Rate limit state**: in-process Map, resets on restart. No Redis.
- **SSRF**: `fetchSafe` in metadata service follows redirects manually with per-hop IP check. Direct `fetch` bypasses this.

## Docker

```bash
docker build -f apps/server/Dockerfile -t stashbro .   # context = monorepo root
```

Fly.io config: `apps/server/fly.toml`, volume at `/data`.
