// apps/mac/StashBro/StashBroApp.swift
import SwiftUI

@main
struct StashBroApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        Settings {
            SettingsView()
        }
    }
}
