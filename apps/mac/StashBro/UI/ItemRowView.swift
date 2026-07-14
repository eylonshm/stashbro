// apps/mac/StashBro/UI/ItemRowView.swift
import SwiftUI

// ponytail: plain integer arithmetic - no Calendar/locale traps; exported for test
func relativeAge(_ date: Date, now: Date = Date()) -> String {
    let secs = Int(now.timeIntervalSince(date))
    if secs < 60   { return "now" }
    if secs < 3600 { return "\(secs / 60)m" }
    if secs < 86400 { return "\(secs / 3600)h" }
    let days = secs / 86400
    if days < 14 { return "\(days)d" }
    return "\(days / 7)w"
}

struct ItemRowView: View {
    let item: StashItem
    let tags: [Tag]
    // ponytail: optional closures - buttons only render when closure is non-nil AND hovering
    var onMarkRead: (() -> Void)? = nil
    var onArchive: (() -> Void)? = nil

    @State private var isHovering = false
    @Environment(\.colorScheme) private var colorScheme

    private var priorityColor: Color {
        switch item.priority {
        case .high:
            // ponytail: two values per design spec - light #D95A28, dark #E8693A
            return colorScheme == .dark
                ? Color(red: 0.906, green: 0.412, blue: 0.227)
                : Color(red: 0.851, green: 0.353, blue: 0.157)
        case .medium:
            // amber - light #D9922A, dark #E8A13A
            return colorScheme == .dark
                ? Color(red: 0.910, green: 0.631, blue: 0.227)
                : Color(red: 0.851, green: 0.573, blue: 0.165)
        case .low: return Color(red: 0.620, green: 0.631, blue: 0.706)
        }
    }

    private var displayTitle: String {
        let t = item.title
        if t.isEmpty || t == item.url { return item.domain }
        return t
    }

    var body: some View {
        HStack(spacing: 9) {
            // Priority bar
            RoundedRectangle(cornerRadius: 2)
                .fill(priorityColor)
                .frame(width: 3)
                .padding(.vertical, 9)
            // Thumbnail
            if let urlStr = item.thumbnailUrl, let url = URL(string: urlStr) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                    default:
                        RoundedRectangle(cornerRadius: 7).fill(thumbnailGradient)
                    }
                }
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 7))
            } else {
                RoundedRectangle(cornerRadius: 7)
                    .fill(thumbnailGradient)
                    .frame(width: 48, height: 48)
            }
            // Info
            VStack(alignment: .leading, spacing: 2) {
                Text(displayTitle)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(2)
                    // read items slightly dimmed; archived stays as-is
                    .opacity(item.status == .read ? 0.65 : 1)
                if let desc = item.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                HStack(spacing: 5) {
                    Text(item.domain)
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                    TypeBadgeView(type: item.type)
                    ForEach(tags, id: \.id) { tag in
                        TagChipView(name: tag.name)
                    }
                    Text("· \(relativeAge(item.createdAt))")
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
        .onHover { isHovering = $0 }
        // ponytail: overlay keeps buttons OUT of HStack flow - text width (and row height) never changes on hover.
        // Always mounted, opacity-driven: `if isHovering` structural insert re-renders the body, which makes
        // SwiftUI reinstall .onHover's NSTrackingArea and fire spurious mouseExited -> hover flicker loop.
        .overlay(alignment: .trailing) {
            HStack(spacing: 4) {
                if item.status == .unread, let onMarkRead = onMarkRead {
                    Button(action: onMarkRead) {
                        Image(systemName: "checkmark.circle")
                    }
                    .buttonStyle(.plain)
                    .help("Mark as Read")
                }
                if let onArchive = onArchive {
                    Button(action: onArchive) {
                        Image(systemName: "archivebox")
                    }
                    .buttonStyle(.plain)
                    .help("Archive")
                }
            }
            .font(.system(size: 14))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(.regularMaterial, in: Capsule())
            .opacity(isHovering ? 1 : 0)
            .allowsHitTesting(isHovering)
            .animation(.easeOut(duration: 0.15), value: isHovering)
        }
    }

    private var thumbnailGradient: LinearGradient {
        switch item.type {
        case .video: return LinearGradient(colors: [Color(red: 1, green: 0.125, blue: 0.125), Color(red: 0.8, green: 0, blue: 0)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .post: return LinearGradient(colors: [Color(red: 0.11, green: 0.11, blue: 0.11), Color(red: 0.04, green: 0.04, blue: 0.04)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .article: return LinearGradient(colors: [Color(red: 0.23, green: 0.23, blue: 0.36), Color(red: 0.10, green: 0.10, blue: 0.16)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .other: return LinearGradient(colors: [Color(red: 0.35, green: 0.23, blue: 0.55), Color(red: 0.24, green: 0.10, blue: 0.43)], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}

struct TypeBadgeView: View {
    let type: ItemType
    // ponytail: NSColor system colors adapt light/dark automatically; no colorScheme env needed.
    private var typeColor: Color {
        switch type {
        case .video: return Color(NSColor.systemRed)
        case .post: return Color(NSColor.systemBlue)
        case .article: return Color(NSColor.systemGreen)
        case .other: return Color(NSColor.systemPurple)
        }
    }
    var body: some View {
        Text(type.rawValue.capitalized)
            .font(.system(size: 10, weight: .semibold))
            .padding(.horizontal, 6).padding(.vertical, 1)
            .background(typeColor.opacity(0.12))
            .foregroundStyle(typeColor)
            .cornerRadius(4)
    }
}

struct TagChipView: View {
    let name: String
    var body: some View {
        Text("#\(name)")
            .font(.system(size: 10, weight: .medium))
            .padding(.horizontal, 7).padding(.vertical, 1)
            .background(Color(NSColor.separatorColor).opacity(0.6))
            .foregroundStyle(Color.secondary)
            .cornerRadius(99)
    }
}
