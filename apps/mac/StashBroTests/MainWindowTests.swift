// apps/mac/StashBroTests/MainWindowTests.swift
import XCTest
import GRDB
@testable import StashBro

private func makeItem(
    id: String = UUID().uuidString,
    url: String = "https://example.com",
    status: ItemStatus = .unread,
    priority: ItemPriority = .medium,
    type: ItemType = .article,
    changeSeq: Int = 0,
    deletedAt: Date? = nil
) -> StashItem {
    StashItem(
        id: id, userId: "u", url: url, title: "Test",
        description: nil, thumbnailUrl: nil, faviconUrl: nil,
        domain: "example.com", type: type, status: status, priority: priority,
        createdAt: Date(), updatedAt: Date(), deletedAt: deletedAt, changeSeq: changeSeq
    )
}

final class StashListQueryStatusTests: XCTestCase {
    var db: AppDatabase!
    override func setUp() { db = AppDatabase.makeInMemory() }

    func testStatusNilReturnsAllNonDeleted() throws {
        let unread   = makeItem(id: "u", status: .unread)
        let archived = makeItem(id: "a", status: .archived)
        let deleted  = makeItem(id: "d", status: .unread, deletedAt: Date())
        try db.dbWriter.write { d in try unread.insert(d); try archived.insert(d); try deleted.insert(d) }

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, tag: nil, search: "", status: nil)
        }
        XCTAssertEqual(Set(results.map(\.0.id)), ["u", "a"])
    }

    func testStatusArchivedReturnsOnlyArchived() throws {
        let unread   = makeItem(id: "u", status: .unread)
        let archived = makeItem(id: "a", status: .archived)
        try db.dbWriter.write { d in try unread.insert(d); try archived.insert(d) }

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, tag: nil, search: "", status: .archived)
        }
        XCTAssertEqual(results.map(\.0.id), ["a"])
    }

    func testDefaultStatusIsUnread() throws {
        let unread   = makeItem(id: "u", status: .unread)
        let archived = makeItem(id: "a", status: .archived)
        try db.dbWriter.write { d in try unread.insert(d); try archived.insert(d) }

        // called without status: - existing callers unchanged
        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, tag: nil, search: "")
        }
        XCTAssertEqual(results.map(\.0.id), ["u"])
    }
}

final class MutationHelperTests: XCTestCase {
    var db: AppDatabase!
    override func setUp() { db = AppDatabase.makeInMemory() }

    func testSetItemStatusUnarchives() throws {
        let item = makeItem(id: "a", status: .archived, changeSeq: 1)
        try db.dbWriter.write { d in try item.insert(d) }

        try setItemStatus(item, status: .unread, in: db)

        let fetched = try db.dbWriter.read { d in try StashItem.fetchOne(d, key: "a") }
        XCTAssertEqual(fetched?.status, .unread)
        XCTAssertEqual(fetched?.changeSeq, 2)  // max(1)+1
    }

    func testSetItemPriorityBumpsSeq() throws {
        let item = makeItem(id: "p", priority: .medium, changeSeq: 3)
        try db.dbWriter.write { d in try item.insert(d) }

        try setItemPriority(item, priority: .high, in: db)

        let fetched = try db.dbWriter.read { d in try StashItem.fetchOne(d, key: "p") }
        XCTAssertEqual(fetched?.priority, .high)
        XCTAssertEqual(fetched?.changeSeq, 4)
    }

    func testDeleteItemSetsDeletedAt() throws {
        let item = makeItem(id: "del", changeSeq: 0)
        try db.dbWriter.write { d in try item.insert(d) }

        try deleteItem(item, in: db)

        let fetched = try db.dbWriter.read { d in try StashItem.fetchOne(d, key: "del") }
        XCTAssertNotNil(fetched?.deletedAt)
        XCTAssertEqual(fetched?.changeSeq, 1)
    }

    func testDeletedItemExcludedFromQuery() throws {
        let item = makeItem(id: "gone")
        try db.dbWriter.write { d in try item.insert(d) }

        try deleteItem(item, in: db)

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, tag: nil, search: "")
        }
        XCTAssertTrue(results.isEmpty)
    }
}

final class SidebarCountTests: XCTestCase {
    var db: AppDatabase!
    override func setUp() { db = AppDatabase.makeInMemory() }

    func testLoadSidebarCounts() throws {
        let u = makeItem(id: "u", status: .unread)
        let a = makeItem(id: "a", status: .archived)
        let d = makeItem(id: "d", deletedAt: Date())
        try db.dbWriter.write { dbConn in try u.insert(dbConn); try a.insert(dbConn); try d.insert(dbConn) }

        let counts = try db.dbWriter.read { d in try loadSidebarCounts(in: d) }
        XCTAssertEqual(counts.all, 2)      // u + a (d is tombstoned)
        XCTAssertEqual(counts.unread, 1)
        XCTAssertEqual(counts.read, 0)
        XCTAssertEqual(counts.archived, 1)
    }

    func testLoadTagsWithCounts() throws {
        let item1 = makeItem(id: "i1", status: .unread)
        let item2 = makeItem(id: "i2", status: .archived)
        let tag1 = Tag(id: "t1", userId: "u", name: "swift")
        let tag2 = Tag(id: "t2", userId: "u", name: "grdb")
        try db.dbWriter.write { d in
            try item1.insert(d); try item2.insert(d)
            try tag1.insert(d); try tag2.insert(d)
            try ItemTag(itemId: "i1", tagId: "t1").insert(d)
            try ItemTag(itemId: "i2", tagId: "t2").insert(d)  // archived - excluded from counts
        }

        let tagsWithCounts = try db.dbWriter.read { d in try loadTagsWithCounts(in: d) }
        XCTAssertEqual(tagsWithCounts.count, 1)
        XCTAssertEqual(tagsWithCounts[0].0.name, "swift")
        XCTAssertEqual(tagsWithCounts[0].1, 1)
    }
}
