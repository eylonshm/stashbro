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
}
