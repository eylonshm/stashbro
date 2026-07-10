// apps/mac/StashBro/AppDelegate.swift
import AppKit
import SwiftUI

// ponytail: top-level so tests can call directly without instantiating AppDelegate
@discardableResult
func processShareInbox(at inbox: URL, into store: GRDBLocalStore) -> Int {
    guard let files = try? FileManager.default.contentsOfDirectory(
        at: inbox, includingPropertiesForKeys: nil
    ).filter({ $0.pathExtension == "json" }) else { return 0 }

    let iso = ISO8601DateFormatter()
    var count = 0
    for file in files {
        defer { try? FileManager.default.removeItem(at: file) }
        guard let data = try? Data(contentsOf: file),
              let payload = try? JSONDecoder().decode([String: String].self, from: data),
              let id = payload["id"], let url = payload["url"],
              let typeStr = payload["type"], let type_ = ItemType(rawValue: typeStr),
              let priorityStr = payload["priority"], let priority = ItemPriority(rawValue: priorityStr),
              let createdStr = payload["createdAt"], let created = iso.date(from: createdStr)
        else { continue }

        let now = Date()
        let stashItem = StashItem(
            id: id, userId: "default",
            url: url, title: payload["title"] ?? url, description: nil,
            thumbnailUrl: nil, faviconUrl: nil,
            domain: payload["domain"] ?? url,
            type: type_, status: .unread, priority: priority,
            createdAt: created, updatedAt: now, deletedAt: nil,
            changeSeq: 0  // ponytail: saveLocalItem overwrites with MAX(change_seq)+1
        )
        try? store.saveLocalItem(stashItem)
        count += 1
    }
    return count
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    var menubarController: MenubarController?
    var notchController: NotchWindowController?
    var syncEngine: SyncEngine?
    var syncTimer: Timer?
    let db = AppDatabase.makeShared()
    private var store: GRDBLocalStore?   // reused in saveURL and ingestShareExtensionInbox

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
        ingestShareExtensionInbox()
        Task { @MainActor in await syncEngine?.sync() }
    }

    func ingestShareExtensionInbox() {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.stashbro.app"
        ), let store else { return }
        let inbox = container.appendingPathComponent("inbox", isDirectory: true)
        let count = processShareInbox(at: inbox, into: store)
        if count > 0 {
            Task { @MainActor in await syncEngine?.sync() }
        }
    }

    private func startSyncTimer(engine: SyncEngine) {
        syncTimer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { _ in
            Task { @MainActor in await engine.sync() }
        }
    }

    func saveURL(_ url: URL) {
        guard let store else { return }
        let now = Date()
        let item = StashItem(
            id: UUID().uuidString, userId: "default",
            url: url.absoluteString, title: url.absoluteString,
            description: nil, thumbnailUrl: nil, faviconUrl: nil,
            domain: url.host ?? url.absoluteString,
            type: detectItemType(url: url.absoluteString), status: .unread,
            priority: .medium, createdAt: now, updatedAt: now, deletedAt: nil,
            changeSeq: 0  // ponytail: saveLocalItem overwrites with MAX(change_seq)+1
        )
        try? store.saveLocalItem(item)
        Task { @MainActor in await syncEngine?.sync() }
    }
}
