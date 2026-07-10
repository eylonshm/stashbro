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

@MainActor
final class NotchWindowController {
    private var panel: NSPanel?
    private let db: AppDatabase
    private let syncEngine: () -> SyncEngine?  // ponytail: closure for live engine after reconnect
    private var outsideClickMonitor: Any?

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

    init(db: AppDatabase, syncEngine: @escaping () -> SyncEngine?) {
        self.db = db
        self.syncEngine = syncEngine

        guard let screen = NSScreen.main, screen.safeAreaInsets.top > 0 else {
            return // Non-notch Mac: notch surface disabled
        }
        setupPanel(screen: screen)
    }

    private func setupPanel(screen: NSScreen) {
        let frame = Self.pillFrame(for: screen.frame)

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

        let contentView = NotchPillView(
            db: db,
            onExpand: { [weak self] in self?.expandPanel() },
            onCollapse: { [weak self] in self?.collapsePanel() }
        )
        panel.contentView = NSHostingView(rootView: contentView)
        panel.orderFrontRegardless()
        self.panel = panel
    }

    func expandPanel() {
        guard let panel, let screen = NSScreen.main else { return }
        let frame = Self.panelFrame(for: screen.frame)

        // Collapse on click outside the panel; guard against double-expand leaking a monitor
        if let old = outsideClickMonitor { NSEvent.removeMonitor(old) }
        outsideClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            guard let self else { return }
            let mouseLoc = NSEvent.mouseLocation
            if !(self.panel?.frame.contains(mouseLoc) ?? false) {
                Task { @MainActor in self.collapsePanel() }
            }
        }

        // Swap content only after animation completes to avoid clipped layout during resize
        let expandedView = NotchPanelView(
            db: db, syncEngine: syncEngine,
            onCollapse: { [weak self] in self?.collapsePanel() }
        )
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.2
            panel.animator().setFrame(
                NSRect(x: frame.origin.x, y: frame.origin.y, width: frame.width, height: frame.height),
                display: true
            )
        }, completionHandler: {
            panel.contentView = NSHostingView(rootView: expandedView)
        })
    }

    func collapsePanel() {
        if let monitor = outsideClickMonitor {
            NSEvent.removeMonitor(monitor)
            outsideClickMonitor = nil
        }

        guard let panel, let screen = NSScreen.main else { return }
        let frame = Self.pillFrame(for: screen.frame)

        // Swap content only after animation completes to avoid clipped layout during resize
        let pillView = NotchPillView(
            db: db,
            onExpand: { [weak self] in self?.expandPanel() },
            onCollapse: { [weak self] in self?.collapsePanel() } // ponytail: Task 8 close-button hook
        )
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.15
            panel.animator().setFrame(
                NSRect(x: frame.origin.x, y: frame.origin.y, width: frame.width, height: frame.height),
                display: true
            )
        }, completionHandler: {
            panel.contentView = NSHostingView(rootView: pillView)
        })
    }

    deinit {
        if let monitor = outsideClickMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }
}
