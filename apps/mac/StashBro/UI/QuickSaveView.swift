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
    @State private var shimmerOn = false  // ponytail: single bool drives all skeleton opacity

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
                if ogLoading {
                    skeletonBar(height: 13)
                    HStack(spacing: 0) {
                        skeletonBar(height: 10)
                        Spacer(minLength: 0).frame(width: 36)
                    }
                    .transition(.opacity)
                } else {
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

                    Text(url.host ?? url.absoluteString)
                        .font(.system(size: 10))
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

    // ponytail: @MainActor ensures all @State assignments run on main thread - fixes silent image drop
    @MainActor
    private func loadOG() async {
        defer { ogLoading = false }
        var req = URLRequest(url: url, timeoutInterval: 5)
        req.setValue(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            forHTTPHeaderField: "User-Agent"
        )
        guard let (data, _) = try? await URLSession.shared.data(for: req) else { return }
        let html = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) ?? ""
        guard !html.isEmpty else { return }

        let meta = parseOGMetadata(html: html, baseURL: url)

        if editTitle == defaultTitle, let t = meta.title, !t.isEmpty {
            editTitle = t
        }
        ogTitle = meta.title
        ogDescription = meta.description
        ogImageURL = meta.image
    }
}
