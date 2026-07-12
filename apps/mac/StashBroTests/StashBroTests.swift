// apps/mac/StashBroTests/StashBroTests.swift
import XCTest
@testable import StashBro

final class StashBroTests: XCTestCase {
    func testPlaceholder() {
        XCTAssertTrue(true)
    }
}

// MARK: - BrowserTabGrabber bundle-ID routing

final class BrowserTabGrabberScriptTests: XCTestCase {
    func testSafariMapped()        { XCTAssertNotNil(BrowserTabGrabber.script(for: "com.apple.Safari")) }
    func testChromeMapped()        { XCTAssertNotNil(BrowserTabGrabber.script(for: "com.google.Chrome")) }
    func testChromeCanaryMapped()  { XCTAssertNotNil(BrowserTabGrabber.script(for: "com.google.Chrome.canary")) }
    func testArcMapped()           { XCTAssertNotNil(BrowserTabGrabber.script(for: "company.thebrowser.Browser")) }
    func testBraveMapped()         { XCTAssertNotNil(BrowserTabGrabber.script(for: "com.brave.Browser")) }
    func testEdgeMapped()          { XCTAssertNotNil(BrowserTabGrabber.script(for: "com.microsoft.edgemac")) }
    func testUnknownNil()          { XCTAssertNil(BrowserTabGrabber.script(for: "com.example.NotABrowser")) }
    func testSafariAndChromeAreDifferentScripts() {
        XCTAssertNotEqual(
            BrowserTabGrabber.script(for: "com.apple.Safari"),
            BrowserTabGrabber.script(for: "com.google.Chrome")
        )
    }
}

// MARK: - detectItemType tests

final class DetectTypeTests: XCTestCase {
    func testYouTubeIsVideo() {
        XCTAssertEqual(detectItemType(url: "https://youtube.com/watch?v=abc"), .video)
    }

    func testYouTubeSubdomainIsVideo() {
        XCTAssertEqual(detectItemType(url: "https://www.youtube.com/watch?v=abc"), .video)
    }

    func testYouTuBeShortlinkIsVideo() {
        XCTAssertEqual(detectItemType(url: "https://youtu.be/abc"), .video)
    }

    func testVimeoIsVideo() {
        XCTAssertEqual(detectItemType(url: "https://vimeo.com/123"), .video)
    }

    func testXIsPost() {
        XCTAssertEqual(detectItemType(url: "https://x.com/user/status/1"), .post)
    }

    func testTwitterIsPost() {
        XCTAssertEqual(detectItemType(url: "https://twitter.com/user/status/1"), .post)
    }

    func testRedditIsPost() {
        XCTAssertEqual(detectItemType(url: "https://reddit.com/r/swift"), .post)
    }

    func testThreadsIsPost() {
        XCTAssertEqual(detectItemType(url: "https://threads.net/@user"), .post)
    }

    func testUnknownDomainIsArticle() {
        XCTAssertEqual(detectItemType(url: "https://example.com/blog/post"), .article)
    }

    func testMalformedURLIsArticle() {
        XCTAssertEqual(detectItemType(url: "not-a-url"), .article)
    }
}
