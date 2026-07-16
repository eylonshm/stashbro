// apps/mac/StashBro/Sync/SyncRealtime.swift
import Foundation

// Server-Sent-Events client for /sync/events. Calls `onChange` whenever the server
// signals this user's data changed, so remote saves (e.g. from iPhone) pull almost
// instantly instead of waiting for the 30s poll. Auto-reconnects with backoff.
@MainActor
final class SyncRealtime {
    private var task: Task<Void, Never>?
    private let onChange: () -> Void

    init(onChange: @escaping () -> Void) {
        self.onChange = onChange
    }

    func start(config: ServerConfig) {
        stop()
        task = Task { [weak self] in await self?.runLoop(config: config) }
    }

    func stop() {
        task?.cancel()
        task = nil
        SyncStatusStore.shared.realtimeConnected = false
    }

    private func runLoop(config: ServerConfig) async {
        var backoffSeconds: UInt64 = 1
        while !Task.isCancelled {
            do {
                try await connectOnce(config: config)
                backoffSeconds = 1  // clean end after a live connection → reconnect fast
            } catch {
                backoffSeconds = min(backoffSeconds * 2, 30)
            }
            SyncStatusStore.shared.realtimeConnected = false
            if Task.isCancelled { break }
            try? await Task.sleep(nanoseconds: backoffSeconds * 1_000_000_000)
        }
    }

    private func connectOnce(config: ServerConfig) async throws {
        let url = config.baseURL.appendingPathComponent("sync/events")
        var req = URLRequest(url: url)
        req.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        let (bytes, response) = try await URLSession.shared.bytes(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        SyncStatusStore.shared.realtimeConnected = true
        // Server sends "data: connected" | "data: change" | "data: ping"; only 'change' pulls.
        for try await line in bytes.lines {
            if Task.isCancelled { break }
            if line == "data: change" { onChange() }
        }
    }
}
