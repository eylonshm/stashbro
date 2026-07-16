// apps/mac/StashBro/HotkeyManager.swift
import KeyboardShortcuts
import AppKit

extension KeyboardShortcuts.Name {
    static let saveCurrentTab = Self("saveCurrentTab", default: .init(.s, modifiers: [.command, .shift]))
    static let addURLManually = Self("addURLManually")
}

enum HotkeyManager {
    static func register(handler: @escaping (BrowserTab) -> Void) {
        KeyboardShortcuts.onKeyDown(for: .saveCurrentTab) {
            Task { @MainActor in
                guard let tab = await BrowserTabGrabber.grab() else { return }
                handler(tab)
            }
        }
    }

    static func registerManualAdd(handler: @escaping () -> Void) {
        KeyboardShortcuts.onKeyDown(for: .addURLManually) {
            Task { @MainActor in handler() }
        }
    }
}
