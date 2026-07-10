# StashBro - Design Spec

Date: 2026-07-10
Status: Approved by Eylon (design conversation, 2026-07-10)

## What

Open-source universal reading list. Save links from anywhere (X, Reddit, YouTube, any site) on Mac and iPhone; browse them from the Mac notch, a menubar popover, widgets, and a phone app. Self-hostable server or hosted instance.

## Goals

- Capture a link in under 2 seconds from any app on Mac or iPhone.
- Instant access: notch on Mac, one-screen app + widget on iPhone.
- Organize by type (video / post / article / other) and free-form tags.
- Open source, single-container self-host, optional hosted mode.

## Non-goals (v1)

- Full reader mode / article content capture (links only; open original).
- Android and web clients.
- AI auto-tagging (v2: user-provided AI tokens, server-side; current schema needs no changes for it).
- Multi-user sharing / collaboration.

## Architecture

Monorepo (pnpm + Turborepo):

```
stashbro/
├── apps/
│   ├── server/      # Node/TS - Hono + Drizzle + SQLite, single Docker image
│   ├── mac/         # SwiftUI - notch window, menubar popover, WidgetKit widget, share ext
│   └── mobile/      # Expo (iOS first) - full app, share extension, widget (Swift target)
├── packages/
│   ├── shared/      # TS: domain types, API client, sync engine (mobile + extension)
│   └── extension/   # Browser extension (WXT, Manifest V3) - Chrome/Arc/Safari
└── docs/
```

- Mac app is Swift and cannot consume the TS package. The server exposes an OpenAPI spec; the Swift client is generated with `swift-openapi-generator`. The OpenAPI spec is the single source of truth for the API contract; TS types in `packages/shared` are checked against it.
- `packages/shared` holds the sync engine used by mobile and the extension. The Mac app implements the same sync protocol in Swift.

## Data model

```
users:      id, email                          -- hosted mode only
items:      id (uuidv7), user_id, url, title, description,
            thumbnail_url, favicon_url, domain,
            type   (video | post | article | other),
            status (unread | archived),
            priority (low | medium | high, default medium),
            created_at, updated_at, deleted_at (tombstone)
tags:       id, user_id, name (unique per user)
item_tags:  item_id, tag_id
```

- Type is auto-detected from a domain map (youtube/vimeo → video; x/twitter/reddit/threads → post; else article) and user-editable.
- Tags are free-form with autocomplete in clients.
- Priority defaults to medium on save; settable at capture time (optional) and editable in list UIs. Priority filter defaults to "all".

## Sync protocol (local-first)

- Every client keeps a local SQLite store (Mac: GRDB; mobile: expo-sqlite). All writes are local-first: saves work offline, notch opens instantly.
- Server keeps a per-user monotonic `change_seq`. Sync cycle: client `push` (batched local changes) then `pull?since=<cursor>`.
- Conflict resolution: last-write-wins by `updated_at`. Deletes are tombstones (`deleted_at`), purged server-side after 90 days.
- Sync triggers: app foreground, debounced after local write, periodic background refresh.
- Share extensions (iOS and macOS) write to a shared app-group SQLite store; the main app syncs it.

## Metadata enrichment

Save is instant with only the URL (title falls back to the URL). The server enriches asynchronously on ingest: og:title / og:description / og:image / favicon, plus oEmbed for YouTube and X. Clients receive the enriched item on the next pull. No client-side scraping (avoids CORS and app-review issues).

## Capture surfaces

Mac (all four in v1):
1. Global hotkey ⌘⇧S - grabs frontmost browser tab URL via AppleScript (Safari/Chrome/Arc), clipboard-URL fallback.
2. Drag a link onto the notch - notch area accepts URL drags.
  3. macOS share menu extension.
4. Browser extension - toolbar button + right-click context menu.

iOS:
- Share sheet extension: saves immediately, optional quick tag picker.
- Widget: unread count + recent items.

## Mac UI

One SwiftUI list view (filter by type/tag/status, search, archive, edit tags) rendered in two shells:
- Notch window: BoringNotch-style always-on-top window hugging the notch, expands on hover/click. Notch detected via `NSScreen.safeAreaInsets`; on non-notch Macs this surface is disabled.
- Menubar popover (`NSStatusItem`): always available; user preference decides primary surface.
- WidgetKit widget: unread count + recent items.

## Auth

Server env `AUTH_MODE`:
- `token` (self-host default): single user, static bearer token from env. No email infra.
- `magic-link` (hosted): email code via Resend → long-lived refresh token per device, short-lived access tokens.

## Hosting and distribution

- Server: one Docker image, SQLite on a volume. Hosted instance on Fly.io (volume-backed). Self-host = `docker run -v data:/data stashbro`.
- Mac app: notarized DMG via GitHub Releases + Homebrew cask. Not App Store (hotkey/AppleScript capture would not survive sandboxing).
- iOS: TestFlight first, App Store later. Requires Apple Developer account.
- License: MIT (permissive, standard for this pattern).

## Error handling

- Offline write queue with retry + exponential backoff.
- Sync failures are silent; surface a subtle indicator only after repeated failures.
- Metadata fetch failures leave the item with URL-as-title; retried up to 3 times.

## Testing

- Server: Vitest - API endpoints + sync protocol (push/pull/conflict/tombstone) tests.
- `packages/shared` sync engine: unit tests.
- Mac sync layer: XCTest.
- E2E smoke: script against a local server - save on client A → sync → appears on client B.

## Build order

1. `packages/shared` + `apps/server` - foundation, independently testable.
2. Mac app - notch, menubar, hotkey, share ext (primary surface).
3. Mobile - Expo app + share extension.
4. Browser extension + widgets (Mac + iOS).
5. Hosted deploy (Fly.io) + magic-link auth.

## Implementation process

Orchestrator (Fable) delegates each phase to Opus builder subagents; each phase output is reviewed by Opus 4.8 reviewer subagents before merge.
