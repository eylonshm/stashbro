// apps/mac/StashBro/UI/MainWindowView.swift
import SwiftUI
import GRDB

// Sidebar selection model
enum MainSidebarItem: Hashable {
    case all, unread, read, archived
    case type_(ItemType)
    case tag(String)  // tag name
}

// ponytail: module-level for testability - same pattern as stashListQuery in StashListView.swift

/// Tags present on unread non-deleted items with their item counts.
func loadTagsWithCounts(in dbConn: Database) throws -> [(Tag, Int)] {
    try Row.fetchAll(dbConn, sql: """
        SELECT tags.id, tags.user_id, tags.name, COUNT(*) AS cnt
        FROM tags
        JOIN item_tags ON item_tags.tag_id = tags.id
        JOIN stash_items ON stash_items.id = item_tags.item_id
        WHERE stash_items.deleted_at IS NULL AND stash_items.status = 'unread'
        GROUP BY tags.id
        ORDER BY tags.name
    """).map { row in (Tag(id: row["id"], userId: row["user_id"], name: row["name"]), row["cnt"] as Int) }
}

/// Non-deleted item counts for the Library sidebar section.
func loadSidebarCounts(in dbConn: Database) throws -> (all: Int, unread: Int, read: Int, archived: Int) {
    let all      = try Int.fetchOne(dbConn, sql: "SELECT COUNT(*) FROM stash_items WHERE deleted_at IS NULL") ?? 0
    let unread   = try Int.fetchOne(dbConn, sql: "SELECT COUNT(*) FROM stash_items WHERE deleted_at IS NULL AND status = 'unread'") ?? 0
    let read     = try Int.fetchOne(dbConn, sql: "SELECT COUNT(*) FROM stash_items WHERE deleted_at IS NULL AND status = 'read'") ?? 0
    let archived = try Int.fetchOne(dbConn, sql: "SELECT COUNT(*) FROM stash_items WHERE deleted_at IS NULL AND status = 'archived'") ?? 0
    return (all, unread, read, archived)
}

private struct SidebarData {
    var allCount = 0
    var unreadCount = 0
    var readCount = 0
    var archivedCount = 0
    var tagsWithCounts: [(Tag, Int)] = []
}

struct MainWindowView: View {
    let db: AppDatabase
    let syncEngine: () -> SyncEngine?  // ponytail: closure for live engine after reconnect

    @State private var selection: MainSidebarItem? = .unread
    @State private var searchText = ""
    @State private var items: [(item: StashItem, tags: [Tag])] = []
    @State private var sidebarData = SidebarData()
    @State private var observationToken: AnyDatabaseCancellable?
    @Environment(\.colorScheme) private var colorScheme

    // Matches NotchPanelView's orange; lighter shade in dark mode per design spec
    private var accentColor: Color {
        colorScheme == .dark
            ? Color(red: 0.851, green: 0.557, blue: 0.271)  // #D98E45
            : Color(red: 0.784, green: 0.478, blue: 0.220)  // #C87A38
    }

    var body: some View {
        NavigationSplitView {
            sidebarView
                .navigationSplitViewColumnWidth(min: 160, ideal: 200, max: 300)
        } detail: {
            contentView
        }
        .searchable(text: $searchText, placement: .toolbar)
        .onAppear { startObservation() }
        .onChange(of: selection) { _, _ in startObservation() }
        .onChange(of: searchText) { _, _ in startObservation() }
    }

    // MARK: - Sidebar

    // ponytail: .tag() drives the visual highlight; .contentShape+onTapGesture ensures binding fires
    // macOS 15 List(selection:) with static Section rows doesn't reliably update binding on click
    private func sidebarRow(_ item: MainSidebarItem, label: String, icon: String, badge: Int = 0) -> some View {
        Label(label, systemImage: icon)
            .badge(badge)
            .contentShape(Rectangle())
            .onTapGesture { selection = item }
            .tag(item)
    }

