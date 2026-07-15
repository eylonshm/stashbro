// apps/mac/StashBroTests/NotchWindowControllerTests.swift
import XCTest
import AppKit
@testable import StashBro

// MARK: - Geometry tests (pure math, headless safe)

final class NotchGeometryTests: XCTestCase {
    let screen = CGRect(x: 0, y: 0, width: 2560, height: 1600)
    let pillW: CGFloat = 189  // typical MacBook notch width

    func testPillFrameSize() {
        let frame = NotchWindowController.pillFrame(pillWidth: pillW, height: 32, screen: screen)
        XCTAssertEqual(frame.width, pillW)
        XCTAssertEqual(frame.height, 32, "pill height must match the physical notch height passed in")
    }

    func testPillFrameTopCenter() {
        let frame = NotchWindowController.pillFrame(pillWidth: pillW, height: 32, screen: screen)
        XCTAssertEqual(frame.midX, screen.midX, accuracy: 0.5)
        XCTAssertEqual(frame.maxY, screen.maxY, accuracy: 0.5)
    }

    func testExpandedFrameSize() {
        let frame = NotchWindowController.expandedFrame(screen: screen)
        XCTAssertEqual(frame.width, NotchWindowController.openWidth)
        XCTAssertEqual(frame.height, NotchWindowController.openHeight)
    }

    func testExpandedFrameTopCenter() {
        let frame = NotchWindowController.expandedFrame(screen: screen)
        XCTAssertEqual(frame.midX, screen.midX, accuracy: 0.5)
        XCTAssertEqual(frame.maxY, screen.maxY, accuracy: 0.5)
    }

    func testFramesOnSmallScreen() {
        let small = CGRect(x: 0, y: 0, width: 1280, height: 800)
        let pf = NotchWindowController.pillFrame(pillWidth: 160, height: 32, screen: small)
        let ef = NotchWindowController.expandedFrame(screen: small)
        XCTAssertEqual(pf.midX, 640, accuracy: 0.5)
        XCTAssertEqual(pf.maxY, 800, accuracy: 0.5)
        XCTAssertEqual(ef.midX, 640, accuracy: 0.5)
        XCTAssertEqual(ef.maxY, 800, accuracy: 0.5)
    }

    func testFramesAreDeterministic() {
        let a = NotchWindowController.pillFrame(pillWidth: pillW, height: 32, screen: screen)
        let b = NotchWindowController.pillFrame(pillWidth: pillW, height: 32, screen: screen)
        XCTAssertEqual(a, b)
    }
}

// MARK: - Panel lifecycle (needs a screen; runs on dev machine / CI with display)

@MainActor
final class NotchPanelLifecycleTests: XCTestCase {
    // Visible panels only - closed windows can linger in NSApp.windows until ARC frees them
    private func notchPanelCount() -> Int {
        NSApp.windows.filter { $0 is NotchPanel && $0.isVisible }.count
    }

    // Replacing/disabling the controller must close its window - an ordered-front
    // NSWindow outlives its controller in NSApp.windows, leaving a zombie pill
    func testDeallocClosesPanel() {
        let before = notchPanelCount()
        var controller: NotchWindowController? =
            NotchWindowController(db: AppDatabase.makeInMemory(), syncEngine: { nil }, debugMode: true)
        weak var weakController = controller
        XCTAssertEqual(notchPanelCount(), before + 1, "controller should put one panel onscreen")
        controller = nil
        _ = controller
        XCTAssertNil(weakController, "controller must deallocate when released - something retains it")
        XCTAssertEqual(notchPanelCount(), before, "dealloc must close the panel, not leave a zombie")
    }

