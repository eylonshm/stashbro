# StashBro Browser Extension Reference

WXT (Manifest V3) + React. Chrome, Arc, Safari (via xcrun converter in Mac app).

## Build & Run

```bash
cd packages/extension
pnpm build                     # production build -> .output/chrome-mv3/
# pnpm dev                     # HMR dev mode (port 3000 conflicts with server!)
```

Load in Chrome/Arc: `chrome://extensions` -> Developer mode -> Load unpacked -> `.output/chrome-mv3/`

**Port conflict:** WXT dev server defaults to port 3000, same as API server. Use `pnpm build` for manual loading, or run API server on different port when using `pnpm dev`.

## How It Works

1. **Click extension icon** on any page -> popup shows save form pre-filled with tab URL + title
2. **Type auto-detected** from domain (youtube -> video, x.com -> post, etc.)
3. **Add tags** (autocomplete from server) + set priority (low/med/high)
4. **Save** -> sends to server, or queues offline if unreachable
5. **Right-click any link** -> "Save to StashBro" context menu -> saves in background

## File Structure

```
packages/extension/
  wxt.config.ts               # WXT config, manifest definition, icon paths
  public/icon/                # Extension icons (16/32/48/128 PNG)
  entrypoints/
    background.ts             # saveWithRetry, OfflineRetryQueue, context menu registration
    popup/
      index.html              # Popup shell
      main.tsx                # React mount
      PopupApp.tsx            # Save form UI (title, tags, priority, type badge)
    options/
      index.html              # Options shell
      main.tsx                # Server config + magic-link login flow
  src/
    OfflineRetryQueue.ts      # chrome.storage.local backed queue, promise-chain mutex
    validateOptions.ts        # URL + token validation (extracted for reuse)
```

## Key Patterns

- **Popup:** Grabs active tab via `browser.tabs.query`. Calls `saveWithRetry()` (imported from background). Shows "Saved!" confirmation, auto-closes in 2s.
- **Background:** `saveWithRetry` creates item via `StashBroClient`, detects type, falls back to `OfflineRetryQueue` on network error.
- **OfflineRetryQueue:** Backed by `chrome.storage.local`. Serializes mutations with promise-chain mutex to prevent concurrent flushes. Items retried on next save attempt.
- **Context menu:** Registered in background, saves link URL directly without popup.
- **Theme:** One-time `matchMedia('prefers-color-scheme: dark')` read at module load. Copper accent `#C87A38`.
- **Options:** Detects server mode from `/health` response. Token mode: URL + bearer token. Magic-link mode: email -> code -> verify flow. Stores in `browser.storage.local`.

## Storage Keys (browser.storage.local)

| Key | What |
|-----|------|
| `serverURL` | Server base URL |
| `serverToken` | Bearer/access token |
| `refreshToken` | Refresh token (hosted mode) |
| `stashbroDeviceId` | Device ID for token rotation |
| `offlineQueue` | Pending offline saves (OfflineRetryQueue) |

## Safari Extension

Built from same source via `xcrun safari-web-extension-converter`. Target lives in `apps/mac/StashBroSafariExtension/` and is embedded in the Mac app. Web resources copied via build script.
