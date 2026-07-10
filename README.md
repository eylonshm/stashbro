# StashBro

Open-source universal reading list. Save links from Mac, iPhone, and any browser. Sync locally-first via your own server or the hosted instance.

## Self-host in 60 seconds

```bash
docker run -d \
  --name stashbro \
  -v stashbro_data:/data \
  -e AUTH_TOKEN=your-secret-token \
  -e AUTH_MODE=token \
  -p 3000:3000 \
  ghcr.io/stashbro/stashbro-server:latest
```

Then point your Mac app / mobile app / browser extension at `http://your-server:3000` with token `your-secret-token`.

## Clients

| Client | Download |
|--------|---------|
| Mac app (notch + menubar) | [GitHub Releases](https://github.com/stashbro/stashbro/releases) |
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
