// apps/mac/StashBro/Notch/NotchWindowController.swift
import AppKit
import SwiftUI

// Module-level for testability - same pattern as StashListView helpers.
func extractDroppedURL(from pasteboard: NSPasteboard) -> URL? {
    if let urls = pasteboard.readObjects(forClasses: [NSURL.self], options: nil) as? [URL],
       let first = urls.first {
        return first
    }
    if let str = pasteboard.string(forType: .string),
       let url = URL(string: str.trimmingCharacters(in: .whitespacesAndNewlines)),
       url.scheme != nil {
        return url
    }
    return nil
}

// Observable state: controller sets isExpanded, SwiftUI spring-animates on change.
final class NotchState: ObservableObject {
    @Published var isExpanded = false
}

// Pure hover state machine - no AppKit, unit-testable.
// ponytail: 10Hz mouse poll - NSTrackingArea flapped on SwiftUI re-render; upgrade path: global mouseMoved monitor
struct NotchHoverLogic {
    enum State: Equatable { case collapsed, expanded }
    enum Action: Equatable { case none, expand, collapse }

    private(set) var state: State = .collapsed
    private var debounceSince: Date? = nil
    let debounce: TimeInterval

    init(debounce: TimeInterval = 0.3) {
        self.debounce = debounce
    }

    // cursorInside: is cursor within current panel.frame (pill when collapsed, 400x420 when expanded)
    mutating func update(now: Date, cursorInside: Bool) -> Action {
        switch state {
        case .collapsed:
            if cursorInside {
                if debounceSince == nil { debounceSince = now }
                if now.timeIntervalSince(debounceSince!) >= debounce {
                    state = .expanded
                    debounceSince = nil
                    return .expand
                }
            } else {
                debounceSince = nil
            }
        case .expanded:
            if !cursorInside {
                if debounceSince == nil { debounceSince = now }
                if now.timeIntervalSince(debounceSince!) >= debounce {
                    state = .collapsed
                    debounceSince = nil
                    return .collapse
                }
            } else {
                debounceSince = nil
            }
        }
        return .none
    }
}

// NSPanel: minimal - constrainFrameRect for absolute-top positioning.
// No sendEvent override, no hitTest tricks. Window sizing IS the click-through mechanism.
final class NotchPanel: NSPanel {  // internal for tests (panel lifecycle assertions)
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    // Lets panel sit at absolute top (y=0, notch strip) without AppKit clamping.
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect {
        return frameRect
    }
}

// NotchRootView: driven by NotchState ObservableObject, spring-animates on isExpanded.
// Both subviews always mounted; opacity cross-fade. Controller resizes window; view fills it.
struct NotchRootView: View {
    let db: AppDatabase
    let syncEngine: () -> SyncEngine?  // ponytail: closure for live engine after reconnect
    let pillWidth: CGFloat
    @ObservedObject var state: NotchState

    private static let spring = Animation.interactiveSpring(response: 0.38, dampingFraction: 0.8, blendDuration: 0)