    private var sidebarView: some View {
        List(selection: $selection) {
            Section("Library") {
                sidebarRow(.all,      label: "All",      icon: "tray.full",      badge: sidebarData.allCount)
                sidebarRow(.unread,   label: "Unread",   icon: "circle.fill",    badge: sidebarData.unreadCount)
                sidebarRow(.read,     label: "Read",     icon: "checkmark.circle", badge: sidebarData.readCount)
                sidebarRow(.archived, label: "Archived", icon: "archivebox",     badge: sidebarData.archivedCount)
            }
            Section("Types") {
                ForEach([ItemType.video, .post, .article, .other], id: \.self) { t in
                    Label(t.rawValue.capitalized, systemImage: typeIcon(t))
                        .contentShape(Rectangle())
                        .onTapGesture { selection = .type_(t) }
                        .tag(MainSidebarItem.type_(t))
                }
            }
            if !sidebarData.tagsWithCounts.isEmpty {
                Section("Tags") {
                    ForEach(sidebarData.tagsWithCounts, id: \.0.id) { tag, count in
                        Label(tag.name, systemImage: "tag")
                            .badge(count)
                            .contentShape(Rectangle())
                            .onTapGesture { selection = .tag(tag.name) }
                            .tag(MainSidebarItem.tag(tag.name))
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .tint(accentColor)
    }

    private func typeIcon(_ type: ItemType) -> String {
        switch type {
        case .video:   return "film"
        case .post:    return "bubble.left"
        case .article: return "doc.text"
        case .other:   return "link"
        }
    }

    // MARK: - Content

    private var contentView: some View {
        Group {
            if items.isEmpty {
                VStack {
                    Spacer()
                    Text("Nothing here yet - hit \u{2318}\u{21E7}S to save your first link")
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding()
                    Spacer()
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(items, id: \.item.id) { row in
                            ItemRowView(
                                item: row.item, tags: row.tags,
                                onMarkRead: row.item.status == .unread
                                    ? { mutate(row.item) { try setItemStatus($0, status: .read, in: db) } }
                                    : nil,
                                onArchive: { mutate(row.item) { try archiveItem($0, in: db) } }
                            )
                            .padding(.horizontal, 16)
                            .onTapGesture {
                                if let url = URL(string: row.item.url) {
                                    NSWorkspace.shared.open(url)
                                }
                            }
                            .contextMenu { rowContextMenu(row.item) }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    @ViewBuilder
    private func rowContextMenu(_ item: StashItem) -> some View {
        if item.status == .unread {
            Button("Mark as Read") { mutate(item) { try setItemStatus($0, status: .read, in: db) } }
            Button("Archive") { mutate(item) { try archiveItem($0, in: db) } }
        } else if item.status == .read {
            Button("Mark as Unread") { mutate(item) { try setItemStatus($0, status: .unread, in: db) } }
            Button("Archive") { mutate(item) { try archiveItem($0, in: db) } }
        } else {
            Button("Unarchive") { mutate(item) { try setItemStatus($0, status: .unread, in: db) } }
        }

        Divider()

        Menu("Priority") {
            Button("High")   { mutate(item) { try setItemPriority($0, priority: .high,   in: db) } }
            Button("Medium") { mutate(item) { try setItemPriority($0, priority: .medium, in: db) } }
            Button("Low")    { mutate(item) { try setItemPriority($0, priority: .low,    in: db) } }
        }

        Divider()

        Button("Copy Link") {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(item.url, forType: .string)
        }

        Divider()

        Button("Delete", role: .destructive) { mutate(item) { try deleteItem($0, in: db) } }
    }

    private func mutate(_ item: StashItem, action: (StashItem) throws -> Void) {
        do {
            try action(item)
            Task { @MainActor in await syncEngine()?.sync() }
        } catch {
            print("[StashBro] mutation failed for \(item.id): \(error)")
        }
    }

    // MARK: - Observation

    private func startObservation() {
        let sel = selection ?? .unread
        let text = searchText
        let (statusFilter, typeFilter, tagFilter) = queryParams(for: sel)
        observationToken = ValueObservation
            .tracking { dbConn in
                let its = try stashListQuery(in: dbConn, type: typeFilter, priority: nil, tag: tagFilter, search: text, status: statusFilter)
                let counts = try loadSidebarCounts(in: dbConn)
                let tagsWithCounts = try loadTagsWithCounts(in: dbConn)
                return (its, SidebarData(allCount: counts.all, unreadCount: counts.unread, readCount: counts.read, archivedCount: counts.archived, tagsWithCounts: tagsWithCounts))
            }
            .start(
                in: db.dbWriter,
                onError: { print("[StashBro] main window observation error: \($0)") },
                onChange: { result in
                    self.items = result.0.map { ($0.0, $0.1) }
                    self.sidebarData = result.1
                }
            )
    }

    private func queryParams(for sel: MainSidebarItem) -> (status: ItemStatus?, type: ItemType?, tag: String?) {
        switch sel {
        case .all:          return (nil,       nil, nil)
        case .unread:       return (.unread,   nil, nil)
        case .read:         return (.read,     nil, nil)
        case .archived:     return (.archived, nil, nil)
        case .type_(let t): return (.unread,   t,   nil)  // types filter unread only
        case .tag(let n):   return (.unread,   nil, n)
        }
    }
}
