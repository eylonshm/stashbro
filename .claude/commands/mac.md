# StashBro Mac App Reference

SwiftUI app with notch window, menubar popover, share extension, Safari extension, WidgetKit widget.

## Build & Run

```bash
cd apps/mac
xcodegen generate              # creates StashBro.xcodeproj from project.yml
open StashBro.xcodeproj        # Cmd+R to build & run
```

First build resolves SPM packages: GRDB 6.29.3, KeyboardShortcuts, swift-openapi-generator.

Headless build (CI): add `-skipPackagePluginValidation` for OpenAPIGenerator plugin trust.

**xcodeproj is gitignored** - always regenerate with `xcodegen generate`.

## Targets (4, all in project.yml)

| Target | Type | What |
|--------|------|------|
| StashBro | app | Main app |
| StashBroShareExtension | appex | macOS share sheet (JSON inbox writer) |
| StashBroSafariExtension | appex | Safari web extension (xcrun-generated) |
| StashBroWidget | appex | WidgetKit (small: count, medium: count + 3 items) |

All 3 extensions embedded in main app target.

## File Structure

```
apps/mac/StashBro/
  App/
    AppDelegate.swift       # NSApp delegate, db init, sync engine, status item
    StashBroApp.swift       # SwiftUI App entry
  DB/
    AppDatabase.swift       # makeShared(), makeSharedReader(), makeInMemory()
    StashItem+DB.swift      # GRDB Record, ISO8601 date formatting
    Tag+DB.swift            # GRDB Record
    StashItem+Tags.swift    # item-tag join queries
  Sync/
    SyncEngine.swift        # Push/pull cycle, SyncChange CodingKeys
    GRDBLocalStore.swift    # LocalStore protocol impl, saveLocalItem (MAX+1 seq)
    StashBroAPIClient.swift # Wraps generated OpenAPI client + AuthMiddleware
  UI/
    StashListView.swift     # Main list with GRDB ValueObservation, filters
    ItemRowView.swift       # Single item row
    FilterChipRow.swift     # Type/tag/status filter chips
    MenubarController.swift # NSStatusItem popover
    SettingsView.swift      # Server config + magic-link login + notch toggle
  Notch/
    NotchWindowController.swift  # NSPanel + animation, notch detection
    NotchPillView.swift          # Collapsed pill
    NotchPanelView.swift         # Expanded panel
    NotchDropDelegate.swift      # URL drag-and-drop
  HotkeyManager.swift      # KeyboardShortcuts (Cmd+Shift+S)
  BrowserTabGrabber.swift   # AppleScript for Safari/Chrome/Arc tab URL
  ItemTypeDetector.swift    # Domain map -> video/post/article/other
```

## Key Patterns

- **Notch:** NSPanel with `.nonactivatingPanel` style, positioned via `NSScreen.safeAreaInsets`. Disabled on non-notch Macs.
- **Menubar:** NSStatusItem with NSPopover containing SwiftUI StashListView.
- **Hotkey:** Cmd+Shift+S grabs frontmost browser tab via AppleScript, falls back to clipboard URL.
- **DB:** GRDB with WAL mode. `makeShared()` for read-write, `makeSharedReader()` (config.readonly=true) for widget.
- **Sync:** Closure pattern `() -> SyncEngine?` so reconnect from settings propagates to all controllers.
- **Share extension:** Writes JSON files to app-group inbox dir. Main app ingests on foreground.
- **Magic-link login:** SettingsView has sendCode/verifyCode via URLSession. Access token in UserDefaults, refresh token in Keychain.

## Settings Storage

| Key | Store | What |
|-----|-------|------|
| `serverURL` | UserDefaults (@AppStorage) | Server base URL |
| `serverToken` | UserDefaults (@AppStorage) | Bearer/access token |
| `showInNotch` | UserDefaults (@AppStorage) | Notch surface toggle |
| `stashbro.refreshToken` | Keychain | Refresh token (hosted mode) |
| `stashbro:deviceId` | UserDefaults | Device ID for token rotation |
