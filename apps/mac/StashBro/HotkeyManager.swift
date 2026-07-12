// apps/mac/StashBro/HotkeyManager.swift
import KeyboardShortcuts
import AppKit

extension KeyboardShortcuts.Name {
    static let saveCurrentTab = Self("saveCurrentTab", default: .init(.s, modifiers: [.command, .shift]))
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
}
