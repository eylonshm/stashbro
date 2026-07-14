// apps/mac/StashBro/UI/MenubarController.swift
import AppKit
import SwiftUI

// Wraps StashListView with an "Open App" footer matching the notch panel style
private struct MenubarPopoverView: View {
    let db: AppDatabase
    let syncEngine: () -> SyncEngine?
    var body: some View {
        VStack(spacing: 0) {
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
        p.contentSize = NSSize(width: 328, height: 510)  // +30pt for footer
        p.behavior = .transient
        p.contentViewController = NSHostingController(
            rootView: MenubarPopoverView(db: db, syncEngine: syncEngine)
        )
        self.popover = p
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "books.vertical.fill", accessibilityDescription: "StashBro")
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