    var body: some View {
        ZStack(alignment: .top) {
            NotchPanelView(db: db, syncEngine: syncEngine)
                .opacity(state.isExpanded ? 1 : 0)
                .allowsHitTesting(state.isExpanded)
            NotchPillView(db: db, width: pillWidth)
                .opacity(state.isExpanded ? 0 : 1)
                .allowsHitTesting(!state.isExpanded)
        }
        .background(Color(red: 0.039, green: 0.039, blue: 0.047))
        .frame(width: state.isExpanded ? 400 : pillWidth, height: state.isExpanded ? 420 : 30)
        .clipShape(UnevenRoundedRectangle(
            bottomLeadingRadius: state.isExpanded ? 18 : 16,
            bottomTrailingRadius: state.isExpanded ? 18 : 16
        ))
        .animation(Self.spring, value: state.isExpanded)
        // Top-align in window; during collapse the window is still expanded size while content springs down
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

@MainActor
final class NotchWindowController {
    private var panel: NSPanel?
    private let notchState = NotchState()
    private var hoverLogic = NotchHoverLogic()
    private var hoverTimer: Timer?
    private var openAppObserver: NSObjectProtocol?
    private var shrinkGeneration = 0
    private let db: AppDatabase
    private let syncEngine: () -> SyncEngine?

    // NSScreen-dependent; not testable headless - callers use the CGRect overloads below.
    static nonisolated func pillWidth(for screen: NSScreen) -> CGFloat {
        if let leftW = screen.auxiliaryTopLeftArea?.width,
           let rightW = screen.auxiliaryTopRightArea?.width {
            return screen.frame.width - leftW - rightW + 4
        }
        return 160
    }

    // screen: NSScreen.frame (bottom-left origin, same as NSWindow.frame coords).
    static nonisolated func pillFrame(pillWidth: CGFloat, screen: CGRect) -> CGRect {
        CGRect(
            x: screen.midX - pillWidth / 2,
            y: screen.maxY - 30,
            width: pillWidth,
            height: 30
        )
    }

    static nonisolated func expandedFrame(screen: CGRect) -> CGRect {
        CGRect(
            x: screen.midX - 200,
            y: screen.maxY - 420,
            width: 400,
            height: 420
        )
    }

    init(db: AppDatabase, syncEngine: @escaping () -> SyncEngine?, debugMode: Bool = false) {
        self.db = db
        self.syncEngine = syncEngine
        guard let screen = NSScreen.main, debugMode || screen.safeAreaInsets.top > 0 else { return }
        setupPanel(screen: screen)
    }

    private func setupPanel(screen: NSScreen) {
        let pillW = Self.pillWidth(for: screen)
        let screenRect = screen.frame
        let pf = Self.pillFrame(pillWidth: pillW, screen: screenRect)

        let panel = NotchPanel(
            contentRect: NSRect(x: pf.minX, y: pf.minY, width: pf.width, height: pf.height),
            styleMask: [.borderless, .nonactivatingPanel, .utilityWindow, .hudWindow],
            backing: .buffered,
            defer: false
        )
        panel.level = .mainMenu + 3
        panel.collectionBehavior = [.fullScreenAuxiliary, .stationary, .canJoinAllSpaces, .ignoresCycle]
        panel.isFloatingPanel = true
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.isMovable = false
        panel.isReleasedWhenClosed = false
        panel.hasShadow = false
        panel.ignoresMouseEvents = false

        let rootView = NotchRootView(db: db, syncEngine: syncEngine, pillWidth: pillW, state: notchState)
        let hosting = NSHostingView(rootView: rootView)
        hosting.sizingOptions = []
        hosting.wantsLayer = true
        hosting.layer?.backgroundColor = .clear
        panel.contentView = hosting

        panel.orderFrontRegardless()
        self.panel = panel

        startHoverTimer(pillW: pillW, screenRect: screenRect)

        // Auto-close when "Open App" is clicked - main window takes over
        openAppObserver = NotificationCenter.default.addObserver(
            forName: MainWindowController.openMainWindow, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.notchState.isExpanded else { return }
                self.hoverLogic = NotchHoverLogic()  // ponytail: fresh instance starts collapsed
                self.collapseAfterAnimation(pillW: pillW, screenRect: screenRect)
            }
        }
    }

    private func startHoverTimer(pillW: CGFloat, screenRect: CGRect) {
        // ponytail: 10Hz mouse poll - NSTrackingArea flapped on SwiftUI re-render; upgrade path: global mouseMoved monitor
        let timer = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { [weak self] in
                self?.pollHover(pillW: pillW, screenRect: screenRect)
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        hoverTimer = timer
    }

    private func pollHover(pillW: CGFloat, screenRect: CGRect) {
        guard panel != nil else { return }
        // NSEvent.mouseLocation: global screen coords, bottom-left origin (same as NSWindow.frame)
        // Hit-test the LOGIC state's rect, not panel.frame - after a forced collapse the window
        // stays expanded-sized for 0.45s and a cursor inside it would immediately re-expand.
        let cursor = NSEvent.mouseLocation
        let rect = hoverLogic.state == .expanded
            ? Self.expandedFrame(screen: screenRect)
            : Self.pillFrame(pillWidth: pillW, screen: screenRect)
        let cursorInside = rect.insetBy(dx: -2, dy: -2).contains(cursor)
        switch hoverLogic.update(now: Date(), cursorInside: cursorInside) {
        case .expand:   expand(pillW: pillW, screenRect: screenRect)
        case .collapse: collapseAfterAnimation(pillW: pillW, screenRect: screenRect)
        case .none:     break
        }
    }

    private func expand(pillW: CGFloat, screenRect: CGRect) {
        guard let panel else { return }
        shrinkGeneration += 1  // cancel any pending deferred shrink
        let ef = Self.expandedFrame(screen: screenRect)
        // Instantly resize to expanded frame first (transparent - invisible), then spring content
        panel.setFrame(NSRect(x: ef.minX, y: ef.minY, width: ef.width, height: ef.height),
                       display: true, animate: false)
        panel.contentView?.layoutSubtreeIfNeeded()
        // One-tick hop: let the widened window commit with the pill re-centered before the
        // spring starts - starting both in one transaction anchored the growth to the left edge
        DispatchQueue.main.async { [weak self] in
            self?.notchState.isExpanded = true
        }
    }

    private func collapseAfterAnimation(pillW: CGFloat, screenRect: CGRect) {
        notchState.isExpanded = false
        shrinkGeneration += 1
        let gen = shrinkGeneration
        // Wait for spring to settle (~0.45s), then shrink window back to pill
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { [weak self] in
            guard let self, self.shrinkGeneration == gen else { return }
            let pf = Self.pillFrame(pillWidth: pillW, screen: screenRect)
            self.panel?.setFrame(NSRect(x: pf.minX, y: pf.minY, width: pf.width, height: pf.height),
                                 display: true, animate: false)
        }
    }

    deinit {
        hoverTimer?.invalidate()
        if let openAppObserver { NotificationCenter.default.removeObserver(openAppObserver) }
        // Ordered-front windows stay in NSApp.windows past dealloc - without close()
        // a replaced/disabled controller leaves a zombie pill onscreen forever
        panel?.close()
    }
}
