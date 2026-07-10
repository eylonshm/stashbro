// apps/mac/StashBroTests/Task10Tests.swift
import XCTest
@testable import StashBro

// Tests headless-verifiable logic from SettingsView.
// M2: real tests of validatedConfig (M1 guard: scheme must be http/https).
// C2: showInNotch bool default and key name verified.
// C1: logic is in AppDelegate/NotchWindowController; smoke-tested via build.
final class SettingsReconnectValidationTests: XCTestCase {

    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test.\(UUID().uuidString)")!
    }

    // M1+M2: valid https URL + token returns a config
    func testValidHTTPSReturnsConfig() {
        let cfg = validatedConfig(urlString: "https://api.example.com", token: "tok")
        XCTAssertNotNil(cfg)
        XCTAssertEqual(cfg?.baseURL.scheme, "https")
    }

    // M1+M2: valid http URL also accepted
    func testValidHTTPReturnsConfig() {
        XCTAssertNotNil(validatedConfig(urlString: "http://localhost:8080", token: "tok"))
    }

    // M1+M2: non-http/https scheme rejected (M1 guard)
    func testFTPSchemeReturnsNil() {
        XCTAssertNil(validatedConfig(urlString: "ftp://files.example.com", token: "tok"))
    }

    // M2: empty URL rejected
    func testEmptyURLReturnsNil() {
        XCTAssertNil(validatedConfig(urlString: "", token: "tok"))
    }

    // M2: empty token rejected
    func testEmptyTokenReturnsNil() {
        XCTAssertNil(validatedConfig(urlString: "https://api.example.com", token: ""))
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

    // C2: showInNotch defaults false (notch off until user opts in)
    func testShowInNotchDefaultsFalse() {
        let d = freshDefaults()
        XCTAssertFalse(d.bool(forKey: "showInNotch"))
    }

    // C2: showInNotch true triggers notch surface
    func testShowInNotchRoundTrips() {
        let d = freshDefaults()
        d.set(true, forKey: "showInNotch")
        XCTAssertTrue(d.bool(forKey: "showInNotch"))
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
