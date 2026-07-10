// apps/mac/StashBroTests/StashBroTests.swift
import XCTest
@testable import StashBro

final class StashBroTests: XCTestCase {
    func testPlaceholder() {
        XCTAssertTrue(true)
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
