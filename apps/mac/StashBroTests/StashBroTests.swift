// apps/mac/StashBroTests/StashBroTests.swift
import XCTest
@testable import StashBro

final class StashBroTests: XCTestCase {
    func testPlaceholder() {
        XCTAssertTrue(true)
    }
}

// MARK: - AppDelegate.detectType tests

@MainActor
final class DetectTypeTests: XCTestCase {
    // AppDelegate must be allocated, but applicationDidFinishLaunching NOT called
    // (that would create NSStatusItem + timers - not headless-safe)
    private let delegate = AppDelegate()

    func testYouTubeIsVideo() {
        XCTAssertEqual(delegate.detectType(url: "https://youtube.com/watch?v=abc"), .video)
    }

    func testYouTubeSubdomainIsVideo() {
        XCTAssertEqual(delegate.detectType(url: "https://www.youtube.com/watch?v=abc"), .video)
    }

    func testYouTuBeShortlinkIsVideo() {
        XCTAssertEqual(delegate.detectType(url: "https://youtu.be/abc"), .video)
    }

    func testVimeoIsVideo() {
        XCTAssertEqual(delegate.detectType(url: "https://vimeo.com/123"), .video)
    }

    func testXIsPost() {
        XCTAssertEqual(delegate.detectType(url: "https://x.com/user/status/1"), .post)
    }

    func testTwitterIsPost() {
        XCTAssertEqual(delegate.detectType(url: "https://twitter.com/user/status/1"), .post)
    }

    func testRedditIsPost() {
        XCTAssertEqual(delegate.detectType(url: "https://reddit.com/r/swift"), .post)
    }

    func testThreadsIsPost() {
        XCTAssertEqual(delegate.detectType(url: "https://threads.net/@user"), .post)
    }

    func testUnknownDomainIsArticle() {
        XCTAssertEqual(delegate.detectType(url: "https://example.com/blog/post"), .article)
    }

    func testMalformedURLIsArticle() {
        XCTAssertEqual(delegate.detectType(url: "not-a-url"), .article)
    }
}