    // Regression: a display-config change must reposition the panel via a single teardown+rebuild,
    // never drop it (the original disappearing-notch bug) nor leave a zombie duplicate. The screen
    // layout is unchanged during the test, but the notification still drives reconfigure through
    // its signature guard - the panel count must stay at exactly one.
    func testScreenParametersChangeKeepsExactlyOnePanel() {
        let before = notchPanelCount()
        let controller =
            NotchWindowController(db: AppDatabase.makeInMemory(), syncEngine: { nil }, debugMode: true)
        XCTAssertEqual(notchPanelCount(), before + 1, "controller should put one panel onscreen")

        NotificationCenter.default.post(
            name: NSApplication.didChangeScreenParametersNotification, object: nil
        )
        NotificationCenter.default.post(
            name: NSApplication.didChangeScreenParametersNotification, object: nil
        )

        XCTAssertEqual(notchPanelCount(), before + 1,
                       "screen-change must not drop the panel or leave a zombie duplicate")
        withExtendedLifetime(controller) {}
    }
}

// MARK: - NotchHoverLogic tests (pure struct, no AppKit)

final class NotchHoverLogicTests: XCTestCase {
    var logic = NotchHoverLogic(debounce: 0.3)
    let t0 = Date(timeIntervalSince1970: 1000)

    override func setUp() {
        super.setUp()
        logic = NotchHoverLogic(debounce: 0.3)
    }

    func testNoActionWhenCursorJustEnters() {
        let action = logic.update(now: t0, cursorInside: true)
        XCTAssertEqual(action, .none)
        XCTAssertEqual(logic.state, .collapsed)
    }

    func testExpandAfterDebounce() {
        _ = logic.update(now: t0, cursorInside: true)
        let action = logic.update(now: t0.addingTimeInterval(0.31), cursorInside: true)
        XCTAssertEqual(action, .expand)
        XCTAssertEqual(logic.state, .expanded)
    }

    func testNoExpandIfCursorLeavesBeforeDebounce() {
        _ = logic.update(now: t0, cursorInside: true)
        _ = logic.update(now: t0.addingTimeInterval(0.2), cursorInside: false)  // exit before 0.3s
        let action = logic.update(now: t0.addingTimeInterval(0.4), cursorInside: true)  // re-enter
        XCTAssertEqual(action, .none)  // debounce reset; only just entered again
        XCTAssertEqual(logic.state, .collapsed)
    }

    func testCollapseAfterDebounce() {
        // Expand first
        _ = logic.update(now: t0, cursorInside: true)
        _ = logic.update(now: t0.addingTimeInterval(0.31), cursorInside: true)
        XCTAssertEqual(logic.state, .expanded)
        // Exit and hold outside
        _ = logic.update(now: t0.addingTimeInterval(0.32), cursorInside: false)
        let action = logic.update(now: t0.addingTimeInterval(0.65), cursorInside: false)
        XCTAssertEqual(action, .collapse)
        XCTAssertEqual(logic.state, .collapsed)
    }

    func testNoCollapseIfCursorReentersBeforeDebounce() {
        // Expand first
        _ = logic.update(now: t0, cursorInside: true)
        _ = logic.update(now: t0.addingTimeInterval(0.31), cursorInside: true)
        // Exit, then re-enter before debounce
        _ = logic.update(now: t0.addingTimeInterval(0.32), cursorInside: false)
        _ = logic.update(now: t0.addingTimeInterval(0.50), cursorInside: true)   // re-enter at 0.18s outside
        let action = logic.update(now: t0.addingTimeInterval(0.65), cursorInside: false)
        XCTAssertEqual(action, .none)  // reset when re-entered; now only 0.15s outside
        XCTAssertEqual(logic.state, .expanded)
    }

    func testExpandOnlyFiredOnce() {
        // Multiple polls while inside - should fire expand exactly once
        _ = logic.update(now: t0, cursorInside: true)
        let a1 = logic.update(now: t0.addingTimeInterval(0.31), cursorInside: true)
        let a2 = logic.update(now: t0.addingTimeInterval(0.5), cursorInside: true)
        XCTAssertEqual(a1, .expand)
        XCTAssertEqual(a2, .none)  // already expanded
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
        pb.setString("notaurl", forType: .string)
        XCTAssertNil(extractDroppedURL(from: pb))
    }

    func testExtractURLFromEmptyPasteboardReturnsNil() {
        let pb = NSPasteboard.withUniqueName()
        defer { pb.releaseGlobally() }
        XCTAssertNil(extractDroppedURL(from: pb))
    }
}
