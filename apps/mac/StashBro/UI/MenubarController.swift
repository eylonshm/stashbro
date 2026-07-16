// apps/mac/StashBro/UI/MenubarController.swift
import AppKit
import SwiftUI

// Wraps StashListView with an "Open App" footer matching the notch panel style
private struct MenubarPopoverView: View {
    let db: AppDatabase
    let syncEngine: () -> SyncEngine?
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button(action: {
                    NotificationCenter.default.post(name: .openManualAddURL, object: nil)
                }) {
                    Image(systemName: "plus")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
                }
                .buttonStyle(.plain)
                .help("Add a URL manually")
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)

            StashListView(db: db, syncEngine: syncEngine, style: .popover)
            Divider()
            Button("Open App \u{2192}") {
                NotificationCenter.default.post(name: MainWindowController.openMainWindow, object: nil)
            }
            .buttonStyle(.plain)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
            .help("Open StashBro main window")
            .padding(.vertical, 8)
        }
    }
}

@MainActor
final class MenubarController {
    private var statusItem: NSStatusItem
    private var popover: NSPopover
    private let db: AppDatabase
    private let syncEngine: () -> SyncEngine?  // ponytail: closure for live engine after reconnect

    init(db: AppDatabase, syncEngine: @escaping () -> SyncEngine?) {
        self.db = db
        self.syncEngine = syncEngine

        // Initialize all stored properties before using self (Swift DI requirement)
        let p = NSPopover()
        p.contentSize = NSSize(width: 360, height: 510)
        p.behavior = .transient
        p.contentViewController = NSHostingController(
            rootView: MenubarPopoverView(db: db, syncEngine: syncEngine)
        )
        self.popover = p
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        if let button = statusItem.button {
            let icon = NSImage(named: "MenubarIcon")
                ?? NSImage(systemSymbolName: "books.vertical.fill", accessibilityDescription: "StashBro")
            icon?.isTemplate = true  // auto-adapts to light/dark menu bar
            icon?.size = NSSize(width: 19, height: 19)  // menu bar usable height ~22pt
            button.image = icon
            button.action = #selector(togglePopover)
            button.target = self
        }
    }

    @objc func togglePopover() {
        guard let button = statusItem.button else { return }
        if popover.isShown {
            popover.performClose(nil)
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            Task { await syncEngine()?.sync() }
        }
    }
}
