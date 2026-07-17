// apps/mac/StashBro/UI/QuickSaveView.swift
import SwiftUI

struct QuickSaveView: View {
    let initialURL: URL?
    let tabTitle: String?
    let onSave: (_ url: URL, _ title: String, _ priority: ItemPriority, _ tags: [String], _ ogDescription: String?, _ ogThumbnail: String?) -> Void
    let onCancel: () -> Void

    @State private var urlText: String
    @State private var resolvedURL: URL?
    @State private var urlError: String? = nil
    @State private var editTitle: String
    @State private var priority: ItemPriority = .medium
    @State private var tagText = ""
    @State private var ogTitle: String? = nil
    @State private var ogDescription: String? = nil
    @State private var ogImageURL: String? = nil
    @State private var ogLoading: Bool
    @State private var shimmerOn = false
    @State private var debounceTask: Task<Void, Never>?
    @State private var lastLoadedURL: String? = nil  // raw string of URL we already fetched

    private let defaultTitle: String
    private let isManualMode: Bool

    init(url: URL?, tabTitle: String?,
         onSave: @escaping (_ url: URL, _ title: String, _ priority: ItemPriority, _ tags: [String], _ ogDescription: String?, _ ogThumbnail: String?) -> Void,
         onCancel: @escaping () -> Void) {
        self.initialURL = url
        self.tabTitle = tabTitle
        self.onSave = onSave
        self.onCancel = onCancel
        self.isManualMode = url == nil
        let initial = tabTitle ?? url?.absoluteString ?? ""
        self._editTitle = State(initialValue: initial)
        self.defaultTitle = initial
        self._urlText = State(initialValue: url?.absoluteString ?? "")
        self._resolvedURL = State(initialValue: url)
        self._ogLoading = State(initialValue: url != nil)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if isManualMode {
                urlInputSection
            }

            previewCard
                .padding(.horizontal, 14)
                .padding(.top, 14)
                .padding(.bottom, 10)
                .animation(.easeOut(duration: 0.25), value: ogLoading)

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
                    .disabled(resolvedURL == nil)
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 14)
            .padding(.top, 4)
        }
        .frame(width: 380)
        .task {
            if let _ = initialURL { await loadOG() }
        }
    }

    // MARK: - URL input (manual mode)

    @ViewBuilder
    private var urlInputSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("Paste or type a URL...", text: $urlText, onCommit: { submitURL() })
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 12))
                .onChange(of: urlText) { _ in scheduleAutoLoad() }
            if let err = urlError {
                Text(err)
                    .font(.system(size: 10))
                    .foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 14)
    }

    // Return pressed - explicit submit, may surface a validation error.
    private func submitURL() {
        let trimmed = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              url.scheme == "http" || url.scheme == "https" else {
            urlError = "Enter a valid http:// or https:// URL"
            resolvedURL = nil
            return
        }
        debounceTask?.cancel()
        guard trimmed != lastLoadedURL else { return }  // already fetched this URL
        applyURL(url, raw: trimmed)
    }

    // Debounced auto-load while typing/pasting. Only acts on a valid URL - stays
    // silent (no red error) on partial input, and never re-fetches the same URL.
    private func scheduleAutoLoad() {
        let trimmed = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        debounceTask?.cancel()
        guard let url = URL(string: trimmed),
              url.scheme == "http" || url.scheme == "https",
              trimmed != lastLoadedURL else { return }
        debounceTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            applyURL(url, raw: trimmed)
        }
    }

    @MainActor
    private func applyURL(_ url: URL, raw: String) {
        urlError = nil
        resolvedURL = url
        lastLoadedURL = raw
        ogLoading = true
        if editTitle.isEmpty || editTitle == defaultTitle {
            editTitle = raw
        }
        Task { await loadOG() }
    }

    // MARK: - Preview card

    @ViewBuilder
    private var previewCard: some View {
        HStack(alignment: .top, spacing: 10) {
            thumbnailView
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 3) {
                if ogLoading {
                    HStack(spacing: 6) {
                        ProgressView().controlSize(.small)
                        Text("Fetching preview…")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                    .transition(.opacity)
                    skeletonBar(height: 10)
                        .transition(.opacity)
                } else if resolvedURL != nil {
                    Text(previewTitle)
                        .font(.system(size: 13, weight: .semibold))
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .transition(.opacity)

                    if let desc = ogDescription, !desc.isEmpty {
                        Text(desc)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }

                    Text(resolvedURL?.host ?? "")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                } else {
                    Text("Enter a URL above")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                }
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
        if ogLoading {
            RoundedRectangle(cornerRadius: 0)
                .fill(Color.secondary.opacity(shimmerOn ? 0.15 : 0.07))
                .transition(.opacity)
                .onAppear {
                    withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                        shimmerOn = true
                    }
                }
        } else if let imgStr = ogImageURL, let imgURL = URL(string: imgStr) {
            AsyncImage(url: imgURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                default:
                    typeGradient
                }
            }
            .transition(.opacity)
        } else {
            typeGradient
                .transition(.opacity)
        }
    }

    private func skeletonBar(height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(Color.secondary.opacity(shimmerOn ? 0.15 : 0.07))
            .frame(height: height)
    }

    private var typeGradient: some View {
        let urlStr = resolvedURL?.absoluteString ?? ""
        let type = detectItemType(url: urlStr)
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
        ogTitle ?? tabTitle ?? resolvedURL?.absoluteString ?? ""
    }

    // MARK: - Actions

    private func doSave() {
        guard let url = resolvedURL else { return }
        let tags = tagText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        onSave(url, editTitle, priority, tags, ogDescription, ogImageURL)
    }

    // MARK: - OG fetch

    @MainActor
    private func loadOG() async {
        guard let url = resolvedURL ?? initialURL else { return }
        let target = url
        // Only this load owns the loading flag/results while it's still the current URL;
        // a newer load supersedes it (guards against fast typing / paste-then-edit races).
        defer { if resolvedURL == target { ogLoading = false } }
        var req = URLRequest(url: url, timeoutInterval: 5)
        req.setValue(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            forHTTPHeaderField: "User-Agent"
        )
        guard let (data, _) = try? await URLSession.shared.data(for: req) else { return }
        let html = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) ?? ""
        guard !html.isEmpty else { return }
        guard resolvedURL == target else { return }  // superseded by a newer load

        let meta = parseOGMetadata(html: html, baseURL: url)

        if editTitle == defaultTitle || editTitle == url.absoluteString || editTitle.isEmpty,
           let t = meta.title, !t.isEmpty {
            editTitle = t
        }
        ogTitle = meta.title
        ogDescription = meta.description
        ogImageURL = meta.image
    }
}
