// apps/mac/StashBro/DB/AppDatabase.swift
import Foundation
import GRDB

final class AppDatabase {
    let dbWriter: DatabaseWriter

    static let shared = AppDatabase.makeShared()

    init(dbWriter: DatabaseWriter) {
        self.dbWriter = dbWriter
    }

    static func makeShared(appGroupId: String = "group.com.stashbro.app") -> AppDatabase {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
            return makeInMemory() // nil = test/sandbox (no app group entitlement)
        }
        // try! intentional: disk full / corruption / migration failure must crash loudly;
        // silent in-memory fallback would hide data and lose saves on restart.
        // User-facing error UI comes in a later task.
        return try! makeAt(path: container.appendingPathComponent("stashbro.db").path)
    }

    static func makeInMemory() -> AppDatabase {
        let writer = try! DatabaseQueue(configuration: Self.config())
        let db = AppDatabase(dbWriter: writer)
        try! db.migrate()
        return db
    }

    static func makeAt(path: String) throws -> AppDatabase {
        var config = Self.config()
        config.prepareDatabase { db in try db.execute(sql: "PRAGMA journal_mode = WAL") }
        let writer = try DatabasePool(path: path, configuration: config)
        let db = AppDatabase(dbWriter: writer)
        try db.migrate()
        return db
    }

    private static func config() -> Configuration {
        var config = Configuration()
        config.foreignKeysEnabled = true
        return config
    }

    func migrate() throws {
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v1") { db in
            try db.create(table: "stash_items", ifNotExists: true) { t in
                t.primaryKey("id", .text)
                t.column("user_id", .text).notNull()
                t.column("url", .text).notNull()
                t.column("title", .text).notNull()
                t.column("description", .text)
                t.column("thumbnail_url", .text)
                t.column("favicon_url", .text)
                t.column("domain", .text).notNull()
                t.column("type", .text).notNull().defaults(to: "article")
                t.column("status", .text).notNull().defaults(to: "unread")
                t.column("priority", .text).notNull().defaults(to: "medium")
                t.column("created_at", .datetime).notNull()
                t.column("updated_at", .datetime).notNull()
                t.column("deleted_at", .datetime)
                t.column("change_seq", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "stash_items_user_seq", on: "stash_items", columns: ["user_id", "change_seq"])
            try db.create(table: "tags", ifNotExists: true) { t in
                t.primaryKey("id", .text)
                t.column("user_id", .text).notNull()
                t.column("name", .text).notNull()
                t.uniqueKey(["user_id", "name"])
            }
            try db.create(table: "item_tags", ifNotExists: true) { t in
                t.column("item_id", .text).notNull().references("stash_items", onDelete: .cascade)
                t.column("tag_id", .text).notNull().references("tags", onDelete: .cascade)
                t.primaryKey(["item_id", "tag_id"])
            }
        }
        try migrator.migrate(dbWriter)
    }
}
