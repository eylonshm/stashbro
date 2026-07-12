// apps/mac/StashBro/BrowserTabGrabber.swift
import AppKit

struct BrowserTab {
    let url: URL
    let title: String?
}

enum BrowserTabGrabber {
    @MainActor
    static func grab() async -> BrowserTab? {
        // Try the frontmost app first so hotkey always queries the active browser
        let frontBundleID = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
        if let bid = frontBundleID, let s = script(for: bid), let tab = await runScript(s) {
            return tab
        }
        // Fallback: try all known browsers in order (covers non-browser frontmost app)
        for s in [safariScript, chromeScript, arcScript] {
            if let tab = await runScript(s) { return tab }
        }
        // Clipboard fallback - NSPasteboard.general read here (MainActor)
        if let url = clipboardURL(from: NSPasteboard.general.string(forType: .string)) {
            return BrowserTab(url: url, title: nil)
        }
        return nil
    }

    // ponytail: pure mapping - lets tests verify bundle-ID routing without launching osascript
    static func script(for bundleID: String) -> String? {
        switch bundleID {
        case "com.apple.Safari":
            return safariScript
        case "com.google.Chrome", "com.google.Chrome.canary",
             "com.brave.Browser", "com.microsoft.edgemac":
            return chromeScript
        case "company.thebrowser.Browser":
            return arcScript
        default:
            return nil
        }
    }

    // ponytail: nonisolated pure parse - MainActor read happens in grab(), tests pass explicit strings
    static func clipboardURL(from string: String?) -> URL? {
        guard let str = string,
              let url = URL(string: str),
              url.scheme?.hasPrefix("http") == true else { return nil }
        return url
    }

    // Process is thread-safe; continuation resumed from osascript's termination handler
    // Scripts output "URL|||TITLE"; title is optional (missing = no separator)
    private static func runScript(_ source: String) async -> BrowserTab? {
        await withCheckedContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-e", source]
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = Pipe() // suppress AppleEvents denial noise
            process.terminationHandler = { _ in
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let raw = String(data: data, encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !raw.isEmpty else { continuation.resume(returning: nil); return }
                let parts = raw.components(separatedBy: "|||")
                guard let url = URL(string: parts[0]) else { continuation.resume(returning: nil); return }
                let title = parts.count > 1 ? parts[1].trimmingCharacters(in: .whitespacesAndNewlines) : nil
                continuation.resume(returning: BrowserTab(url: url, title: title?.isEmpty == false ? title : nil))
            }
            do { try process.run() } catch { continuation.resume(returning: nil) }
        }
    }

    private static let safariScript = """
        if application "Safari" is running then
          tell application "Safari"
            if (count of windows) > 0 then
              return (URL of front document) & "|||" & (name of front document)
            end if
          end tell
        end if
    """

    private static let chromeScript = """
        if application "Google Chrome" is running then
          tell application "Google Chrome"
            if (count of windows) > 0 then
              return (URL of active tab of front window) & "|||" & (title of active tab of front window)
            end if
          end tell
        end if
    """

    // Arc uses Chrome's scripting dictionary
    private static let arcScript = """
        if application "Arc" is running then
          tell application "Arc"
            if (count of windows) > 0 then
              return (URL of active tab of front window) & "|||" & (title of active tab of front window)
            end if
          end tell
        end if
    """
}
