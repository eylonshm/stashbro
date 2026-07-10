// apps/mac/StashBroWidget/StashBroWidget.swift
import WidgetKit
import SwiftUI
import GRDB

struct WidgetItem {
    let title: String
    let type: ItemType
    let isHighPriority: Bool
}

struct StashBroEntry: TimelineEntry {
    let date: Date
    let unreadCount: Int
    let recentItems: [WidgetItem]
}

struct StashBroProvider: TimelineProvider {
    func placeholder(in context: Context) -> StashBroEntry {
        StashBroEntry(date: Date(), unreadCount: 7, recentItems: [
            WidgetItem(title: "Karpathy - Intro to LLMs", type: .video, isHighPriority: true),
            WidgetItem(title: "The Unbundling of Search", type: .article, isHighPriority: false),
            WidgetItem(title: "@levelsio on $1M ARR", type: .post, isHighPriority: false),
        ])
    }

    func getSnapshot(in context: Context, completion: @escaping (StashBroEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StashBroEntry>) -> Void) {
        let entry = loadEntry()
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func loadEntry() -> StashBroEntry {
        let db = AppDatabase.makeShared()
        do {
            let (count, items) = try db.dbWriter.read { dbConn -> (Int, [WidgetItem]) in
                let count = try StashItem
                    .filter(Column("status") == "unread" && Column("deleted_at") == nil)
                    .fetchCount(dbConn)
                let recent = try StashItem
                    .filter(Column("status") == "unread" && Column("deleted_at") == nil)
                    .order(Column("change_seq").desc)
                    .limit(3)
                    .fetchAll(dbConn)
                let widgetItems = recent.map { item in
                    WidgetItem(title: item.title, type: item.type, isHighPriority: item.priority == .high)
                }
                return (count, widgetItems)
            }
            return StashBroEntry(date: Date(), unreadCount: count, recentItems: items)
        } catch {
            return StashBroEntry(date: Date(), unreadCount: 0, recentItems: [])
        }
    }
}

struct StashBroWidget: Widget {
    let kind = "StashBroWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StashBroProvider()) { entry in
            StashBroWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("StashBro")
        .description("Reading queue at a glance")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct StashBroWidgetView: View {
    let entry: StashBroEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall: smallView
        default: mediumView
        }
    }

    private var smallView: some View {
        VStack(alignment: .leading) {
            Text("\(entry.unreadCount)")
                .font(.system(size: 48, weight: .black, design: .rounded))
                .foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
            Text("Unread")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.tertiary)
                .textCase(.uppercase)
                .tracking(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(14)
    }

    private var mediumView: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 1) {
                Text("\(entry.unreadCount)")
                    .font(.system(size: 48, weight: .black, design: .rounded))
                    .foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
                Text("Unread")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.tertiary)
                    .textCase(.uppercase)
                    .tracking(1)
            }
            .frame(width: 80)

            Divider()

            VStack(alignment: .leading, spacing: 7) {
                ForEach(entry.recentItems.prefix(3), id: \.title) { item in
                    HStack(spacing: 6) {
                        Circle().fill(typeColor(item.type)).frame(width: 7, height: 7)
                        if item.isHighPriority {
                            Circle().fill(Color(red: 0.851, green: 0.353, blue: 0.157)).frame(width: 5, height: 5)
                        }
                        Text(item.title)
                            .font(.system(size: 11.5, weight: .medium))
                            .lineLimit(1)
                            .foregroundStyle(.primary)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
    }

    private func typeColor(_ type: ItemType) -> Color {
        switch type {
        case .video: return Color(red: 0.710, green: 0.188, blue: 0.188)
        case .post: return Color(red: 0.165, green: 0.337, blue: 0.659)
        case .article: return Color(red: 0.122, green: 0.478, blue: 0.278)
        case .other: return Color(red: 0.392, green: 0.255, blue: 0.627)
        }
    }
}
