// apps/mac/StashBro/Sync/GRDBLocalStore.swift
import Foundation
import GRDB

// MARK: - Protocols

protocol LocalStoreProtocol {
    func getChangesSince(_ cursor: Int) throws -> [SyncChange]
    func applyChanges(_ changes: [SyncChange]) throws
    func saveLocalItem(_ item: StashItem) throws
    /// Like saveLocalItem but deduplicates by URL: re-activates an existing item if one exists.
    func bumpOrCreate(_ item: StashItem) throws
    func getCursor() -> Int
    func setCursor(_ cursor: Int)
}

protocol SyncClientProtocol {
    func pushChanges(_ changes: [SyncChange]) async throws -> Int
    func pullChanges(cursor: Int) async throws -> (changes: [SyncChange], cursor: Int)
}

// MARK: - GRDBLocalStore

final class GRDBLocalStore: LocalStoreProtocol {
    private let db: AppDatabase
    private let defaults: UserDefaults
    private let cursorKey: String

    // Normalize a server URL into a stable key fragment (host[:port], no scheme/slash).
    static func serverTag(_ url: URL?) -> String {
        guard let url else { return "default" }
        let host = url.host ?? url.absoluteString
        if let port = url.port { return "\(host):\(port)" }
        return host
    }

    // Cursor key is per-server: switching servers (or the first sync after this fix ships)
    // starts from 0 -> a full resync -> no cross-server cursor bleed. `serverURL` nil keeps
    // the legacy key for non-sync callers (they never touch the cursor).
    init(db: AppDatabase, serverURL: URL? = nil, defaults: UserDefaults = .standard) {
        self.db = db
        self.defaults = defaults
        self.cursorKey = serverURL == nil
            ? "stashbro.sync.cursor"
            : "stashbro.sync.cursor.\(GRDBLocalStore.serverTag(serverURL))"
    }

    func getChangesSince(_ cursor: Int) throws -> [SyncChange] {
        try db.dbWriter.read { dbConn in
            let items = try StashItem
                .filter(Column("change_seq") > cursor)
                .order(Column("change_seq").asc)
                .fetchAll(dbConn)
            return try items.map { item in
                let links = try ItemTag.filter(Column("item_id") == item.id).fetchAll(dbConn)
                let tagIds = links.map(\.tagId)
                let tagNames: [String] = tagIds.isEmpty ? [] :
                    try Tag.filter(tagIds.contains(Column("id"))).fetchAll(dbConn).map(\.name)
                return SyncChange(
                    id: item.id, changeSeq: item.changeSeq,
                    createdAt: item.createdAt, updatedAt: item.updatedAt,
                    deletedAt: item.deletedAt, url: item.url, title: item.title,
                    description: item.description, thumbnailUrl: item.thumbnailUrl,
                    faviconUrl: item.faviconUrl, domain: item.domain,
                    type: item.type, status: item.status, priority: item.priority,
                    tagNames: tagNames,
                    readingTimeSeconds: item.readingTimeSeconds
                )
            }
        }
    }

    func applyChanges(_ changes: [SyncChange]) throws {
        try db.dbWriter.write { dbConn in
            for change in changes {
                let existing = try StashItem.fetchOne(dbConn, key: change.id)
                // LWW: server wins on tie - skip only if local is STRICTLY newer
                if let existing, existing.updatedAt > change.updatedAt { continue }

                // Use server's changeSeq so these items stay ≤ newCursor and are never re-pushed
                let item = StashItem(
                    id: change.id,
                    userId: existing?.userId ?? "default",
                    url: change.url, title: change.title, description: change.description,
                    thumbnailUrl: change.thumbnailUrl, faviconUrl: change.faviconUrl,
                    domain: change.domain, type: change.type, status: change.status,
                    priority: change.priority,
                    createdAt: existing?.createdAt ?? change.createdAt,
                    updatedAt: change.updatedAt,
                    deletedAt: change.deletedAt,
                    changeSeq: change.changeSeq,
                    readingTimeSeconds: change.readingTimeSeconds
                )
                try item.save(dbConn)

                // Re-sync tags
                try ItemTag.filter(Column("item_id") == change.id).deleteAll(dbConn)
                for name in change.tagNames {
                    var tag = try Tag
                        .filter(Column("user_id") == item.userId && Column("name") == name)
                        .fetchOne(dbConn)
                    if tag == nil {
                        tag = Tag(id: UUID().uuidString, userId: item.userId, name: name)
                        try tag!.insert(dbConn)
                    }
                    try ItemTag(itemId: change.id, tagId: tag!.id).insert(dbConn)
                }
            }
        }
    }

