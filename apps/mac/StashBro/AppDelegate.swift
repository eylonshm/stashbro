import AppKit

// ponytail: stub client until Task 4 wires real swift-openapi client
private struct StubSyncClient: SyncClientProtocol {
    func pushChanges(_ changes: [SyncChange]) async throws -> Int { 0 }
    func pullChanges(cursor: Int) async throws -> (changes: [SyncChange], cursor: Int) { ([], 0) }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var engine: SyncEngine?  // always written/read from main thread
    private var syncTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        engine = MainActor.assumeIsolated {
            SyncEngine(store: GRDBLocalStore(db: .shared), client: StubSyncClient())
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
