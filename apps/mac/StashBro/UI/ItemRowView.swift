// apps/mac/StashBro/UI/ItemRowView.swift
import SwiftUI

struct ItemRowView: View {
    let item: StashItem
    let tags: [Tag]
    @Environment(\.colorScheme) private var colorScheme

    private var priorityColor: Color? {
        switch item.priority {
        case .high:
            // ponytail: two values per design spec - light #D95A28, dark #E8693A
            return colorScheme == .dark
                ? Color(red: 0.906, green: 0.412, blue: 0.227)
                : Color(red: 0.851, green: 0.353, blue: 0.157)
        case .low: return Color(red: 0.620, green: 0.631, blue: 0.706)
        case .medium: return nil
        }
    }

    var body: some View {
        HStack(spacing: 9) {
            // Priority bar
            if let color = priorityColor {
                RoundedRectangle(cornerRadius: 2)
                    .fill(color)
                    .frame(width: 3)
                    .padding(.vertical, 9)
            } else {
                // Keep spacing consistent when no bar (medium priority)
                Color.clear.frame(width: 3)
            }
            // Thumbnail
            RoundedRectangle(cornerRadius: 7)
                .fill(thumbnailGradient)
                .frame(width: 34, height: 34)
            // Info
            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(2)
                HStack(spacing: 5) {
                    Text(item.domain)
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                    TypeBadgeView(type: item.type)
                    ForEach(tags, id: \.id) { tag in
                        TagChipView(name: tag.name)
                    }
                }
            }
            Spacer()
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
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
