// apps/mac/StashBroTests/StashBroAPIClientTests.swift
import XCTest
import HTTPTypes
import OpenAPIRuntime
@testable import StashBro

// MARK: - MockTransport

/// Captures the last request body and returns a canned JSON response.
final class MockTransport: ClientTransport, @unchecked Sendable {
    var capturedBody: Data?
    private let status: Int
    private let json: String

    init(status: Int = 200, json: String) {
        self.status = status
        self.json = json
    }

    func send(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        if let body {
            capturedBody = try await Data(collecting: body, upTo: 1024 * 1024)
        }
        return (.init(status: .init(code: status)), HTTPBody(Data(json.utf8)))
    }
}

// MARK: - ServerConfig tests

final class ServerConfigTests: XCTestCase {

    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test.sc.\(UUID().uuidString)")!
    }

    func testLoadReturnsNilWhenKeysAbsent() {
        XCTAssertNil(ServerConfig.load(from: freshDefaults()))
    }

    func testLoadReturnsNilWhenTokenEmpty() {
        let d = freshDefaults()
        d.set("https://api.example.com", forKey: "serverURL")
        d.set("", forKey: "serverToken")
        XCTAssertNil(ServerConfig.load(from: d))
    }

    func testSaveAndLoadRoundTrip() throws {
        let d = freshDefaults()
        let config = ServerConfig(baseURL: URL(string: "https://api.example.com")!, token: "tok-abc")
        config.save(to: d)
        let loaded = try XCTUnwrap(ServerConfig.load(from: d))
        XCTAssertEqual(loaded.baseURL.absoluteString, "https://api.example.com")
        XCTAssertEqual(loaded.token, "tok-abc")
    }
}

// MARK: - AuthMiddleware tests

final class AuthMiddlewareTests: XCTestCase {

    func testAddsAuthorizationHeader() async throws {
        let mw = AuthMiddleware(token: "test-bearer-token")
        var captured: HTTPRequest?
        _ = try await mw.intercept(
            HTTPRequest(method: .get, scheme: nil, authority: nil, path: "/"),
            body: nil,
            baseURL: URL(string: "https://example.com")!,
            operationID: "op"
        ) { req, _, _ in captured = req; return (.init(status: .ok), nil) }
        XCTAssertEqual(captured?.headerFields[.authorization], "Bearer test-bearer-token")
    }

    func testPreservesExistingHeaders() async throws {
        let mw = AuthMiddleware(token: "tok")
        var captured: HTTPRequest?
        var req = HTTPRequest(method: .post, scheme: nil, authority: nil, path: "/")
        req.headerFields[.contentType] = "application/json"
        _ = try await mw.intercept(req, body: nil,
            baseURL: URL(string: "https://example.com")!, operationID: "op"
        ) { r, _, _ in captured = r; return (.init(status: .ok), nil) }
        XCTAssertEqual(captured?.headerFields[.contentType], "application/json")
        XCTAssertEqual(captured?.headerFields[.authorization], "Bearer tok")
    }
}

// MARK: - SyncChange ↔ generated-type mapping tests

final class MappingTests: XCTestCase {

    private let baseURL = URL(string: "https://api.example.com")!

