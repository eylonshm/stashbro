// apps/mac/StashBro/UI/SettingsView.swift
import SwiftUI
import ServiceManagement
import KeyboardShortcuts

struct SettingsView: View {
    @AppStorage("serverURL") private var serverURL = ""
    @AppStorage("serverToken") private var serverToken = ""
    @AppStorage("primarySurface") private var primarySurface = "menubar"
    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled

    var body: some View {
        Form {
            Section("Server") {
                TextField("Server URL", text: $serverURL)
                    .textContentType(.URL)
                SecureField("Bearer Token", text: $serverToken)
                Button("Save & Reconnect") { reconnect() }
            }

            Section("Appearance") {
                Picker("Primary Surface", selection: $primarySurface) {
                    Text("Menubar Popover").tag("menubar")
                    Text("Notch (requires notch Mac)").tag("notch")
                }
            }

            Section("Hotkey") {
                KeyboardShortcuts.Recorder("Save current tab", name: .saveCurrentTab)
            }

            Section("System") {
                Toggle("Launch at Login", isOn: $launchAtLogin)
                    .onChange(of: launchAtLogin) { _, newValue in
                        if newValue { try? SMAppService.mainApp.register() }
                        else { try? SMAppService.mainApp.unregister() }
                    }
            }
        }
        .formStyle(.grouped)
        .frame(width: 400)
        .padding()
    }

    private func reconnect() {
        guard let url = URL(string: serverURL), !serverToken.isEmpty else { return }
        let config = ServerConfig(baseURL: url, token: serverToken)
        config.save()
        if let delegate = NSApp.delegate as? AppDelegate {
            let store = GRDBLocalStore(db: delegate.db)
            let client = StashBroAPIClient(config: config)
            let engine = SyncEngine(store: store, client: client)
            delegate.syncEngine = engine
            Task { await engine.sync() }
        }
    }
}
