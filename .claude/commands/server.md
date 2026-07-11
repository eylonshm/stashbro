# StashBro Server Reference

Hono + Drizzle ORM + better-sqlite3, SQLite WAL mode. Single Docker image.

## Run

```bash
# Dev (tsx watch, auto-reload)
AUTH_MODE=token AUTH_TOKEN=secret pnpm --filter @stashbro/server dev

# Production (build first)
pnpm --filter @stashbro/server build
AUTH_MODE=token AUTH_TOKEN=secret pnpm --filter @stashbro/server start

# Tests
pnpm --filter @stashbro/server test
```

## Env Vars

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `AUTH_MODE` | yes | - | `token` (self-host) or `magic-link` (hosted) |
| `AUTH_TOKEN` | if token mode | - | Static bearer token |
| `JWT_SECRET` | if magic-link | - | Min 32 chars, signs JWTs |
| `RESEND_API_KEY` | if magic-link | - | For email delivery |
| `DB_PATH` | no | `/data/stashbro.db` | SQLite file path, `:memory:` for tests |
| `PORT` | no | `3000` | HTTP port |

## API Routes

All data routes require `Authorization: Bearer <token>` header.

| Route | Method | What |
|-------|--------|------|
| `/health` | GET | Health check, returns `{ ok, mode }` |
| `/items` | GET | List items (query: `status`, `type`, `tag`, `cursor`, `limit`) |
| `/items` | POST | Create item `{ url, title?, priority?, tag_names? }` |
| `/items/:id` | PATCH | Update item fields |
| `/tags` | GET | List tags (returns array) |
| `/tags` | POST | Create tag `{ name }` (idempotent) |
| `/sync/pull?cursor=N` | GET | Pull changes since cursor |
| `/sync/push` | POST | Push local changes `{ changes: SyncChange[] }` |
| `/auth/request` | POST | Send magic-link code `{ email }` |
| `/auth/verify` | POST | Verify code `{ email, code, deviceId }` -> tokens |
| `/auth/refresh` | POST | Refresh access token `{ refreshToken }` |
| `/openapi.json` | GET | OpenAPI spec |

## File Structure

```
apps/server/src/
  app.ts              # createApp(), health, route registration
  index.ts            # serve() entry point
  db/
    index.ts          # getDb() singleton, DDL, clearDbCache()
    schema.ts         # Drizzle table definitions
  middleware/
    auth.ts           # authMiddleware (token or JWT validation)
  routes/
    items.ts          # CRUD + cursor pagination
    tags.ts           # CRUD, trim + idempotent
    sync.ts           # push (per-change try/catch, LWW) + pull (ASC ordering)
    auth.ts           # magic-link endpoints, rate limiting, brute-force protection
  services/
    metadata.ts       # OG/oEmbed enrichment with SSRF guard, 3 retries
    auth.ts           # JWT signing/verification, code hashing, token generation
```

## Key Patterns

- `getDb()` is a singleton; tests call `clearDbCache()` in beforeEach for isolation
- Sync push applies LWW per-change with try/catch (PK collision doesn't kill batch)
- Pull uses ASC ordering with fallback cursor for tag-filter dead-page prevention
- Metadata enrichment bumps change_seq so clients pull enriched data
- Rate limiting: in-process Map per IP (request: 5/15min, verify: 10/15min)
- Auth codes: SHA-256 hashed, 10min expiry, max 5 attempts per code, expired codes swept on new request

## Docker

```bash
docker build -f apps/server/Dockerfile -t stashbro-server .
docker run -d -v stashbro_data:/data -e AUTH_MODE=token -e AUTH_TOKEN=secret -p 3000:3000 stashbro-server
```

Fly.io config: `apps/server/fly.toml`
