// apps/mac/StashBro/Sync/SyncStatusStore.swift
import Foundation

// Stable, app-wide sync status. SyncEngine + SyncRealtime write to it; SwiftUI views
// observe it. A shared singleton so status survives engine swaps on reconnect (the
// views hold the closure `() -> SyncEngine?`, not the engine itself).
@MainActor
final class SyncStatusStore: ObservableObject {
    static let shared = SyncStatusStore()

    enum State { case idle, syncing, synced, error, offline }

    @Published var state: State = .offline
    @Published var realtimeConnected = false
    @Published var lastSyncedAt: Date?

    private init() {}

    var label: String {
        switch state {
        case .idle: return "Connecting\u{2026}"
        case .syncing: return "Syncing\u{2026}"
        case .synced: return realtimeConnected ? "Live" : "Synced"
        case .error: return "Sync error"
        case .offline: return "No server"
        }
    }
}
