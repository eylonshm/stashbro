// apps/mobile/ios-widgets/StashBroIOSWidget.swift
import WidgetKit
import SwiftUI
import SQLite3

struct IOSWidgetEntry: TimelineEntry {
    let date: Date
    let unreadCount: Int
    let recentItems: [(title: String, typeStr: String, isHighPriority: Bool)]
}

struct IOSWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> IOSWidgetEntry {
        IOSWidgetEntry(date: Date(), unreadCount: 7, recentItems: [
            ("Karpathy - Intro to LLMs", "video", true),
            ("The Unbundling of Search", "article", true),
            ("@levelsio on $1M ARR", "post", false),
        ])
    }

    func getSnapshot(in context: Context, completion: @escaping (IOSWidgetEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<IOSWidgetEntry>) -> Void) {
        let entry = loadEntry()
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func loadEntry() -> IOSWidgetEntry {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.stashbro.mobile"
        ) else { return IOSWidgetEntry(date: Date(), unreadCount: 0, recentItems: []) }

        let dbPath = containerURL.appendingPathComponent("stashbro.db").path
        var db: OpaquePointer?
        // ponytail: SQLITE_OPEN_READONLY - widget never writes or creates the DB; missing DB -> empty entry
        guard sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else {
            return IOSWidgetEntry(date: Date(), unreadCount: 0, recentItems: [])
        }
        defer { sqlite3_close(db) }

        var count = 0
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM items WHERE status='unread' AND deleted_at IS NULL", -1, &stmt, nil) == SQLITE_OK {
            if sqlite3_step(stmt) == SQLITE_ROW { count = Int(sqlite3_column_int(stmt, 0)) }
            sqlite3_finalize(stmt)
        }

        var items: [(String, String, Bool)] = []
        if sqlite3_prepare_v2(db, "SELECT title, type, priority FROM items WHERE status='unread' AND deleted_at IS NULL ORDER BY change_seq DESC LIMIT 3", -1, &stmt, nil) == SQLITE_OK {
            while sqlite3_step(stmt) == SQLITE_ROW {
                let title = String(cString: sqlite3_column_text(stmt, 0))
                let type_ = String(cString: sqlite3_column_text(stmt, 1))
                let priority = String(cString: sqlite3_column_text(stmt, 2))
                items.append((title, type_, priority == "high"))
            }
            sqlite3_finalize(stmt)
        }

        return IOSWidgetEntry(date: Date(), unreadCount: count, recentItems: items)
    }
}

struct StashBroIOSWidget: Widget {
    let kind = "StashBroIOSWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: IOSWidgetProvider()) { entry in
            IOSWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("StashBro")
        .description("Reading queue at a glance")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct IOSWidgetView: View {
    let entry: IOSWidgetEntry
    @Environment(\.widgetFamily) var family

    private func dotColor(_ type: String) -> Color {
        switch type {
        case "video": return Color(red: 0.710, green: 0.188, blue: 0.188)
        case "post": return Color(red: 0.165, green: 0.337, blue: 0.659)
        case "article": return Color(red: 0.122, green: 0.478, blue: 0.278)
        default: return Color(red: 0.392, green: 0.255, blue: 0.627)
        }
    }

    var body: some View {
        if family == .systemSmall {
            VStack(alignment: .leading) {
                Text("\(entry.unreadCount)").font(.system(size: 48, weight: .black)).foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
                Text("Unread").font(.system(size: 11, weight: .medium)).foregroundStyle(.tertiary).textCase(.uppercase).tracking(1)
            }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading).padding(14)
        } else {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(entry.unreadCount)").font(.system(size: 48, weight: .black)).foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
                    Text("Unread").font(.system(size: 11, weight: .medium)).foregroundStyle(.tertiary).textCase(.uppercase).tracking(1)
                }.frame(width: 80)
                Divider()
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(entry.recentItems.prefix(3), id: \.0) { item in
                        HStack(spacing: 6) {
                            Circle().fill(dotColor(item.1)).frame(width: 7, height: 7)
                            if item.2 { Circle().fill(Color(red: 0.851, green: 0.353, blue: 0.157)).frame(width: 5, height: 5) }
                            Text(item.0).font(.system(size: 11.5, weight: .medium)).lineLimit(1)
                        }
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.padding(14)
        }
    }
}
