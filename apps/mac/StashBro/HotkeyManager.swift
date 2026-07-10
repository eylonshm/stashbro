// apps/mac/StashBro/HotkeyManager.swift
import KeyboardShortcuts
import AppKit

extension KeyboardShortcuts.Name {
    static let saveCurrentTab = Self("saveCurrentTab", default: .init(.s, modifiers: [.command, .shift]))
}

enum HotkeyManager {
    static func register(handler: @escaping (URL) -> Void) {
        KeyboardShortcuts.onKeyDown(for: .saveCurrentTab) {
            Task { @MainActor in
                guard let url = await BrowserTabGrabber.grab() else { return }
                handler(url)
            }
        }
    }
}
