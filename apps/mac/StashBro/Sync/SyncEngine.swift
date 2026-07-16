// apps/mac/StashBro/Sync/SyncEngine.swift
import Foundation

// Mirrors packages/shared/src/sync-engine.ts:
// push local changes, pull since cursor, set cursor; pendingSync re-runs on next cycle.
@MainActor
final class SyncEngine: ObservableObject {
    @Published var lastSyncError: Error?
    @Published var isSyncing = false

    private let store: LocalStoreProtocol
    private let client: SyncClientProtocol
    private var pendingSync = false
    var onSyncError: ((Error) -> Void)?

    init(store: LocalStoreProtocol, client: SyncClientProtocol, onSyncError: ((Error) -> Void)? = nil) {
        self.store = store
        self.client = client
        self.onSyncError = onSyncError
    }

    func sync() async {
        guard !isSyncing else {
            pendingSync = true   // ponytail: mirrors TS pendingSync flag
            return
        }
        isSyncing = true
        SyncStatusStore.shared.state = .syncing
        defer {
            isSyncing = false
            if pendingSync {
                pendingSync = false
                Task { await self.sync() }
            }
        }
        do {
            let cursor = store.getCursor()
            let localChanges = try store.getChangesSince(cursor)
            if !localChanges.isEmpty { _ = try await client.pushChanges(localChanges) }
            let (remoteChanges, newCursor) = try await client.pullChanges(cursor: cursor)
            if !remoteChanges.isEmpty { try store.applyChanges(remoteChanges) }
            store.setCursor(newCursor)
            lastSyncError = nil
            SyncStatusStore.shared.state = .synced
            SyncStatusStore.shared.lastSyncedAt = Date()
        } catch {
            lastSyncError = error
            SyncStatusStore.shared.state = .error
            onSyncError?(error)
        }
    }
}
