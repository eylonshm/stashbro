// apps/mac/StashBroTests/OGMetadataTests.swift
import XCTest
@testable import StashBro

final class OGMetadataTests: XCTestCase {

    // MARK: - Basic double-quoted attributes

    func testDoubleQuotedOGTitle() {
        let html = #"<meta property="og:title" content="Hello World">"#
        XCTAssertEqual(parseOGMetadata(html: html).title, "Hello World")
    }

    func testDoubleQuotedOGDescription() {
        let html = #"<meta property="og:description" content="A test page.">"#
        XCTAssertEqual(parseOGMetadata(html: html).description, "A test page.")
    }

    func testDoubleQuotedOGImage() {
        let html = #"<meta property="og:image" content="https://example.com/img.png">"#
        XCTAssertEqual(parseOGMetadata(html: html).image, "https://example.com/img.png")
    }

    // MARK: - Single-quoted attributes

    func testSingleQuotedOGImage() {
        let html = "<meta property='og:image' content='https://example.com/single.png'>"
        XCTAssertEqual(parseOGMetadata(html: html).image, "https://example.com/single.png")
    }

    func testSingleQuotedOGTitle() {
        let html = "<meta property='og:title' content='Single Quote Title'>"
        XCTAssertEqual(parseOGMetadata(html: html).title, "Single Quote Title")
    }

    // MARK: - Reversed attribute order (content before property)

    func testReversedAttributeOrder() {
        let html = #"<meta content="https://example.com/reversed.jpg" property="og:image">"#
        XCTAssertEqual(parseOGMetadata(html: html).image, "https://example.com/reversed.jpg")
    }

    // MARK: - &amp; entity decoding in URL

    func testAmpersandDecodedInURL() {
        let html = #"<meta property="og:image" content="https://cdn.example.com/img?a=1&amp;b=2">"#
        let result = parseOGMetadata(html: html).image
        XCTAssertEqual(result, "https://cdn.example.com/img?a=1&b=2")
    }

    func testAmpersandDecodedInGitHubStyle() {
        // Simulates a GitHub-style opengraph image with &amp; query params
        let html = #"<meta property="og:image" content="https://opengraph.githubassets.com/hash/owner/repo?token=abc&amp;v=2">"#
        let result = parseOGMetadata(html: html).image
        XCTAssertEqual(result, "https://opengraph.githubassets.com/hash/owner/repo?token=abc&v=2")
    }

    // MARK: - Relative URL resolution

    func testRelativeImageURLResolved() {
        let html = #"<meta property="og:image" content="/images/og.png">"#
        let base = URL(string: "https://example.com/page")!
        let result = parseOGMetadata(html: html, baseURL: base).image
        XCTAssertEqual(result, "https://example.com/images/og.png")
    }

    func testProtocolRelativeImageURLResolved() {
        let html = #"<meta property="og:image" content="//cdn.example.com/img.png">"#
        let base = URL(string: "https://example.com")!
        let result = parseOGMetadata(html: html, baseURL: base).image
        // //cdn.example.com/img.png is treated as relative starting with "//" so should be resolved
        XCTAssertNotNil(result)
    }

    func testAbsoluteImageURLNotModified() {
        let html = #"<meta property="og:image" content="https://cdn.example.com/img.png">"#
        let base = URL(string: "https://example.com")!
        let result = parseOGMetadata(html: html, baseURL: base).image
        XCTAssertEqual(result, "https://cdn.example.com/img.png")
    }

    // MARK: - Fallback to <title> tag

    func testFallsBackToTitleTag() {
        let html = "<html><head><title>Page Title</title></head></html>"
        XCTAssertEqual(parseOGMetadata(html: html).title, "Page Title")
    }

    func testOGTitleTakesPrecedenceOverTitleTag() {
        let html = #"<title>Fallback</title><meta property="og:title" content="OG Title">"#
        XCTAssertEqual(parseOGMetadata(html: html).title, "OG Title")
    }

    // MARK: - Missing fields return nil

    func testMissingImageReturnsNil() {
        let html = #"<meta property="og:title" content="No Image Here">"#
        XCTAssertNil(parseOGMetadata(html: html).image)
    }

    func testEmptyHTMLReturnsAllNil() {
        let meta = parseOGMetadata(html: "")
        XCTAssertNil(meta.title)
        XCTAssertNil(meta.description)
        XCTAssertNil(meta.image)
    }

    // MARK: - GitHub vscode sample

    func testGitHubOGImageExtracted() {
        // Representative slice of actual GitHub HTML
        let html = """
        <meta property="og:image" content="https://opengraph.githubassets.com/dece061/microsoft/vscode" />\
        <meta property="og:title" content="GitHub - microsoft/vscode: Visual Studio Code" />\
        <meta property="og:description" content="Visual Studio Code. Contribute to microsoft/vscode." />
        """
        let meta = parseOGMetadata(html: html)
        XCTAssertEqual(meta.image, "https://opengraph.githubassets.com/dece061/microsoft/vscode")
        XCTAssertEqual(meta.title, "GitHub - microsoft/vscode: Visual Studio Code")
        XCTAssertNotNil(meta.description)
    }

    // MARK: - og:image:alt should not match og:image

    func testOGImageAltDoesNotMatch() {
        // og:image:alt should not be returned for og:image query
        let html = """
        <meta property="og:image" content="https://example.com/real.png" />
        <meta property="og:image:alt" content="should not match" />
        """
        XCTAssertEqual(parseOGMetadata(html: html).image, "https://example.com/real.png")
    }
}
