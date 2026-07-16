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
    // canBecomeKey=true lets TextFields receive keyboard focus when clicked.
    // nonactivatingPanel ensures this does NOT activate the app on hover - only on explicit click.
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    // Lets panel sit at absolute top (y=0, notch strip) without AppKit clamping.
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect {
        return frameRect
    }
}

// Glass background for the expanded notch panel.
// behindWindow blending captures the desktop/menu bar below (the SkyLight pin puts us above them).
// Top stays opaque black via the gradient so the hardware-notch region is never translucent.
private struct VisualEffectView: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let v = NSVisualEffectView()
        v.material = .hudWindow
        v.blendingMode = .behindWindow
        v.state = .active
        return v
    }
    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}

// NotchRootView: boring.notch model. The WINDOW is a fixed canvas (open size, flush top-center);
// the black NotchShape grows from the physical-notch size (closed) to the full open size, pinned
// to the top-center, with the corner radii tweening. The window never resizes - that's what makes
// the closed notch line up exactly with the hardware notch and the growth anchor at the top.
struct NotchRootView: View {
    let db: AppDatabase
    let syncEngine: () -> SyncEngine?  // ponytail: closure for live engine after reconnect
    let notchWidth: CGFloat
    let notchHeight: CGFloat
    let openWidth: CGFloat
    let openHeight: CGFloat
    @ObservedObject var state: NotchState

    // boring.notch springs: open bouncy, close settled (no overshoot).
    private static let openSpring = Animation.spring(response: 0.42, dampingFraction: 0.8, blendDuration: 0)
    private static let closeSpring = Animation.spring(response: 0.45, dampingFraction: 1.0, blendDuration: 0)

