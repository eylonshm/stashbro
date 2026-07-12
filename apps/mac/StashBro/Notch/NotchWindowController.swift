// apps/mac/StashBro/Notch/NotchWindowController.swift
import AppKit
import SwiftUI

// Module-level for testability - same pattern as StashListView helpers.
// Task 8 wires this into the drop target; testable now against a synthetic pasteboard.
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

// Shared state: toggling isExpanded drives the SwiftUI spring — no NSAnimationContext needed.
// ponytail: ObservableObject bridges the SwiftUI world to the @MainActor controller.
@MainActor
final class NotchState: ObservableObject {
    @Published var isExpanded = false
}

// Unified root view: frame and clip shape animate with a SwiftUI spring when isExpanded flips.
// Spring is CADisplayLink-backed — every display refresh produces an intermediate frame.
// Non-opaque NSPanel transparent regions pass mouse events through (isOpaque=false behavior),
// so the full-size window never swallows clicks outside the visible clip.
struct NotchRootView: View {
    @ObservedObject var state: NotchState
    let db: AppDatabase
    let syncEngine: () -> SyncEngine?
    let onExpand: () -> Void
    let onCollapse: () -> Void

    // response/dampingFraction match BoringNotch for a notch-appropriate feel.
    private static let spring = Animation.spring(response: 0.42, dampingFraction: 0.8, blendDuration: 0)

    var body: some View {
        ZStack(alignment: .top) {
            if state.isExpanded {
                NotchPanelView(db: db, syncEngine: syncEngine, onCollapse: onCollapse)
                    // Fade in after the frame has mostly grown (0.28s into the 0.42s spring)
                    .transition(.opacity.animation(.easeIn(duration: 0.15).delay(0.28)))
            } else {
                NotchPillView(db: db, onExpand: onExpand, onCollapse: onCollapse)
                    // Fade in after the frame has mostly shrunk
                    .transition(.opacity.animation(.easeIn(duration: 0.1).delay(0.25)))
            }
        }
        .frame(width: state.isExpanded ? 360 : 192, height: state.isExpanded ? 420 : 30)
        .clipShape(UnevenRoundedRectangle(
            bottomLeadingRadius: state.isExpanded ? 18 : 16,
            bottomTrailingRadius: state.isExpanded ? 18 : 16
        ))
        // Anchor animated clip to the top of the full-size NSHostingView (window frame never changes)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .animation(Self.spring, value: state.isExpanded)
    }
}

@MainActor
final class NotchWindowController {
    private var panel: NSPanel?
    private let db: AppDatabase
    private let syncEngine: () -> SyncEngine?  // ponytail: closure for live engine after reconnect
    private let notchState = NotchState()

    // Static geometry - pure math, headless testable.
    // nonisolated: no actor state accessed; pure CGRect arithmetic.
    nonisolated static func pillFrame(for screenFrame: CGRect) -> CGRect {
        let w: CGFloat = 192, h: CGFloat = 30
        return CGRect(x: screenFrame.midX - w / 2, y: screenFrame.maxY - h, width: w, height: h)
    }

    nonisolated static func panelFrame(for screenFrame: CGRect) -> CGRect {
        let w: CGFloat = 360, h: CGFloat = 420
        return CGRect(x: screenFrame.midX - w / 2, y: screenFrame.maxY - h, width: w, height: h)
    }

    init(db: AppDatabase, syncEngine: @escaping () -> SyncEngine?, debugMode: Bool = false) {
        self.db = db
        self.syncEngine = syncEngine

        guard let screen = NSScreen.main, debugMode || screen.safeAreaInsets.top > 0 else {
            return // Non-notch Mac: notch surface disabled
        }
        setupPanel(screen: screen)

        if debugMode { scheduleDebugSequence() }
    }

    // ponytail: auto-triggers expand→collapse→expand for recording open animation; debug-notch only.
    // 12-14s rapid cycle stresses the hover race (0.5s gaps inside spring settle time).
    private func scheduleDebugSequence() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 3)    { [weak self] in self?.expandPanel() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 6)    { [weak self] in self?.collapsePanel() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 9)    { [weak self] in self?.expandPanel() }
        // Rapid open-close-open cycle: reproduces hover in/out race
        DispatchQueue.main.asyncAfter(deadline: .now() + 12.0) { [weak self] in self?.collapsePanel() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 12.5) { [weak self] in self?.expandPanel() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 13.0) { [weak self] in self?.collapsePanel() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 13.5) { [weak self] in self?.expandPanel() }
    }

    private func setupPanel(screen: NSScreen) {
        // Window always at panel frame — SwiftUI clip shape produces the pill appearance.
        // This matches BoringNotch: no window resize, pure SwiftUI spring animation.
        // isOpaque=false: transparent regions pass mouse events to windows below (AppKit default).
        let frame = Self.panelFrame(for: screen.frame)

        let panel = NSPanel(
            contentRect: NSRect(x: frame.origin.x, y: frame.origin.y, width: frame.width, height: frame.height),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        // CGWindowLevelForKey(.maximumWindow) is Int32 ~2147483630; +1 fits in Int, no overflow
        panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.maximumWindow)) + 1)
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.ignoresMouseEvents = false

        let rootView = NotchRootView(
            state: notchState,
            db: db, syncEngine: syncEngine,
            onExpand: { [weak self] in self?.expandPanel() },
            onCollapse: { [weak self] in self?.collapsePanel() }
        )
        let hosting = NSHostingView(rootView: rootView)
        // NSHostingView's layer can default to a system dark background; clear it so that
        // pixels outside the SwiftUI clipShape are truly transparent and pass mouse events through.
        hosting.wantsLayer = true
        hosting.layer?.backgroundColor = .clear
        panel.contentView = hosting
        panel.orderFrontRegardless()
        self.panel = panel
    }

    func expandPanel() {
        guard !notchState.isExpanded else { return }
        notchState.isExpanded = true
    }

    func collapsePanel() {
        guard notchState.isExpanded else { return }
        notchState.isExpanded = false
    }

    deinit {}
}
