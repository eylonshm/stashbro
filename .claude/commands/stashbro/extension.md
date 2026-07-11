# Browser Extension

WXT Manifest V3 + React. Chrome, Arc, Safari.

## Build

```bash
cd packages/extension
pnpm build                     # production -> .output/chrome-mv3/
```

Load: `chrome://extensions` -> Developer mode -> Load unpacked -> `.output/chrome-mv3/`

## Port Conflict

`pnpm dev` starts a WXT HMR server on port 3000 - same as the API server default. The popup loads JS from this dev server; if the API server holds the port, the popup renders blank. Use `pnpm build` + manual load, or run the API server on a different port.

## Save Flow

1. Popup opens -> `browser.tabs.query({ active: true })` grabs URL + title
2. `detectType(url)` from `@stashbro/shared` classifies domain
3. User optionally adds tags (autocomplete from server) and sets priority
4. `saveWithRetry()` -> `StashBroClient.createItem()` or `OfflineRetryQueue` on failure
5. Confirmation shown, popup auto-closes in 2s

Context menu: right-click any link -> "Save to StashBro" -> `saveWithRetry` in background.

## Offline Queue

`OfflineRetryQueue` backed by `chrome.storage.local` key `offlineQueue`. Promise-chain mutex prevents concurrent flushes. Items retried on next `saveWithRetry` call. Queue does not auto-flush on reconnect (carry item).

## Gotchas

- **Safari extension**: built from same source via `xcrun safari-web-extension-converter`. Target lives in `apps/mac/StashBroSafariExtension/`, embedded in Mac app. Web resources copied via build script.
- **Options magic-link**: detects server mode from `/health` response. Token mode shows URL+bearer fields. Magic-link mode shows email->code->verify flow.

## Storage Keys (browser.storage.local)

`serverURL`, `serverToken`, `refreshToken`, `stashbroDeviceId`, `offlineQueue`
