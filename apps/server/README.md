# StashBro Server

Single-container API server: Hono + Drizzle + SQLite.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_MODE` | Yes | `token` (self-host) or `magic-link` (hosted) |
| `AUTH_TOKEN` | If token mode | Static bearer token for all requests |
| `JWT_SECRET` | If magic-link | Min 32 chars; signs JWT access tokens |
| `RESEND_API_KEY` | If magic-link | Resend API key for email delivery |
| `DB_PATH` | No | SQLite file path (default: `/data/stashbro.db`) |
| `PORT` | No | HTTP port (default: `3000`) |

## Docker run (self-host)

```bash
docker run -d \
  -v stashbro_data:/data \
  -e AUTH_MODE=token \
  -e AUTH_TOKEN=your-32-char-secret \
  -p 3000:3000 \
  ghcr.io/eylonshm/stashbro-server:latest
```

## Fly.io deploy

```bash
cd apps/server
fly launch --no-deploy --name stashbro --region iad
fly volumes create stashbro_data --size 1 --region iad
fly secrets set AUTH_TOKEN="$(openssl rand -hex 32)" JWT_SECRET="$(openssl rand -hex 32)" RESEND_API_KEY="re_your_key"
fly deploy
```

## API

OpenAPI spec available at `GET /openapi.json` when the server is running.

## Backup

SQLite WAL at `/data/stashbro.db`. Snapshot via `fly ssh console -C "cp /data/stashbro.db /tmp/backup.db"` then `fly sftp get /tmp/backup.db`.