    /// Local-origin write: allocates MAX(change_seq)+1 inside a single transaction so
    /// the item is always picked up by getChangesSince(cursor) on the next sync.
    /// Do NOT use for server-applied changes - use applyChanges so server seq is preserved.
    func saveLocalItem(_ item: StashItem) throws {
        try db.dbWriter.write { dbConn in
            let maxSeq = try Int.fetchOne(dbConn, sql: "SELECT MAX(change_seq) FROM stash_items") ?? 0
            var i = item
            i.changeSeq = maxSeq + 1
            try i.save(dbConn)
        }
    }

    /// Dedup by URL: if an item with the same URL already exists (any status), re-activates it
    /// (status=.unread, deletedAt=nil, updatedAt bumped) with a fresh change_seq instead of
    /// creating a duplicate. Falls through to a normal create when no match is found.
    func bumpOrCreate(_ item: StashItem) throws {
        try db.dbWriter.write { dbConn in
            let maxSeq = try Int.fetchOne(dbConn, sql: "SELECT MAX(change_seq) FROM stash_items") ?? 0
            var i: StashItem
            if let existing = try StashItem.filter(Column("url") == item.url).fetchOne(dbConn) {
                // ponytail: keep id/title/description/thumbnail from existing; only reset lifecycle fields
                i = existing
                i.status = .unread
                i.deletedAt = nil
                i.updatedAt = item.updatedAt
            } else {
                i = item
            }
            i.changeSeq = maxSeq + 1
            try i.save(dbConn)
        }
    }

    /// Like bumpOrCreate but also writes tag records + links atomically, and applies the
    /// provided title/description/thumbnail/priority (quick-save always has fresh metadata).
    func bumpOrCreateWithTags(_ item: StashItem, tagNames: [String]) throws {
        try db.dbWriter.write { dbConn in
            let maxSeq = try Int.fetchOne(dbConn, sql: "SELECT MAX(change_seq) FROM stash_items") ?? 0
            var i: StashItem
            if let existing = try StashItem.filter(Column("url") == item.url).fetchOne(dbConn) {
                i = existing
                i.status = .unread
                i.title = item.title
                i.description = item.description
                i.thumbnailUrl = item.thumbnailUrl
                i.priority = item.priority
                i.deletedAt = nil
                i.updatedAt = item.updatedAt
            } else {
                i = item
            }
            i.changeSeq = maxSeq + 1
            try i.save(dbConn)

            guard !tagNames.isEmpty else { return }
            try ItemTag.filter(Column("item_id") == i.id).deleteAll(dbConn)
            for name in tagNames {
                let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                var tag = try Tag
                    .filter(Column("user_id") == i.userId && Column("name") == trimmed)
                    .fetchOne(dbConn)
                if tag == nil {
                    tag = Tag(id: UUID().uuidString, userId: i.userId, name: trimmed)
                    try tag!.insert(dbConn)
                }
                try ItemTag(itemId: i.id, tagId: tag!.id).insert(dbConn)
            }
        }
    }

    func getCursor() -> Int { defaults.integer(forKey: cursorKey) }
    func setCursor(_ cursor: Int) { defaults.set(cursor, forKey: cursorKey) }
}
