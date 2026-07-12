// apps/mac/StashBro/UI/QuickSaveView.swift
import SwiftUI

struct QuickSaveView: View {
    let url: URL
    let tabTitle: String?
    let onSave: (_ title: String, _ priority: ItemPriority, _ tags: [String], _ ogDescription: String?, _ ogThumbnail: String?) -> Void
    let onCancel: () -> Void

    @State private var editTitle: String
    @State private var priority: ItemPriority = .medium
    @State private var tagText = ""
    @State private var ogTitle: String? = nil
    @State private var ogDescription: String? = nil
    @State private var ogImageURL: String? = nil
    @State private var ogLoading = true

    private let defaultTitle: String

    init(url: URL, tabTitle: String?,
         onSave: @escaping (_ title: String, _ priority: ItemPriority, _ tags: [String], _ ogDescription: String?, _ ogThumbnail: String?) -> Void,
         onCancel: @escaping () -> Void) {
        self.url = url
        self.tabTitle = tabTitle
        self.onSave = onSave
        self.onCancel = onCancel
        let initial = tabTitle ?? url.absoluteString
        self._editTitle = State(initialValue: initial)
        self.defaultTitle = initial
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            previewCard
                .padding(.horizontal, 14)
                .padding(.top, 14)
                .padding(.bottom, 10)

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                TextField("Title", text: $editTitle)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 12))

                HStack(spacing: 8) {
                    Text("Priority")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                    Picker("", selection: $priority) {
                        Text("Low").tag(ItemPriority.low)
                        Text("Med").tag(ItemPriority.medium)
                        Text("High").tag(ItemPriority.high)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }

                TextField("Tags, comma separated", text: $tagText)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 12))
            }
            .padding(.horizontal, 14)
            .padding(.top, 10)
            .padding(.bottom, 6)

            HStack {
                Button("Cancel") { onCancel() }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Save") { doSave() }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 14)
            .padding(.top, 4)
        }
        .frame(width: 380)
        .task { await loadOG() }
    }

    // MARK: - Preview card

    @ViewBuilder
    private var previewCard: some View {
        HStack(alignment: .top, spacing: 10) {
            thumbnailView
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 3) {
                Text(previewTitle)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                if let desc = ogDescription, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Text(url.host ?? url.absoluteString)
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(Color(NSColor.windowBackgroundColor).opacity(0.6))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color(NSColor.separatorColor), lineWidth: 0.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private var thumbnailView: some View {
        if let imgStr = ogImageURL, let imgURL = URL(string: imgStr) {
            AsyncImage(url: imgURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                default:
                    typeGradient
                }
            }
        } else {
            typeGradient
        }
    }

    private var typeGradient: some View {
        let type = detectItemType(url: url.absoluteString)
        let colors: [Color] = {
            switch type {
            case .video:   return [Color(red: 1, green: 0.125, blue: 0.125), Color(red: 0.8, green: 0, blue: 0)]
            case .post:    return [Color(red: 0.11, green: 0.11, blue: 0.11), Color(red: 0.04, green: 0.04, blue: 0.04)]
            case .article: return [Color(red: 0.23, green: 0.23, blue: 0.36), Color(red: 0.10, green: 0.10, blue: 0.16)]
            case .other:   return [Color(red: 0.35, green: 0.23, blue: 0.55), Color(red: 0.24, green: 0.10, blue: 0.43)]
            }
        }()
        return Rectangle().fill(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing))
    }

    private var previewTitle: String {
        ogTitle ?? tabTitle ?? url.absoluteString
    }

    // MARK: - Actions

    private func doSave() {
        let tags = tagText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        onSave(editTitle, priority, tags, ogDescription, ogImageURL)
    }

    // MARK: - OG fetch

    private func loadOG() async {
        defer { ogLoading = false }
        var req = URLRequest(url: url, timeoutInterval: 3)
        req.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", forHTTPHeaderField: "User-Agent")
        guard let (data, _) = try? await URLSession.shared.data(for: req) else { return }
        let html = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) ?? ""
        guard !html.isEmpty else { return }

        let fetchedTitle = ogMetaContent(html, property: "og:title") ?? htmlTitleTag(html)
        let fetchedDesc  = ogMetaContent(html, property: "og:description") ?? metaNameContent(html, name: "description")
        let fetchedImg   = ogMetaContent(html, property: "og:image")

        // Only auto-fill title if user hasn't modified from the default
        if editTitle == defaultTitle, let t = fetchedTitle, !t.isEmpty {
            editTitle = t
        }
        ogTitle = fetchedTitle
        ogDescription = fetchedDesc
        ogImageURL = fetchedImg
    }
}

// MARK: - HTML parsing helpers (file-private)

/// Match <meta property="og:X" content="..."> in either attribute order.
private func ogMetaContent(_ html: String, property: String) -> String? {
    let esc = NSRegularExpression.escapedPattern(for: property)
    let pats = [
        #"<meta[^>]+property=[\"']\#(esc)[\"'][^>]+content=[\"']([^\"'<>]+)[\"']"#,
        #"<meta[^>]+content=[\"']([^\"'<>]+)[\"'][^>]+property=[\"']\#(esc)[\"']"#,
    ]
    return firstCapture(html, patterns: pats)
}

private func metaNameContent(_ html: String, name: String) -> String? {
    let esc = NSRegularExpression.escapedPattern(for: name)
    let pats = [
        #"<meta[^>]+name=[\"']\#(esc)[\"'][^>]+content=[\"']([^\"'<>]+)[\"']"#,
        #"<meta[^>]+content=[\"']([^\"'<>]+)[\"'][^>]+name=[\"']\#(esc)[\"']"#,
    ]
    return firstCapture(html, patterns: pats)
}

private func htmlTitleTag(_ html: String) -> String? {
    firstCapture(html, patterns: [#"<title[^>]*>([^<]+)</title>"#])
}

private func firstCapture(_ html: String, patterns: [String]) -> String? {
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

private extension String {
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
