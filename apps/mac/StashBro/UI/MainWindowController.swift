// apps/mac/StashBro/UI/MainWindowController.swift
import AppKit
import SwiftUI

@MainActor
final class MainWindowController: NSObject, NSWindowDelegate {
    // ponytail: static here so NotchPanelView + MenubarController can post without importing the whole controller
    static let openMainWindow = Notification.Name("stashbro.openMainWindow")

    private var window: NSWindow?
    private let db: AppDatabase
    private let syncEngine: () -> SyncEngine?

    init(db: AppDatabase, syncEngine: @escaping () -> SyncEngine?) {
        self.db = db
        self.syncEngine = syncEngine
    }

    func show() {
        if let w = window {
            // Already created - just bring it front
            NSApp.setActivationPolicy(.regular)
            NSApp.activate(ignoringOtherApps: true)
            w.makeKeyAndOrderFront(nil)
            return
        }
        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 860, height: 560),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        w.title = "StashBro"
        w.minSize = NSSize(width: 640, height: 420)
        w.isReleasedWhenClosed = false  // ponytail: keeps controller alive through close/reopen cycles
        w.setFrameAutosaveName("StashBroMain")
        w.contentView = NSHostingView(rootView: MainWindowView(db: db, syncEngine: syncEngine))
        w.delegate = self
        w.center()
        window = w
        NSApp.setActivationPolicy(.regular)  // LSUIElement app: give dock icon + cmd-tab while window open
        NSApp.activate(ignoringOtherApps: true)
        w.makeKeyAndOrderFront(nil)
    }

    func windowWillClose(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)  // back to agent mode when window closes
    }
}
