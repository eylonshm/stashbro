// apps/mac/StashBro/UI/OGMetadata.swift
import Foundation

struct OGMetadata {
    let title: String?
    let description: String?
    let image: String?
}

/// Pure parser - no side effects, easy to unit-test.
/// Handles double-quoted, single-quoted, and either attribute order.
/// Resolves relative og:image URLs against baseURL when provided.
func parseOGMetadata(html: String, baseURL: URL? = nil) -> OGMetadata {
    let title = ogMetaContent(html, property: "og:title") ?? htmlTitleTag(html)
    let description = ogMetaContent(html, property: "og:description")
        ?? metaNameContent(html, name: "description")
    var imageStr = ogMetaContent(html, property: "og:image")

    // Resolve relative image URLs (e.g. /og-image.png)
    if let img = imageStr, let base = baseURL,
       !(img.hasPrefix("http://") || img.hasPrefix("https://") || img.hasPrefix("//")) {
        imageStr = URL(string: img, relativeTo: base)?.absoluteString ?? img
    }

    return OGMetadata(title: title, description: description, image: imageStr)
}

// MARK: - HTML parsing helpers

func ogMetaContent(_ html: String, property: String) -> String? {
    let esc = NSRegularExpression.escapedPattern(for: property)
    let pats = [
        #"<meta[^>]+property=[\"']\#(esc)[\"'][^>]+content=[\"']([^\"'<>]+)[\"']"#,
        #"<meta[^>]+content=[\"']([^\"'<>]+)[\"'][^>]+property=[\"']\#(esc)[\"']"#,
    ]
    return firstOGCapture(html, patterns: pats)
}

func metaNameContent(_ html: String, name: String) -> String? {
    let esc = NSRegularExpression.escapedPattern(for: name)
    let pats = [
        #"<meta[^>]+name=[\"']\#(esc)[\"'][^>]+content=[\"']([^\"'<>]+)[\"']"#,
        #"<meta[^>]+content=[\"']([^\"'<>]+)[\"'][^>]+name=[\"']\#(esc)[\"']"#,
    ]
    return firstOGCapture(html, patterns: pats)
}

func htmlTitleTag(_ html: String) -> String? {
    firstOGCapture(html, patterns: [#"<title[^>]*>([^<]+)</title>"#])
}

func firstOGCapture(_ html: String, patterns: [String]) -> String? {
    let nsRange = NSRange(html.startIndex..., in: html)
    for pat in patterns {
        guard let re = try? NSRegularExpression(pattern: pat, options: .caseInsensitive),
              let m = re.firstMatch(in: html, range: nsRange),
              let r = Range(m.range(at: 1), in: html)
        else { continue }
        return String(html[r]).htmlEntityDecoded
    }
    return nil
}

extension String {
    var htmlEntityDecoded: String {
        self
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&apos;", with: "'")
            .replacingOccurrences(of: "&#x27;", with: "'")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