    var body: some View {
        let expanded = state.isExpanded
        let topRadius: CGFloat = expanded ? 19 : 6
        ZStack(alignment: .top) {
            NotchPanelView(db: db, syncEngine: syncEngine, notchHeight: notchHeight, width: openWidth)
                .opacity(expanded ? 1 : 0)
                .allowsHitTesting(expanded)
        }
        .frame(width: expanded ? openWidth : notchWidth,
               height: expanded ? openHeight : notchHeight)
        // Glass background: opaque black when closed (must overlay hardware notch exactly).
        // When open: visual-effect blur (shows desktop/menu bar through glass) + gradient overlay
        // that keeps the top strip black and fades to translucent toward the bottom.
        .background(Group {
            if expanded {
                ZStack {
                    VisualEffectView()
                    LinearGradient(
                        stops: [
                            .init(color: .black, location: 0),
                            .init(color: .black.opacity(0.82), location: 0.18),
                            .init(color: .black.opacity(0.35), location: 1),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
            } else {
                Color.black
            }
        })
        // boring.notch corner radii: closed (top 6, bottom 14), open (top 19, bottom 24).
        .clipShape(NotchShape(topCornerRadius: topRadius, bottomCornerRadius: expanded ? 24 : 14))
        // 1px black strip patches the antialiasing seam between the notch top and the screen edge.
        .overlay(alignment: .top) {
            Rectangle().fill(.black).frame(height: 1).padding(.horizontal, topRadius)
        }
        .animation(expanded ? Self.openSpring : Self.closeSpring, value: expanded)
        // Drop a URL onto the notch to save it (works while open/interactive).
        .onDrop(of: [.url], delegate: NotchDropDelegate())
        // Fixed canvas: the growing notch is pinned to the top-center of the window.
        .frame(width: openWidth, height: openHeight, alignment: .top)
    }
}

@MainActor
final class NotchWindowController {
    private var panel: NSPanel?
    private let notchState = NotchState()
    private var hoverLogic = NotchHoverLogic()
    private var hoverTimer: Timer?
    private var openAppObserver: NSObjectProtocol?
    private var addURLObserver: NSObjectProtocol?
    private var screenObserver: NSObjectProtocol?

    // Open notch canvas size (the fixed window size). Width/height of the reading-list panel.
    // 640 wide matches boring.notch's open width (~1.6x the old 400).
    static let openWidth: CGFloat = 640
    static let openHeight: CGFloat = 420

    // Pin the panel into a SkyLight space above the menu bar (and fullscreen apps / recording /
    // Space switches). See SkyLightOperator - CGSSpace no longer clears the menu bar on macOS 26.
    // Skipped under XCTest (private-framework side effects don't belong in unit tests / headless CI).
    private static let isUnderTest = NSClassFromString("XCTestCase") != nil
    private let db: AppDatabase
    private let syncEngine: () -> SyncEngine?
    private let debugMode: Bool

    // Live geometry for the current screen - recomputed by setupPanel on every (re)configure.
    // Instance state, NOT captured in closures, so a screen change can reposition everything.
    private var pillW: CGFloat = 160
    private var screenRect: CGRect = .zero
    private var notchHeight: CGFloat = 32  // physical notch height (safeAreaInsets.top)
    // Signature of the screen layout the panel was last built for - guards against rebuilding
    // on didChangeScreenParameters notifications that don't actually change topology.
    private var screenSignature: [String] = []

    // NSScreen-dependent; not testable headless - callers use the CGRect overloads below.
    static nonisolated func pillWidth(for screen: NSScreen) -> CGFloat {
        if let leftW = screen.auxiliaryTopLeftArea?.width,
           let rightW = screen.auxiliaryTopRightArea?.width {
            return screen.frame.width - leftW - rightW + 4
        }
        return 160
    }

    // screen: NSScreen.frame (bottom-left origin, same as NSWindow.frame coords).
    // height = physical notch height (safeAreaInsets.top) so the pill exactly covers the hardware
    // notch - a shorter pill lets the notch's rounded bottom peek out ("see both notches").
    static nonisolated func pillFrame(pillWidth: CGFloat, height: CGFloat, screen: CGRect) -> CGRect {
        CGRect(
            x: screen.midX - pillWidth / 2,
            y: screen.maxY - height,
            width: pillWidth,
            height: height
        )
    }

    // The fixed window frame: open size, flush top-center. The window stays this size always;
    // the notch shape grows/shrinks inside it (boring.notch model).
    static nonisolated func expandedFrame(screen: CGRect) -> CGRect {
        CGRect(
            x: screen.midX - openWidth / 2,
            y: screen.maxY - openHeight,
            width: openWidth,
            height: openHeight
        )
    }

    // The screen the notch should live on: the physically-notched built-in display.
    // debugMode forces NSScreen.main so --debug-notch works on any hardware.
    private func notchScreen() -> NSScreen? {
        if debugMode { return NSScreen.main }
        return NSScreen.screens.first { $0.safeAreaInsets.top > 0 }
    }

    // Fingerprint of the current display layout - frame + notch inset per screen.
    // Changes when a display is added/removed, resolution/scale changes, or the notch
    // appears/disappears (clamshell, lid open/close). boring.notch guards rebuilds the same way.
    private func currentSignature() -> [String] {
        NSScreen.screens.map { "\($0.frame.origin.x),\($0.frame.origin.y),\($0.frame.width),\($0.frame.height),\($0.safeAreaInsets.top)" }
    }

    init(db: AppDatabase, syncEngine: @escaping () -> SyncEngine?, debugMode: Bool = false) {
        self.db = db
        self.syncEngine = syncEngine
        self.debugMode = debugMode

        // Register observers BEFORE the hardware guard: even if there's no notched screen
        // right now, a later didChangeScreenParameters (external notched display connected,
        // lid reopened) must be able to build the panel.
        screenObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.screenParametersChanged() }
        }

        // Auto-close when "Open App" or "Add URL" is clicked. Screen-independent,
        // so register once here (not in setupPanel, which now runs on every reconfigure).
        let collapseBlock: (Notification) -> Void = { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.panel != nil, self.notchState.isExpanded else { return }
                self.hoverLogic = NotchHoverLogic()
                self.collapse()
            }
        }
        openAppObserver = NotificationCenter.default.addObserver(
            forName: MainWindowController.openMainWindow, object: nil, queue: .main,
            using: collapseBlock
        )
        addURLObserver = NotificationCenter.default.addObserver(
            forName: .openManualAddURL, object: nil, queue: .main,
            using: collapseBlock
        )

        reconfigure()
    }

    // didChangeScreenParameters fires often (even for HiDPI mode probes) - only rebuild when
    // the layout actually changed, otherwise we'd flicker the panel on every notification.
    private func screenParametersChanged() {
        let sig = currentSignature()
        guard sig != screenSignature else { return }
        reconfigure()
    }

    // Single source of truth for panel existence + placement. Tears down any current panel,
    // then rebuilds on the correct screen if one exists. Called on init and every real
    // screen-layout change - this is what keeps the notch from getting stranded off-screen.
    private func reconfigure() {
        teardownPanel()
        screenSignature = currentSignature()
        guard let screen = notchScreen() else { return }
        setupPanel(screen: screen)
    }

