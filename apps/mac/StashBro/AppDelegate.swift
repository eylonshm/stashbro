// apps/mac/StashBro/AppDelegate.swift
import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    var menubarController: MenubarController?
    var notchController: NotchWindowController?
    var syncEngine: SyncEngine?
    var syncTimer: Timer?
    let db = AppDatabase.makeShared()
    private var store: GRDBLocalStore?   // reused in saveURL

    func applicationDidFinishLaunching(_ notification: Notification) {
        let s = GRDBLocalStore(db: db)
        self.store = s

        if let config = ServerConfig.load() {
            let client = StashBroAPIClient(config: config)
            let engine = SyncEngine(store: s, client: client)
            self.syncEngine = engine
            startSyncTimer(engine: engine)
        }

        menubarController = MenubarController(db: db, syncEngine: syncEngine)
        notchController = NotchWindowController(db: db, syncEngine: syncEngine)

        HotkeyManager.register { [weak self] url in
            self?.saveURL(url)
        }
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        Task { @MainActor in await syncEngine?.sync() }
    }

    private func startSyncTimer(engine: SyncEngine) {
        syncTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { _ in
            Task { @MainActor in await engine.sync() }
        }
    }

    func saveURL(_ url: URL) {
        guard let store else { return }
        let now = Date()
        let change = SyncChange(
            id: UUID().uuidString, changeSeq: 0, createdAt: now, updatedAt: now, deletedAt: nil,
            url: url.absoluteString, title: url.absoluteString,
            description: nil, thumbnailUrl: nil, faviconUrl: nil,
            domain: url.host ?? url.absoluteString,
            type: detectItemType(url: url.absoluteString), status: .unread,
            priority: .medium, tagNames: []
        )
        try? store.applyChanges([change])
        Task { @MainActor in await syncEngine?.sync() }
    }
}
