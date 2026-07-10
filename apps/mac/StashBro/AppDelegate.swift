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

    func applicationDidFinishLaunching(_ notification: Notification) {
        let store = GRDBLocalStore(db: db)

        if let config = ServerConfig.load() {
            let client = StashBroAPIClient(config: config)
            let engine = SyncEngine(store: store, client: client)
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
        Task { await syncEngine?.sync() }
    }

    private func startSyncTimer(engine: SyncEngine) {
        syncTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { _ in
            Task { await engine.sync() }
        }
    }

    func saveURL(_ url: URL) {
        // Local-first save via GRDBLocalStore, then trigger sync
        let store = GRDBLocalStore(db: db)
        let now = Date()
        let change = SyncChange(
            id: UUID().uuidString, changeSeq: 0, createdAt: now, updatedAt: now, deletedAt: nil,
            url: url.absoluteString, title: url.absoluteString,
            description: nil, thumbnailUrl: nil, faviconUrl: nil,
            domain: url.host ?? url.absoluteString,
            type: detectType(url: url.absoluteString), status: .unread,
            priority: .medium, tagNames: []
        )
        try? store.applyChanges([change])
        Task { await syncEngine?.sync() }
    }

    // ponytail: detectType duplicated from shared package; Swift can't consume TS packages
    func detectType(url: String) -> ItemType {
        let domainMap: [String: ItemType] = [
            "youtube.com": .video, "youtu.be": .video, "vimeo.com": .video,
            "x.com": .post, "twitter.com": .post, "reddit.com": .post, "threads.net": .post,
        ]
        guard let host = URL(string: url)?.host?.replacingOccurrences(of: "www.", with: "") else { return .article }
        return domainMap.first(where: { host == $0.key || host.hasSuffix(".\($0.key)") })?.value ?? .article
    }
}
