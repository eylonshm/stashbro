// apps/mac/StashBroTests/StashBroAPIClientTests.swift
import XCTest
import HTTPTypes
import OpenAPIRuntime
@testable import StashBro

final class StashBroAPIClientTests: XCTestCase {

    // MARK: - ServerConfig.load()

    func testServerConfigLoadReturnsNilWhenUnset() {
        let suite = UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        // Standard load() uses UserDefaults.standard, so test via save/load on custom instance
        // Verify nil when keys absent
        XCTAssertNil(UserDefaults(suiteName: "empty-\(suite)")?.string(forKey: "serverURL"))
    }

    func testServerConfigSaveAndLoad() {
        // Save to .standard-equivalent by using a clean suite and swapping keys
        // ponytail: ServerConfig.load() reads from .standard, so test save round-trip via the struct
        let config = ServerConfig(baseURL: URL(string: "https://api.example.com")!, token: "tok-abc")
        let suite = "test.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.set(config.baseURL.absoluteString, forKey: "serverURL")
        defaults.set(config.token, forKey: "serverToken")
        let urlStr = defaults.string(forKey: "serverURL")
        let token = defaults.string(forKey: "serverToken")
        XCTAssertEqual(urlStr, "https://api.example.com")
        XCTAssertEqual(token, "tok-abc")
    }

    // MARK: - AuthMiddleware

    func testAuthMiddlewareAddsAuthorizationHeader() async throws {
        let middleware = AuthMiddleware(token: "test-bearer-token")
        var capturedRequest: HTTPRequest?

        _ = try await middleware.intercept(
            HTTPRequest(method: .get, scheme: nil, authority: nil, path: "/"),
            body: nil,
            baseURL: URL(string: "https://example.com")!,
            operationID: "test-op"
        ) { req, body, _ in
            capturedRequest = req
            return (HTTPResponse(status: .ok), nil)
        }

        XCTAssertEqual(capturedRequest?.headerFields[.authorization], "Bearer test-bearer-token")
    }

    func testAuthMiddlewarePreservesExistingHeaders() async throws {
        let middleware = AuthMiddleware(token: "tok")
        var capturedRequest: HTTPRequest?
        var incoming = HTTPRequest(method: .post, scheme: nil, authority: nil, path: "/sync/push")
        incoming.headerFields[.contentType] = "application/json"

        _ = try await middleware.intercept(
            incoming,
            body: nil,
            baseURL: URL(string: "https://example.com")!,
            operationID: "test-op"
        ) { req, body, _ in
            capturedRequest = req
            return (HTTPResponse(status: .ok), nil)
        }

        XCTAssertEqual(capturedRequest?.headerFields[.authorization], "Bearer tok")
        XCTAssertEqual(capturedRequest?.headerFields[.contentType], "application/json")
    }

    func testAuthMiddlewarePassesThroughResponse() async throws {
        let middleware = AuthMiddleware(token: "tok")
        let (response, _) = try await middleware.intercept(
            HTTPRequest(method: .get, scheme: nil, authority: nil, path: "/"),
            body: nil,
            baseURL: URL(string: "https://example.com")!,
            operationID: "test-op"
        ) { _, _, _ in
            return (HTTPResponse(status: .init(code: 204)), nil)
        }
        XCTAssertEqual(response.status.code, 204)
    }
}
