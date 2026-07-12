// apps/mac/StashBro/AppDelegate.swift
import AppKit
import SwiftUI

// ponytail: top-level so tests can call directly without instantiating AppDelegate
@discardableResult
func processShareInbox(at inbox: URL, into store: LocalStoreProtocol) -> Int {
    guard let files = try? FileManager.default.contentsOfDirectory(
        at: inbox, includingPropertiesForKeys: nil
    ).filter({ $0.pathExtension == "json" }) else { return 0 }

    let iso = ISO8601DateFormatter()
    var count = 0
    for file in files {
        guard let data = try? Data(contentsOf: file),
              let payload = try? JSONDecoder().decode([String: String].self, from: data),
              let id = payload["id"], let url = payload["url"],
              let typeStr = payload["type"], let type_ = ItemType(rawValue: typeStr),
              let priorityStr = payload["priority"], let priority = ItemPriority(rawValue: priorityStr),
              let createdStr = payload["createdAt"], let created = iso.date(from: createdStr)
        else {
            // Malformed - delete so it doesn't block future ingests
            try? FileManager.default.removeItem(at: file)
            continue
        }

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
        do {
            try store.bumpOrCreate(stashItem)
            try? FileManager.default.removeItem(at: file)  // only delete on success
            count += 1
        } catch {
            // DB error - leave file in inbox for retry on next foreground activation
        }
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
    private var debugWindow: NSWindow?   // ponytail: strong ref keeps --debug-window alive past launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        let s = GRDBLocalStore(db: db)
        self.store = s

        if let config = ServerConfig.load() {
            let client = StashBroAPIClient(config: config)
            self.syncEngine = SyncEngine(store: s, client: client)
        }

        // C1: closures so reconnect() swapping syncEngine is always picked up
        menubarController = MenubarController(db: db, syncEngine: { [weak self] in self?.syncEngine })
        startSyncTimer()

        // C2: menubar always active; notch only when showInNotch==true AND hardware has notch
        applyNotchSurface()
        NotificationCenter.default.addObserver(
            self, selector: #selector(defaultsChanged),
            name: UserDefaults.didChangeNotification, object: nil
        )

        HotkeyManager.register { [weak self] url in
            self?.saveURL(url)
        }

        // ponytail: debug-only; gated behind launch arg so it never appears in normal runs
        if ProcessInfo.processInfo.arguments.contains("--debug-window") {
            let w = NSWindow(  // stored in debugWindow below to prevent dealloc
                contentRect: NSRect(x: 0, y: 0, width: 360, height: 600),
                styleMask: [.titled, .closable], backing: .buffered, defer: false
            )
            w.title = "StashBro Debug"
            w.contentView = NSHostingView(rootView: StashListView(
                db: db,
                syncEngine: { [weak self] in self?.syncEngine },
                style: .popover
            ))
            w.center()
            NSApp.activate(ignoringOtherApps: true)
            w.makeKeyAndOrderFront(nil)
            debugWindow = w
        }
    }

    // C2: key-filtered - bail early when showInNotch didn't actually change
    @objc private func defaultsChanged() {
        let want = UserDefaults.standard.bool(forKey: "showInNotch")
        guard want != (notchController != nil) else { return }
        applyNotchSurface()
    }

    private func applyNotchSurface() {
        if UserDefaults.standard.bool(forKey: "showInNotch") {
            if notchController == nil {
                notchController = NotchWindowController(db: db, syncEngine: { [weak self] in self?.syncEngine })
            }
        } else {
            notchController = nil
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
        processShareInbox(at: inbox, into: store)
        // ponytail: no extra sync here; applicationDidBecomeActive fires one right after
    }

    private func startSyncTimer() {
        // ponytail: reads self.syncEngine each fire so reconnect() swap is picked up automatically
        syncTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.syncEngine?.sync() }
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
        try? store.bumpOrCreate(item)
        Task { @MainActor in await syncEngine?.sync() }
    }
}
