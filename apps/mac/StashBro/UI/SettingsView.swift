// apps/mac/StashBro/UI/SettingsView.swift
import SwiftUI
import ServiceManagement
import KeyboardShortcuts

// Module-level for testability (M2 + M1: http/https required)
func validatedConfig(urlString: String, token: String) -> ServerConfig? {
    guard let url = URL(string: urlString),
          url.scheme == "https" || url.scheme == "http",
          !token.isEmpty else { return nil }
    return ServerConfig(baseURL: url, token: token)
}

struct SettingsView: View {
    @AppStorage("serverURL") private var serverURL = ""
    @AppStorage("serverToken") private var serverToken = ""
    @AppStorage("primarySurface") private var primarySurface = "menubar"
    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled
    @State private var launchAtLoginError: String? = nil

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
                        do {
                            if newValue { try SMAppService.mainApp.register() }
                            else { try SMAppService.mainApp.unregister() }
                            launchAtLoginError = nil
                        } catch {
                            launchAtLogin = SMAppService.mainApp.status == .enabled
                            launchAtLoginError = error.localizedDescription
                        }
                    }
                if let err = launchAtLoginError {
                    Text(err)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 400)
        .padding()
    }

    private func reconnect() {
        guard let config = validatedConfig(urlString: serverURL, token: serverToken) else { return }
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
