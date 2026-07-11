# Mac App

SwiftUI. Four targets: app, share extension, Safari extension, WidgetKit widget.

## Build

```bash
cd apps/mac
xcodegen generate              # .xcodeproj from project.yml (gitignored, always regenerate)
open StashBro.xcodeproj        # Cmd+R
```

First build resolves SPM: GRDB 6.29.3, KeyboardShortcuts, swift-openapi-generator.
Headless: `-skipPackagePluginValidation` for plugin trust.

## Notch Panel

NSPanel with `.nonactivatingPanel` style. Positioned via `NSScreen.safeAreaInsets.top > 0` - disabled on non-notch Macs. Expands on hover/click. `NotchWindowController` manages the animation between pill (collapsed) and panel (expanded). `NotchDropDelegate` accepts URL drags.

## Menubar

NSStatusItem + NSPopover hosting SwiftUI `StashListView`. Always available regardless of notch.

## Hotkey Capture

Cmd+Shift+S -> `BrowserTabGrabber` (osascript for Safari/Chrome/Arc) -> clipboard URL fallback. `HotkeyManager` uses KeyboardShortcuts library.

## Sync Reconnect

`SettingsView.reconnect()` creates a new `SyncEngine` and assigns it to `AppDelegate.syncEngine`. All controllers access the engine via closure `() -> SyncEngine?` so they pick up the new instance without restart.

## Share Extension (inbox pattern)

`StashBroShareExtension` writes one JSON file per shared item to the app-group inbox. Main app ingests via `AppDelegate` on foreground. Extension never touches GRDB.

## Widget (readonly)

`StashBroWidget` calls `AppDatabase.makeSharedReader()` which sets `config.readonly = true`. It reads but never writes or migrates.

## Gotchas

- **GRDB observation**: `StashListView` uses `ValueObservation` for reactive updates. Raw SQL queries outside observation won't trigger UI refresh.
- **ISO8601 dates**: `StashItem+DB` uses `ISO8601DateFormatter` - the one without fractional seconds. Server sends fractional. Both parse correctly because the formatter handles both, but constructing dates manually must match.
- **Magic-link tokens**: access token in `@AppStorage("serverToken")`, refresh token in Keychain (`keychainSet`/`keychainGet` in SettingsView). UserDefaults is not secure for refresh tokens.
