import AppKit

// ponytail: no-op client used when ServerConfig not yet set; token hardening is a later task
private struct NoOpSyncClient: SyncClientProtocol {
    func pushChanges(_ changes: [SyncChange]) async throws -> Int { 0 }
    func pullChanges(cursor: Int) async throws -> (changes: [SyncChange], cursor: Int) { ([], cursor) }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var engine: SyncEngine?  // always written/read from main thread
    private var syncTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let client: SyncClientProtocol = ServerConfig.load().map(StashBroAPIClient.init) ?? NoOpSyncClient()

        engine = MainActor.assumeIsolated {
            SyncEngine(store: GRDBLocalStore(db: .shared), client: client)
        }

        NotificationCenter.default.addObserver(
            forName: NSApplication.didBecomeActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let engine = self?.engine else { return }
            Task { @MainActor in await engine.sync() }
        }

        // 15-min periodic sync
        syncTimer = Timer.scheduledTimer(withTimeInterval: 15 * 60, repeats: true) { [weak self] _ in
            guard let engine = self?.engine else { return }
            Task { @MainActor in await engine.sync() }
        }
    }
}