    // Pull: server JSON → SyncChange (all fields, _type, Double change_seq, .SSS'Z' dates)
    func testPullMappingAllFields() async throws {
        let json = """
        {
          "changes": [{
            "id": "item-abc",
            "change_seq": 42.0,
            "created_at": "2026-01-01T10:00:00.000Z",
            "updated_at": "2026-06-15T12:30:00.500Z",
            "deleted_at": null,
            "url": "https://example.com/article",
            "title": "Test Article",
            "description": "A description",
            "thumbnail_url": "https://img.example.com/thumb.png",
            "favicon_url": null,
            "domain": "example.com",
            "type": "video",
            "status": "archived",
            "priority": "high",
            "tag_names": ["swift", "mac"]
          }],
          "cursor": 99.0
        }
        """
        let transport = MockTransport(json: json)
        let client = StashBroAPIClient(serverURL: baseURL, transport: transport, token: "t")
        let (changes, cursor) = try await client.pullChanges(cursor: 0)

        XCTAssertEqual(cursor, 99)
        XCTAssertEqual(changes.count, 1)
        let c = changes[0]
        XCTAssertEqual(c.id, "item-abc")
        XCTAssertEqual(c.changeSeq, 42)         // Double 42.0 → Int 42
        XCTAssertEqual(c.url, "https://example.com/article")
        XCTAssertEqual(c.title, "Test Article")
        XCTAssertEqual(c.description, "A description")
        XCTAssertEqual(c.thumbnailUrl, "https://img.example.com/thumb.png")
        XCTAssertNil(c.faviconUrl)
        XCTAssertNil(c.deletedAt)
        XCTAssertEqual(c.domain, "example.com")
        XCTAssertEqual(c.type, .video)          // _type field
        XCTAssertEqual(c.status, .archived)
        XCTAssertEqual(c.priority, .high)
        XCTAssertEqual(c.tagNames, ["swift", "mac"])
        // .SSS'Z' fractional seconds preserved: parse same string and compare
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        iso.timeZone = TimeZone(secondsFromGMT: 0)
        let expectedUpdated = iso.date(from: "2026-06-15T12:30:00.500Z")!
        XCTAssertEqual(c.updatedAt.timeIntervalSince1970, expectedUpdated.timeIntervalSince1970, accuracy: 0.001)
    }

    // Pull: nullable deleted_at, null description, empty tag_names
    func testPullMappingTombstone() async throws {
        let json = """
        {
          "changes": [{
            "id": "tomb",
            "change_seq": 5.0,
            "created_at": "2026-01-01T00:00:00.000Z",
            "updated_at": "2026-01-02T00:00:00.000Z",
            "deleted_at": "2026-01-02T00:00:00.000Z",
            "url": "https://x.com", "title": "X", "description": null,
            "thumbnail_url": null, "favicon_url": null, "domain": "x.com",
            "type": "article", "status": "unread", "priority": "medium",
            "tag_names": []
          }],
          "cursor": 5.0
        }
        """
        let transport = MockTransport(json: json)
        let client = StashBroAPIClient(serverURL: baseURL, transport: transport, token: "t")
        let (changes, _) = try await client.pullChanges(cursor: 0)
        XCTAssertNotNil(changes[0].deletedAt)
        XCTAssertNil(changes[0].description)
        XCTAssertEqual(changes[0].tagNames, [])
    }

    // Push: SyncChange → serialized JSON payload (field names, types, .SSS'Z' dates)
    func testPushMappingSerializesCorrectly() async throws {
        let transport = MockTransport(json: #"{"accepted": 1.0}"#)
        let client = StashBroAPIClient(serverURL: baseURL, transport: transport, token: "t")

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        iso.timeZone = TimeZone(secondsFromGMT: 0)

        let change = SyncChange(
            id: "push-id", changeSeq: 7,
            createdAt: iso.date(from: "2026-03-01T08:00:00.000Z")!,
            updatedAt: iso.date(from: "2026-03-10T09:30:00.250Z")!,
            deletedAt: iso.date(from: "2026-03-10T09:30:00.250Z")!,
            url: "https://push.example.com", title: "Push Title",
            description: nil, thumbnailUrl: nil, faviconUrl: nil,
            domain: "push.example.com",
            type: .post, status: .unread, priority: .low,
            tagNames: ["tag1"]
        )
        let accepted = try await client.pushChanges([change])
        XCTAssertEqual(accepted, 1)

        let bodyData = try XCTUnwrap(transport.capturedBody)
        let json = try JSONSerialization.jsonObject(with: bodyData) as! [String: Any]
        let cs = (json["changes"] as! [[String: Any]])[0]
        XCTAssertEqual(cs["id"] as? String, "push-id")
        XCTAssertEqual(cs["change_seq"] as? Double, 7.0)
        XCTAssertEqual(cs["created_at"] as? String, "2026-03-01T08:00:00.000Z")
        XCTAssertEqual(cs["updated_at"] as? String, "2026-03-10T09:30:00.250Z")
        XCTAssertEqual(cs["deleted_at"] as? String, "2026-03-10T09:30:00.250Z")
        XCTAssertEqual(cs["type"] as? String, "post")      // _type → "type" in JSON
        XCTAssertEqual(cs["status"] as? String, "unread")
        XCTAssertEqual(cs["priority"] as? String, "low")
        XCTAssertEqual(cs["tag_names"] as? [String], ["tag1"])
        XCTAssertNil(cs["description"])
    }
}
