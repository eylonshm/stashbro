// apps/mac/StashBro/UI/SettingsView.swift
import SwiftUI
import ServiceManagement
import KeyboardShortcuts
import Security

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
    @AppStorage("showInNotch") private var showInNotch = true
    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled
    @State private var launchAtLoginError: String? = nil
    @State private var hostedEmail = ""
    @State private var magicCode = ""
    @State private var codeStep = false
    @State private var loginStatus = ""
    @State private var connectionStatus = ""

    // ponytail: computed at render time; static per session but correct
    private var hasNotch: Bool { (NSScreen.main?.safeAreaInsets.top ?? 0) > 0 }

    var body: some View {
        Form {
            Section("Server") {
                TextField("Server URL", text: $serverURL)
                    .textContentType(.URL)
                SecureField("Bearer Token", text: $serverToken)
                Button("Save & Reconnect") { reconnect() }
                if !connectionStatus.isEmpty {
                    Text(connectionStatus)
                        .font(.caption)
                        .foregroundStyle(connectionStatus.contains("Connected") ? .green : .red)
                }
            }

            Section("Sign In (Hosted Mode)") {
                TextField("Email", text: $hostedEmail)
                    .textContentType(.emailAddress)
                if !codeStep {
                    Button("Send Code") { sendCode() }
                } else {
                    TextField("6-digit code", text: $magicCode)
                    Button("Verify Code") { verifyCode() }
                }
                if !loginStatus.isEmpty {
                    Text(loginStatus).foregroundStyle(.green).font(.caption)
                }
            }

            Section("Appearance") {
                Toggle("Show in notch", isOn: $showInNotch)
                    .disabled(!hasNotch)
                if !hasNotch {
                    Text("No notch detected")
                        .font(.caption)
                        .foregroundStyle(.secondary)
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

    private func sendCode() {
        guard !hostedEmail.isEmpty, let url = URL(string: serverURL.isEmpty ? "" : "\(serverURL.trimmingCharacters(in: .init(charactersIn: "/")))/auth/request") else {
            loginStatus = "Enter server URL and email first"; return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["email": hostedEmail])
        URLSession.shared.dataTask(with: req) { _, res, _ in
            DispatchQueue.main.async {
                if (res as? HTTPURLResponse)?.statusCode == 200 {
                    codeStep = true; loginStatus = "Code sent! Check your email."
                } else { loginStatus = "Failed to send code" }
            }
        }.resume()
    }

    private func verifyCode() {
        guard !magicCode.isEmpty, let url = URL(string: "\(serverURL.trimmingCharacters(in: .init(charactersIn: "/")))/auth/verify") else {
            loginStatus = "Enter the code first"; return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["email": hostedEmail, "code": magicCode])
        URLSession.shared.dataTask(with: req) { data, res, _ in
            guard (res as? HTTPURLResponse)?.statusCode == 200, let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                  let accessToken = json["accessToken"], let refreshToken = json["refreshToken"]
            else { DispatchQueue.main.async { loginStatus = "Invalid code" }; return }
            DispatchQueue.main.async {
                serverToken = accessToken
                SettingsView.keychainSet("stashbro.refreshToken", value: refreshToken)
                loginStatus = "Signed in!"
                codeStep = false
            }
        }.resume()
    }

    private static func keychainSet(_ key: String, value: String) {
        let data = Data(value.utf8)
        let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrAccount: key, kSecValueData: data]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    private func reconnect() {
        guard let config = validatedConfig(urlString: serverURL, token: serverToken) else {
            connectionStatus = "Invalid URL or empty token"
            return
        }
        connectionStatus = "Connecting..."
        config.save()
        let healthURL = config.baseURL.appendingPathComponent("health")
        URLSession.shared.dataTask(with: healthURL) { data, res, err in
            DispatchQueue.main.async {
                guard err == nil, (res as? HTTPURLResponse)?.statusCode == 200 else {
                    connectionStatus = "Failed: \(err?.localizedDescription ?? "server unreachable")"
                    return
                }
                if let delegate = NSApp.delegate as? AppDelegate {
                    let store = GRDBLocalStore(db: delegate.db)
                    let client = StashBroAPIClient(config: config)
                    let engine = SyncEngine(store: store, client: client)
                    delegate.syncEngine = engine
                    Task { await engine.sync() }
                }
                connectionStatus = "Connected!"
            }
        }.resume()
    }
}
