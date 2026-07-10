// apps/mac/StashBroTests/AppDatabaseTests.swift
import XCTest
import GRDB
@testable import StashBro

final class AppDatabaseTests: XCTestCase {
    var db: AppDatabase!

    override func setUp() {
        db = AppDatabase.makeInMemory()
    }

    func testInsertAndFetchItem() throws {
        let item = StashItem(
            id: "test-id", userId: "default", url: "https://example.com",
            title: "Test", description: nil, thumbnailUrl: nil, faviconUrl: nil,
            domain: "example.com", type: .article, status: .unread,
            priority: .medium, createdAt: Date(), updatedAt: Date(),
            deletedAt: nil, changeSeq: 1
        )
        try db.dbWriter.write { db in try item.insert(db) }
        let fetched = try db.dbWriter.read { db in try StashItem.fetchOne(db, key: "test-id") }
        XCTAssertEqual(fetched?.title, "Test")
        XCTAssertEqual(fetched?.priority, .medium)
    }

    func testTagUniquenessPerUser() throws {
        let tag = Tag(id: "t1", userId: "u1", name: "AI")
        let duplicate = Tag(id: "t2", userId: "u1", name: "AI")
        let differentUser = Tag(id: "t3", userId: "u2", name: "AI")
        try db.dbWriter.write { db in try tag.insert(db) }
        XCTAssertThrowsError(try db.dbWriter.write { db in try duplicate.insert(db) })
        XCTAssertNoThrow(try db.dbWriter.write { db in try differentUser.insert(db) })
    }

    func testTimestampRoundTrip() throws {
        let iso = "2026-01-01T12:00:00.000Z"
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        formatter.timeZone = TimeZone(abbreviation: "UTC")!
        let date = try XCTUnwrap(formatter.date(from: iso))
        let item = StashItem(id: "date-test", userId: "u", url: "https://x.com",
                             title: "T", description: nil, thumbnailUrl: nil, faviconUrl: nil,
                             domain: "x.com", type: .article, status: .unread,
                             priority: .medium, createdAt: date, updatedAt: date,
                             deletedAt: nil, changeSeq: 0)
        try db.dbWriter.write { db in try item.insert(db) }
        let raw = try db.dbWriter.read { db in
            try String.fetchOne(db, sql: "SELECT created_at FROM stash_items WHERE id = 'date-test'")
        }
        XCTAssertEqual(raw, iso)
    }

    func testItemTagsCascadeDelete() throws {
        let item = StashItem(id: "i1", userId: "u", url: "https://x.com",
                             title: "T", description: nil, thumbnailUrl: nil, faviconUrl: nil,
                             domain: "x.com", type: .article, status: .unread,
                             priority: .medium, createdAt: Date(), updatedAt: Date(),
                             deletedAt: nil, changeSeq: 0)
        let tag = Tag(id: "t1", userId: "u", name: "test")
        let itemTag = ItemTag(itemId: "i1", tagId: "t1")
        try db.dbWriter.write { db in
            try item.insert(db)
            try tag.insert(db)
            try itemTag.insert(db)
        }
        try db.dbWriter.write { db in _ = try item.delete(db) }
        let count = try db.dbWriter.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM item_tags WHERE item_id = 'i1'")!
        }
        XCTAssertEqual(count, 0)
    }

    func testMigrationIdempotency() throws {
        XCTAssertNoThrow(try db.migrate())
    }

    func testChangeSeqDefault() throws {
        try db.dbWriter.write { db in
            try db.execute(sql: """
                INSERT INTO stash_items (id, user_id, url, title, domain, type, status, priority, created_at, updated_at)
                VALUES ('seq-test', 'u', 'https://x.com', 'T', 'x.com', 'article', 'unread', 'medium',
                        '2026-01-01T12:00:00.000Z', '2026-01-01T12:00:00.000Z')
            """)
        }
        let seq = try db.dbWriter.read { db in
            try Int.fetchOne(db, sql: "SELECT change_seq FROM stash_items WHERE id = 'seq-test'")
        }
        XCTAssertEqual(seq, 0)
    }
}
