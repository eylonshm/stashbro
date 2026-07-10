// apps/mac/StashBro/BrowserTabGrabber.swift
import AppKit

enum BrowserTabGrabber {
    static func grab() async -> URL? {
        // Try browsers in order: Safari, Google Chrome, Arc
        for script in [safariScript, chromeScript, arcScript] {
            if let url = await runAppleScript(script) { return url }
        }
        // Clipboard fallback
        return clipboardURL()
    }

    // ponytail: extracted for unit testing without side effects
    static func clipboardURL(from string: String? = NSPasteboard.general.string(forType: .string)) -> URL? {
        guard let str = string,
              let url = URL(string: str),
              url.scheme?.hasPrefix("http") == true else { return nil }
        return url
    }

    private static func runAppleScript(_ source: String) async -> URL? {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                var error: NSDictionary?
                let script = NSAppleScript(source: source)
                let result = script?.executeAndReturnError(&error)
                if error != nil { continuation.resume(returning: nil); return }
                guard let urlStr = result?.stringValue, let url = URL(string: urlStr) else {
                    continuation.resume(returning: nil); return
                }
                continuation.resume(returning: url)
            }
        }
    }

    private static let safariScript = """
        tell application "Safari"
          if (count of windows) > 0 then
            return URL of current tab of front window
          end if
        end tell
    """

    private static let chromeScript = """
        tell application "Google Chrome"
          if (count of windows) > 0 then
            return URL of active tab of front window
          end if
        end tell
    """

    // Arc uses Chrome's scripting dictionary
    private static let arcScript = """
        tell application "Arc"
          if (count of windows) > 0 then
            return URL of active tab of front window
          end if
        end tell
    """
}
