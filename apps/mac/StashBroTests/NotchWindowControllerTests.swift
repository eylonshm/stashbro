// apps/mac/StashBroTests/NotchWindowControllerTests.swift
import XCTest
import AppKit
@testable import StashBro

// MARK: - Geometry tests (pure math, headless safe)

final class NotchGeometryTests: XCTestCase {
    let screen = CGRect(x: 0, y: 0, width: 2560, height: 1600)

    func testPillFrameSize() {
        let frame = NotchWindowController.pillFrame(for: screen)
        XCTAssertEqual(frame.width, 192)
        XCTAssertEqual(frame.height, 30)
    }

    func testPillFrameCenteredAndAtTop() {
        let frame = NotchWindowController.pillFrame(for: screen)
        XCTAssertEqual(frame.midX, screen.midX, accuracy: 0.5)
        XCTAssertEqual(frame.maxY, screen.maxY, accuracy: 0.5)
    }

    func testPanelFrameSize() {
        let frame = NotchWindowController.panelFrame(for: screen)
        XCTAssertEqual(frame.width, 360)
        XCTAssertEqual(frame.height, 420)
    }

    func testPanelFrameCenteredAndAtTop() {
        let frame = NotchWindowController.panelFrame(for: screen)
        XCTAssertEqual(frame.midX, screen.midX, accuracy: 0.5)
        XCTAssertEqual(frame.maxY, screen.maxY, accuracy: 0.5)
    }

    func testPillAndPanelShareMidX() {
        let pill = NotchWindowController.pillFrame(for: screen)
        let panel = NotchWindowController.panelFrame(for: screen)
        XCTAssertEqual(pill.midX, panel.midX, accuracy: 0.5)
    }

    func testPanelLargerThanPill() {
        let pill = NotchWindowController.pillFrame(for: screen)
        let panel = NotchWindowController.panelFrame(for: screen)
        XCTAssertGreaterThan(panel.width, pill.width)
        XCTAssertGreaterThan(panel.height, pill.height)
    }

    // State machine: collapse -> expand -> collapse produces consistent geometry
    func testExpandCollapseCycleGeometry() {
        let collapsed = NotchWindowController.pillFrame(for: screen)
        let expanded = NotchWindowController.panelFrame(for: screen)
        let collapsedAgain = NotchWindowController.pillFrame(for: screen)

        // Expanded is bigger
        XCTAssertGreaterThan(expanded.width, collapsed.width)
        XCTAssertGreaterThan(expanded.height, collapsed.height)
        // Collapsing again returns to the same frame - deterministic
        XCTAssertEqual(collapsedAgain, collapsed)
    }

    func testGeometryOnSmallScreen() {
        // 13" MacBook Air retina logical resolution
        let small = CGRect(x: 0, y: 0, width: 1280, height: 800)
        let pill = NotchWindowController.pillFrame(for: small)
        let panel = NotchWindowController.panelFrame(for: small)
        XCTAssertEqual(pill.midX, 640, accuracy: 0.5)
        XCTAssertEqual(panel.midX, 640, accuracy: 0.5)
        XCTAssertEqual(pill.maxY, 800, accuracy: 0.5)
        XCTAssertEqual(panel.maxY, 800, accuracy: 0.5)
    }
}

// MARK: - Drag URL extraction tests (NSPasteboard, headless safe)

final class NotchURLExtractionTests: XCTestCase {

    func testExtractURLFromPasteboardURL() {
        let pb = NSPasteboard.withUniqueName()
        defer { pb.releaseGlobally() }
        let url = URL(string: "https://example.com/article")!
        pb.writeObjects([url as NSURL])
        XCTAssertEqual(extractDroppedURL(from: pb), url)
    }

    func testExtractURLFromPasteboardString() {
        let pb = NSPasteboard.withUniqueName()
        defer { pb.releaseGlobally() }
        pb.setString("https://swift.org/blog", forType: .string)
        XCTAssertEqual(extractDroppedURL(from: pb)?.absoluteString, "https://swift.org/blog")
    }

    func testExtractURLFromStringWithWhitespace() {
        let pb = NSPasteboard.withUniqueName()
        defer { pb.releaseGlobally() }
        pb.setString("  https://swift.org/blog  \n", forType: .string)
        XCTAssertEqual(extractDroppedURL(from: pb)?.absoluteString, "https://swift.org/blog")
    }

    func testExtractURLFromSchemalessStringReturnsNil() {
        let pb = NSPasteboard.withUniqueName()
        defer { pb.releaseGlobally() }
        // Valid URL structure but no scheme - should be rejected
        pb.setString("notaurl", forType: .string)
        XCTAssertNil(extractDroppedURL(from: pb))
    }

    func testExtractURLFromEmptyPasteboardReturnsNil() {
        let pb = NSPasteboard.withUniqueName()
        defer { pb.releaseGlobally() }
        XCTAssertNil(extractDroppedURL(from: pb))
    }
}