    private func teardownPanel() {
        hoverTimer?.invalidate()
        hoverTimer = nil
        hoverLogic = NotchHoverLogic()
        notchState.isExpanded = false
        if !Self.isUnderTest, let panel { SkyLightOperator.shared.undelegate(panel) }  // unpin
        // Ordered-front windows linger in NSApp.windows past release - close explicitly.
        panel?.close()
        panel = nil
    }

    private func setupPanel(screen: NSScreen) {
        pillW = Self.pillWidth(for: screen)
        screenRect = screen.frame
        // Match the physical notch height exactly so the closed notch overlays it (debug/non-notch: 32).
        notchHeight = screen.safeAreaInsets.top > 0 ? screen.safeAreaInsets.top : 32
        let wf = Self.expandedFrame(screen: screenRect)  // fixed window = open size, flush top-center

        let panel = NotchPanel(
            contentRect: NSRect(x: wf.minX, y: wf.minY, width: wf.width, height: wf.height),
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
        // Closed: the fixed window covers the top-center but must pass clicks through (only the
        // small notch is visible). Hover is detected by global mouse polling, not window events,
        // so ignoring mouse events while closed is safe. expand() flips this to interactive.
        panel.ignoresMouseEvents = true

        let rootView = NotchRootView(
            db: db, syncEngine: syncEngine,
            notchWidth: pillW, notchHeight: notchHeight,
            openWidth: Self.openWidth, openHeight: Self.openHeight,
            state: notchState
        )
        let hosting = NSHostingView(rootView: rootView)
        hosting.sizingOptions = []
        hosting.wantsLayer = true
        hosting.layer?.backgroundColor = .clear
        panel.contentView = hosting

        panel.orderFrontRegardless()
        if !Self.isUnderTest { SkyLightOperator.shared.delegate(panel) }  // above menu bar + everything
        self.panel = panel

        startHoverTimer()

        // ponytail: env-gated debug aid - force the panel open without depending on hover/mouse,
        // for deterministic screenshots. No effect in normal runs.
        if ProcessInfo.processInfo.environment["NOTCH_AUTO_OPEN"] == "1" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                guard let self, let pill = self.panel else { return }
                self.hoverLogic = NotchHoverLogic()
                _ = self.hoverLogic  // keep logic collapsed; drive expand directly
                self.expand()
                _ = pill
            }
        }
    }

    private func startHoverTimer() {
        // ponytail: 10Hz mouse poll - NSTrackingArea flapped on SwiftUI re-render; upgrade path: global mouseMoved monitor
        let timer = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { [weak self] in
                self?.pollHover()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        hoverTimer = timer
    }

    private func pollHover() {
        guard panel != nil else { return }
        // NSEvent.mouseLocation: global screen coords, bottom-left origin (same as NSWindow.frame)
        // Hit-test the LOGIC state's rect, not panel.frame - after a forced collapse the window
        // stays expanded-sized for 0.45s and a cursor inside it would immediately re-expand.
        let cursor = NSEvent.mouseLocation
        // Closed hit-target is just the physical-notch region; open is the whole panel canvas.
        let rect = hoverLogic.state == .expanded
            ? Self.expandedFrame(screen: screenRect)
            : Self.pillFrame(pillWidth: pillW, height: notchHeight, screen: screenRect)
        let cursorInside = rect.insetBy(dx: -2, dy: -2).contains(cursor)
        switch hoverLogic.update(now: Date(), cursorInside: cursorInside) {
        case .expand:   expand()
        case .collapse: collapse()
        case .none:     break
        }
    }

    // Fixed window - no frame changes. Just reveal content (isExpanded) and make the panel
    // interactive. The NotchShape spring-grows inside the window.
    private func expand() {
        guard let panel else { return }
        panel.ignoresMouseEvents = false
        notchState.isExpanded = true
    }

    private func collapse() {
        guard let panel else { return }
        notchState.isExpanded = false
        // Back to click-through so the transparent canvas doesn't block the menu bar / desktop.
        panel.ignoresMouseEvents = true
    }

    deinit {
        hoverTimer?.invalidate()
        if let openAppObserver { NotificationCenter.default.removeObserver(openAppObserver) }
        if let addURLObserver { NotificationCenter.default.removeObserver(addURLObserver) }
        if let screenObserver { NotificationCenter.default.removeObserver(screenObserver) }
        // Ordered-front windows stay in NSApp.windows past dealloc - without close()
        // a replaced/disabled controller leaves a zombie pill onscreen forever
        panel?.close()
    }
}
