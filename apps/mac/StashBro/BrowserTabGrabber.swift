// apps/mac/StashBro/BrowserTabGrabber.swift
import AppKit

enum BrowserTabGrabber {
    @MainActor
    static func grab() async -> URL? {
        for script in [safariScript, chromeScript, arcScript] {
            if let url = await runScript(script) { return url }
        }
        // Clipboard fallback - NSPasteboard.general read here (MainActor)
        return clipboardURL(from: NSPasteboard.general.string(forType: .string))
    }

    // ponytail: nonisolated pure parse - MainActor read happens in grab(), tests pass explicit strings
    static func clipboardURL(from string: String?) -> URL? {
        guard let str = string,
              let url = URL(string: str),
              url.scheme?.hasPrefix("http") == true else { return nil }
        return url
    }

    // Process is thread-safe; continuation resumed from osascript's termination handler
    private static func runScript(_ source: String) async -> URL? {
        await withCheckedContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-e", source]
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = Pipe() // suppress AppleEvents denial noise
            process.terminationHandler = { _ in
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let str = String(data: data, encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                continuation.resume(returning: str.isEmpty ? nil : URL(string: str))
            }
            do { try process.run() } catch { continuation.resume(returning: nil) }
        }
    }

    private static let safariScript = """
        if application "Safari" is running then
          tell application "Safari"
            if (count of windows) > 0 then
              return URL of front document
            end if
          end tell
        end if
    """

    private static let chromeScript = """
        if application "Google Chrome" is running then
          tell application "Google Chrome"
            if (count of windows) > 0 then
              return URL of active tab of front window
            end if
          end tell
        end if
    """

    // Arc uses Chrome's scripting dictionary
    private static let arcScript = """
        if application "Arc" is running then
          tell application "Arc"
            if (count of windows) > 0 then
              return URL of active tab of front window
            end if
          end tell
        end if
    """
}
