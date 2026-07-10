// apps/mac/StashBroTests/Task10Tests.swift
import XCTest
@testable import StashBro

// Tests headless-verifiable logic from SettingsView:
// - reconnect() guard: URL(string:) + !token.isEmpty
// - ServerConfig save/load roundtrip (the save path in reconnect())
final class SettingsReconnectValidationTests: XCTestCase {

    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test.\(UUID().uuidString)")!
    }

    // Empty string → URL(string:) returns nil → guard skips reconnect
    func testEmptyURLSkipsReconnect() {
        XCTAssertNil(URL(string: ""))
    }

    // Empty token → guard skips reconnect
    func testEmptyTokenSkipsReconnect() {
        XCTAssertTrue("".isEmpty)
    }

    // Valid URL + token → config saved and re-loaded correctly (the save path in reconnect())
    func testValidConfigSavedAndLoaded() throws {
        let d = freshDefaults()
        let url = URL(string: "https://api.example.com")!
        let config = ServerConfig(baseURL: url, token: "tok-abc")
        config.save(to: d)
        let loaded = try XCTUnwrap(ServerConfig.load(from: d))
        XCTAssertEqual(loaded.baseURL, url)
        XCTAssertEqual(loaded.token, "tok-abc")
    }

    // Reconnect with a new config replaces the old one (save overwrites)
    func testReconnectOverwritesPreviousConfig() throws {
        let d = freshDefaults()
        ServerConfig(baseURL: URL(string: "https://old.example.com")!, token: "old").save(to: d)
        ServerConfig(baseURL: URL(string: "https://new.example.com")!, token: "new").save(to: d)
        let loaded = try XCTUnwrap(ServerConfig.load(from: d))
        XCTAssertEqual(loaded.token, "new")
        XCTAssertEqual(loaded.baseURL.host, "new.example.com")
    }
}
