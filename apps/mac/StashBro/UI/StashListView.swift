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
    search: String
) throws -> [(StashItem, [Tag])] {
    var query = StashItem.filter(Column("deleted_at") == nil && Column("status") == "unread")
    if let t = type { query = query.filter(Column("type") == t.rawValue) }
    if let p = priority { query = query.filter(Column("priority") == p.rawValue) }
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

/// Archives an item: bumps status, updatedAt, and allocates a new local change_seq so the
/// mutation is picked up by GRDBLocalStore.getChangesSince and pushed to the server.
func archiveItem(_ item: StashItem, in db: AppDatabase) throws {
    var updated = item
    updated.status = .archived
    updated.updatedAt = Date()
    try db.dbWriter.write { dbConn in
        let maxSeq = try Int.fetchOne(dbConn, sql: "SELECT MAX(change_seq) FROM stash_items") ?? 0
        updated.changeSeq = maxSeq + 1
        try updated.save(dbConn)
    }
}

struct StashListView: View {
    let db: AppDatabase
    let syncEngine: SyncEngine?
    let style: ListStyle

    @State private var searchText = ""
    @State private var selectedType: ItemType? = nil
    @State private var selectedPriority: ItemPriority? = nil
    @State private var items: [(item: StashItem, tags: [Tag])] = []

    var body: some View {
        VStack(spacing: 0) {
            // Search
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.tertiary)
                    .font(.system(size: 12))
                TextField("Search your stash\u{2026}", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
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
                            .onTapGesture { NSWorkspace.shared.open(URL(string: row.item.url)!) }
                            .swipeActions(edge: .trailing) {
                                Button("Archive") { archive(row.item) }
                                    .tint(.orange)
                            }
                    }
                }
            }
        }
        .task { await loadItems() }
        .onChange(of: searchText) { _, _ in Task { await loadItems() } }
        .onChange(of: selectedType) { _, _ in Task { await loadItems() } }
        .onChange(of: selectedPriority) { _, _ in Task { await loadItems() } }
    }

    private func loadItems() async {
        let text = searchText
        let type = selectedType
        let priority = selectedPriority
        let result = try? await db.dbWriter.read { dbConn in
            try stashListQuery(in: dbConn, type: type, priority: priority, search: text)
        }
        items = (result ?? []).map { ($0.0, $0.1) }
    }

    private func archive(_ item: StashItem) {
        try? archiveItem(item, in: db)
        Task {
            await loadItems()
            await syncEngine?.sync()
        }
    }
}
