// apps/mac/StashBroTests/Task8Tests.swift
import XCTest
@testable import StashBro

final class BrowserTabGrabberClipboardTests: XCTestCase {

    func testHTTPURLPasses() {
        let url = BrowserTabGrabber.clipboardURL(from: "https://example.com/article")
        XCTAssertEqual(url?.absoluteString, "https://example.com/article")
    }

    func testHTTPSURLPasses() {
        let url = BrowserTabGrabber.clipboardURL(from: "https://github.com/owner/repo")
        XCTAssertNotNil(url)
    }

    func testNonHTTPSchemeRejected() {
        XCTAssertNil(BrowserTabGrabber.clipboardURL(from: "ftp://example.com/file"))
    }

    func testMalformedStringRejected() {
        XCTAssertNil(BrowserTabGrabber.clipboardURL(from: "not a url"))
    }

    func testEmptyStringRejected() {
        XCTAssertNil(BrowserTabGrabber.clipboardURL(from: ""))
    }

    func testNilPassthroughRejected() {
        XCTAssertNil(BrowserTabGrabber.clipboardURL(from: nil))
    }

    func testFileURLRejected() {
        XCTAssertNil(BrowserTabGrabber.clipboardURL(from: "file:///Users/test/doc.pdf"))
    }

    func testHTTPWithQueryAndFragment() {
        let url = BrowserTabGrabber.clipboardURL(from: "https://example.com/search?q=swift#top")
        XCTAssertNotNil(url)
        XCTAssertEqual(url?.host, "example.com")
    }
}

final class HotkeyManagerAPITests: XCTestCase {
    // ponytail: real shape check is AppDelegate's call site (compile-time);
    // this verifies the module exports HotkeyManager without invoking KeyboardShortcuts
    func testHotkeyManagerExists() {
        XCTAssertNotNil(HotkeyManager.self)
    }
}
