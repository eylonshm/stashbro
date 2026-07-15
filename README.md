# StashBro

Open-source universal reading list. Save links from Mac, iPhone, and any browser. Sync locally-first via your own server or the hosted instance.

One container, SQLite, zero external dependencies.

## Self-Host

### Option 1: Docker Compose (recommended)

```bash
# Download the config
curl -O https://raw.githubusercontent.com/eylonshm/stashbro/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/eylonshm/stashbro/main/.env.example

# Configure
cp .env.example .env
# Edit .env - set AUTH_TOKEN to a random string (openssl rand -hex 32)

# Run
docker compose up -d
```

Server is now at `http://your-server:3000`.

### Option 2: Docker run (single command)

```bash
docker run -d \
  --name stashbro \
  -v stashbro_data:/data \
  -e AUTH_TOKEN=$(openssl rand -hex 32) \
  -e AUTH_MODE=token \
  -p 3000:3000 \
  ghcr.io/eylonshm/stashbro-server:latest
```

### Option 3: One-click cloud deploy

| Platform | Deploy | HTTPS |
|----------|--------|-------|
| Railway | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/eylonshm/stashbro) | Automatic |
| Render | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy) | Automatic |
| Fly.io | `cd apps/server && fly launch` | Automatic |

Cloud platforms handle HTTPS automatically - no extra config needed.

### Connect your clients

Once the server is running, open Settings in any client and enter:

| Client | Where to configure |
|--------|--------------------|
| Mac app | Settings > Server URL + Token |
| iOS app | Settings > Server URL + Token |
| Browser extension | Extension options > Server URL + Token |

### HTTPS (self-hosted)

Cloud deploys (Railway, Render, Fly.io) get HTTPS automatically. For Docker self-hosting on a VPS, put [Caddy](https://caddyserver.com) in front - it handles Let's Encrypt automatically:

```
stashbro.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Run with `caddy run --config Caddyfile`. That's it - Caddy provisions and renews TLS certs automatically.

For LAN-only use (e.g. your phone on the same Wi-Fi), plain HTTP is fine.

## Clients

| Client | Download |
|--------|---------|
| Mac app (notch + menubar) | [GitHub Releases](https://github.com/eylonshm/stashbro/releases) |
| iOS app | TestFlight (coming soon) |
| Browser extension | Chrome Web Store (coming soon) |

## Features

- Save from anywhere: hotkey, drag to notch, share sheet, browser extension
- Notch-first Mac UI with menubar popover
- Auto-categorize: video / post / article
- Tags, priority, search
- Local-first sync - works offline
- Self-host or use hosted instance

## Architecture

Monorepo (pnpm + Turborepo):
- `apps/server` - Hono + SQLite API server (single Docker image)
- `apps/mac` - SwiftUI Mac app (notch, menubar, share extension, widget)
- `apps/mobile` - Expo iOS app (share extension, widget)
- `packages/shared` - TypeScript types, API client, sync engine
- `packages/extension` - Browser extension (WXT, Manifest V3)

## Development

```bash
pnpm install
pnpm test          # run all tests
pnpm dev           # start server in dev mode
```

## License

MIT
