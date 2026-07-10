// apps/mac/StashBro/Notch/NotchDropDelegate.swift
import SwiftUI
import AppKit

struct NotchDropDelegate: DropDelegate {
    func performDrop(info: DropInfo) -> Bool {
        let providers = info.itemProviders(for: [.url])
        guard let provider = providers.first else { return false }
        _ = provider.loadObject(ofClass: URL.self) { url, _ in
            guard let url else { return }
            DispatchQueue.main.async {
                (NSApp.delegate as? AppDelegate)?.saveURL(url)
            }
        }
        return true
    }
}
