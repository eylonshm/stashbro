// apps/mac/StashBro/UI/MenubarController.swift
import AppKit
import SwiftUI

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
        p.contentSize = NSSize(width: 288, height: 480)
        p.behavior = .transient
        p.contentViewController = NSHostingController(
            rootView: StashListView(db: db, syncEngine: syncEngine, style: .popover)
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
        if popover.isShown { popover.performClose(nil) }
        else { popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY) }
    }
}
