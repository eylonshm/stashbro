// apps/mac/StashBro/UI/StashListView.swift
import SwiftUI
import GRDB

enum ListStyle { case popover, notch }

// Internal for testability - extracted query/mutation logic from the view.
// ponytail: module-level funcs so @testable import reaches them without exposing private view members.

/// Fetches unread, non-deleted items matching the given filters with their tags.
func stashListQuery(
    in dbConn: Database,
    type: ItemType?,
    priority: ItemPriority?,
    tag: String?,
    search: String
) throws -> [(StashItem, [Tag])] {
    var query = StashItem.filter(Column("deleted_at") == nil && Column("status") == "unread")
    if let t = type { query = query.filter(Column("type") == t.rawValue) }
    if let p = priority { query = query.filter(Column("priority") == p.rawValue) }
    if let tagName = tag {
        let matchingIds = try String.fetchAll(
            dbConn,
            sql: "SELECT item_id FROM item_tags JOIN tags ON tags.id = item_tags.tag_id WHERE tags.name = ?",
            arguments: [tagName]
        )
        guard !matchingIds.isEmpty else { return [] }
        query = query.filter(matchingIds.contains(Column("id")))
    }
    if !search.isEmpty {
        query = query.filter(Column("title").like("%\(search)%") || Column("url").like("%\(search)%"))
    }
    let fetchedItems = try query.order(Column("change_seq").desc).fetchAll(dbConn)
    return try fetchedItems.map { item in
        let links = try ItemTag.filter(Column("item_id") == item.id).fetchAll(dbConn)
        let tagIds = links.map(\.tagId)
        let tags: [Tag] = tagIds.isEmpty ? [] :
            try Tag.filter(tagIds.contains(Column("id"))).fetchAll(dbConn)
        return (item, tags)
    }
}

/// Distinct tags present on unread, non-deleted items - used to populate the tag filter chips.
func loadAvailableTags(in dbConn: Database) throws -> [Tag] {
    try Tag.fetchAll(dbConn, sql: """
        SELECT DISTINCT tags.* FROM tags
        JOIN item_tags ON item_tags.tag_id = tags.id
        JOIN stash_items ON stash_items.id = item_tags.item_id
        WHERE stash_items.deleted_at IS NULL AND stash_items.status = 'unread'
        ORDER BY tags.name
    """)
}

/// Archives an item: bumps status, updatedAt, and allocates a new local change_seq so the
/// mutation is picked up by GRDBLocalStore.getChangesSince and pushed to the server.
func archiveItem(_ item: StashItem, in db: AppDatabase) throws {
    var updated = item
    updated.status = .archived
    updated.updatedAt = Date()
    try GRDBLocalStore(db: db).saveLocalItem(updated)
}

struct StashListView: View {
    let db: AppDatabase
    let syncEngine: () -> SyncEngine?  // ponytail: closure so callers always get the current engine after reconnect
    let style: ListStyle

    @State private var searchText = ""
    @State private var selectedType: ItemType? = nil
    @State private var selectedPriority: ItemPriority? = nil
    @State private var selectedTag: String? = nil
    @State private var availableTags: [Tag] = []
    @State private var items: [(item: StashItem, tags: [Tag])] = []
    // ponytail: token held in @State so it lives with SwiftUI's storage and cancels on view removal
    @State private var observationToken: AnyDatabaseCancellable?

    @State private var settingsWindow: NSWindow?

    var body: some View {
        VStack(spacing: 0) {
            // Search + settings
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.tertiary)
                    .font(.system(size: 12))
                TextField("Search your stash\u{2026}", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                Button(action: openSettings) {
                    Image(systemName: "gearshape")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(7)
            .padding(.horizontal, 12).padding(.top, 12).padding(.bottom, 8)

            // Type filters
            FilterChipRow(
                options: [("All", nil), ("Video", ItemType.video), ("Post", .post), ("Article", .article), ("Other", .other)],
                selection: $selectedType
            )
            .padding(.bottom, 4)

            // Tag filters (hidden when no tags exist)
            if !availableTags.isEmpty {
                FilterChipRow(
                    options: [("All", nil)] + availableTags.map { ($0.name, $0.name) },
                    selection: $selectedTag
                )
                .padding(.bottom, 4)
            }

            // Priority filters
            FilterChipRow(
                options: [("All", nil), ("High", ItemPriority.high), ("Low", .low)],
                selection: $selectedPriority
            )
            .padding(.bottom, 6)

            Divider()

            // Item list
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(items, id: \.item.id) { row in
                        ItemRowView(item: row.item, tags: row.tags)
                            .padding(.horizontal, 12)
                            .onTapGesture {
                                if let url = URL(string: row.item.url) { NSWorkspace.shared.open(url) }
                            }
                            .swipeActions(edge: .trailing) {
                                Button("Archive") { archive(row.item) }
                                    .tint(.orange)
                            }
                    }
                }
            }
        }
        .onAppear { startObservation() }
        .onChange(of: searchText) { _, _ in startObservation() }
        .onChange(of: selectedType) { _, _ in startObservation() }
        .onChange(of: selectedPriority) { _, _ in startObservation() }
        .onChange(of: selectedTag) { _, _ in startObservation() }
    }

    /// Starts (or restarts) a GRDB ValueObservation for the current filter state.
    /// Replaces the previous token, which auto-cancels the old observation.
    private func startObservation() {
        let text = searchText
        let type = selectedType
        let priority = selectedPriority
        let tagName = selectedTag
        observationToken = ValueObservation
            .tracking { db -> ([(StashItem, [Tag])], [Tag]) in
                let its = try stashListQuery(in: db, type: type, priority: priority, tag: tagName, search: text)
                let tgs = try loadAvailableTags(in: db)
                return (its, tgs)
            }
            .start(
                in: db.dbWriter,
                onError: { print("[StashBro] list observation error: \($0)") },
                onChange: { result in
                    items = result.0.map { ($0.0, $0.1) }
                    availableTags = result.1
                }
            )
    }

    private func archive(_ item: StashItem) {
        do {
            try archiveItem(item, in: db)
            Task { await syncEngine()?.sync() }
        } catch {
            print("[StashBro] archive failed for \(item.id): \(error)")
        }
    }

    private func openSettings() {
        if let w = settingsWindow, w.isVisible { w.makeKeyAndOrderFront(nil); return }
        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 420, height: 340),
            styleMask: [.titled, .closable], backing: .buffered, defer: false
        )
        w.title = "StashBro Settings"
        w.contentView = NSHostingView(rootView: SettingsView())
        w.center()
        w.makeKeyAndOrderFront(nil)
        settingsWindow = w
    }
}
