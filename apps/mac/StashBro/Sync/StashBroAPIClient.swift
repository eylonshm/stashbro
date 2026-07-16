// apps/mac/StashBro/Sync/StashBroAPIClient.swift
import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession

// MARK: - ServerConfig

struct ServerConfig {
    var baseURL: URL
    var token: String

    static func load(from defaults: UserDefaults = .standard) -> ServerConfig? {
        guard let urlStr = defaults.string(forKey: "serverURL"),
              let url = URL(string: urlStr),
              let token = defaults.string(forKey: "serverToken"),
              !token.isEmpty else { return nil }
        return ServerConfig(baseURL: url, token: token)
    }

    func save(to defaults: UserDefaults = .standard) {
        defaults.set(baseURL.absoluteString, forKey: "serverURL")
        defaults.set(token, forKey: "serverToken")
    }

    // MARK: Server URL history (local, most-recent-first, capped at 8)

    static func history(from defaults: UserDefaults = .standard) -> [String] {
        defaults.stringArray(forKey: "serverURLHistory") ?? []
    }

    static func addToHistory(_ url: String, defaults: UserDefaults = .standard) {
        let clean = url.hasSuffix("/") ? String(url.dropLast()) : url
        var h = history(from: defaults).filter { $0 != clean }
        h.insert(clean, at: 0)
        defaults.set(Array(h.prefix(8)), forKey: "serverURLHistory")
    }
}

// MARK: - StashBroAPIClient

final class StashBroAPIClient: SyncClientProtocol {
    private let openAPIClient: Client

    init(config: ServerConfig) {
        self.openAPIClient = Client(
            serverURL: config.baseURL,
            transport: URLSessionTransport(),
            middlewares: [AuthMiddleware(token: config.token)]
        )
    }

    // ponytail: internal init for testing with a mock transport; not for production use
    init(serverURL: URL, transport: any ClientTransport, token: String) {
        self.openAPIClient = Client(
            serverURL: serverURL,
            transport: transport,
            middlewares: [AuthMiddleware(token: token)]
        )
    }

    func pushChanges(_ changes: [SyncChange]) async throws -> Int {
        typealias ChangePayload = Operations.post_sol_sync_sol_push.Input.Body.jsonPayload.changesPayloadPayload
        let payload = changes.map { c in
            ChangePayload(
                id: c.id,
                change_seq: Double(c.changeSeq),
                created_at: apiISO.string(from: c.createdAt),
                updated_at: apiISO.string(from: c.updatedAt),
                deleted_at: c.deletedAt.map { apiISO.string(from: $0) },
                url: c.url,
                title: c.title,
                description: c.description,
                thumbnail_url: c.thumbnailUrl,
                favicon_url: c.faviconUrl,
                domain: c.domain,
                _type: .init(rawValue: c.type.rawValue) ?? .article,
                status: .init(rawValue: c.status.rawValue) ?? .unread,
                priority: .init(rawValue: c.priority.rawValue) ?? .medium,
                tag_names: c.tagNames
            )
        }
        let body = Operations.post_sol_sync_sol_push.Input.Body.jsonPayload(changes: payload)
        let response = try await openAPIClient.post_sol_sync_sol_push(body: .json(body))
        return Int(try response.ok.body.json.accepted)
    }

    func pullChanges(cursor: Int) async throws -> (changes: [SyncChange], cursor: Int) {
        typealias ChangePayload = Operations.get_sol_sync_sol_pull.Output.Ok.Body.jsonPayload.changesPayloadPayload
        let response = try await openAPIClient.get_sol_sync_sol_pull(query: .init(cursor: String(cursor)))
        let result = try response.ok.body.json
        let changes = result.changes.map { c in
            SyncChange(
                id: c.id,
                changeSeq: Int(c.change_seq),
                createdAt: apiISO.date(from: c.created_at) ?? Date(),
                updatedAt: apiISO.date(from: c.updated_at) ?? Date(),
                deletedAt: c.deleted_at.flatMap { apiISO.date(from: $0) },
                url: c.url,
                title: c.title,
                description: c.description,
                thumbnailUrl: c.thumbnail_url,
                faviconUrl: c.favicon_url,
                domain: c.domain,
                type: ItemType(rawValue: c._type.rawValue) ?? .article,
                status: ItemStatus(rawValue: c.status.rawValue) ?? .unread,
                priority: ItemPriority(rawValue: c.priority.rawValue) ?? .medium,
                tagNames: c.tag_names
            )
        }
        return (changes, Int(result.cursor))
    }
}

// ISO-8601 with milliseconds matching server contract: "2026-01-01T12:00:00.000Z"
// ISO8601DateFormatter is thread-safe per Apple docs.
// ponytail: same format as StashItem+DB.swift serverISO; kept private to avoid coupling
private let apiISO: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    f.timeZone = TimeZone(secondsFromGMT: 0)
    return f
}()

// MARK: - AuthMiddleware

struct AuthMiddleware: ClientMiddleware {
    let token: String

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var req = request
        req.headerFields[.authorization] = "Bearer \(token)"
        return try await next(req, body, baseURL)
    }
}
