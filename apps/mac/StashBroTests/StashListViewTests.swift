// apps/mac/StashBroTests/StashListViewTests.swift
import XCTest
import GRDB
@testable import StashBro

private func makeItem(
    id: String = UUID().uuidString,
    title: String = "Test",
    url: String = "https://example.com",
    domain: String = "example.com",
    type: ItemType = .article,
    status: ItemStatus = .unread,
    priority: ItemPriority = .medium,
    changeSeq: Int = 0,
    deletedAt: Date? = nil
) -> StashItem {
    StashItem(
        id: id, userId: "u", url: url, title: title,
        description: nil, thumbnailUrl: nil, faviconUrl: nil,
        domain: domain, type: type, status: status, priority: priority,
        createdAt: Date(), updatedAt: Date(), deletedAt: deletedAt, changeSeq: changeSeq
    )
}

final class StashListQueryTests: XCTestCase {
    var db: AppDatabase!

    override func setUp() {
        db = AppDatabase.makeInMemory()
    }

    // MARK: - stashListQuery filter tests

    func testReturnsOnlyUnreadItems() throws {
        let unread = makeItem(id: "a", title: "Unread", status: .unread)
        let archived = makeItem(id: "b", title: "Archived", status: .archived)
        try db.dbWriter.write { d in try unread.insert(d); try archived.insert(d) }

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, search: "")
        }
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].0.id, "a")
    }

    func testExcludesDeletedItems() throws {
        let live = makeItem(id: "a", title: "Live")
        let deleted = makeItem(id: "b", title: "Deleted", deletedAt: Date())
        try db.dbWriter.write { d in try live.insert(d); try deleted.insert(d) }

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, search: "")
        }
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].0.id, "a")
    }

    func testTypeFilter() throws {
        let video = makeItem(id: "v", type: .video)
        let article = makeItem(id: "ar", type: .article)
        try db.dbWriter.write { d in try video.insert(d); try article.insert(d) }

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: .video, priority: nil, search: "")
        }
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].0.id, "v")
    }

    func testPriorityFilter() throws {
        let high = makeItem(id: "h", priority: .high)
        let low = makeItem(id: "l", priority: .low)
        let med = makeItem(id: "m", priority: .medium)
        try db.dbWriter.write { d in try high.insert(d); try low.insert(d); try med.insert(d) }

        let highResults = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: .high, search: "")
        }
        XCTAssertEqual(highResults.count, 1)
        XCTAssertEqual(highResults[0].0.id, "h")

        let lowResults = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: .low, search: "")
        }
        XCTAssertEqual(lowResults.count, 1)
        XCTAssertEqual(lowResults[0].0.id, "l")
    }

    func testSearchByTitle() throws {
        let match = makeItem(id: "a", title: "SwiftUI tips")
        let noMatch = makeItem(id: "b", title: "Unrelated")
        try db.dbWriter.write { d in try match.insert(d); try noMatch.insert(d) }

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, search: "swift")
        }
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].0.id, "a")
    }

    func testSearchByURL() throws {
        let match = makeItem(id: "a", url: "https://swift.org/blog")
        let noMatch = makeItem(id: "b", url: "https://python.org")
        try db.dbWriter.write { d in try match.insert(d); try noMatch.insert(d) }

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, search: "swift.org")
        }
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].0.id, "a")
    }

    func testOrderedByChangeSeqDesc() throws {
        let first = makeItem(id: "first", changeSeq: 1)
        let second = makeItem(id: "second", changeSeq: 2)
        try db.dbWriter.write { d in try first.insert(d); try second.insert(d) }

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, search: "")
        }
        XCTAssertEqual(results.map { $0.0.id }, ["second", "first"])
    }

    func testTagsJoinedCorrectly() throws {
        let item = makeItem(id: "i1")
        let tag = Tag(id: "t1", userId: "u", name: "swift")
        let itemTag = ItemTag(itemId: "i1", tagId: "t1")
        try db.dbWriter.write { d in
            try item.insert(d)
            try tag.insert(d)
            try itemTag.insert(d)
        }

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, search: "")
        }
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].1.map(\.name), ["swift"])
    }

    func testCombinedTypeAndPriorityFilter() throws {
        let videoHigh = makeItem(id: "vh", type: .video, priority: .high)
        let videoLow = makeItem(id: "vl", type: .video, priority: .low)
        let articleHigh = makeItem(id: "ah", type: .article, priority: .high)
        try db.dbWriter.write { d in
            try videoHigh.insert(d); try videoLow.insert(d); try articleHigh.insert(d)
        }

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: .video, priority: .high, search: "")
        }
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results[0].0.id, "vh")
    }
}

// MARK: - archiveItem mutation tests

final class ArchiveItemTests: XCTestCase {
    var db: AppDatabase!

    override func setUp() {
        db = AppDatabase.makeInMemory()
    }

    func testArchiveSetsStatusAndBumpsChangeSeq() throws {
        let item = makeItem(id: "a1", changeSeq: 5)
        try db.dbWriter.write { d in try item.insert(d) }

        try archiveItem(item, in: db)

        let fetched = try db.dbWriter.read { d in try StashItem.fetchOne(d, key: "a1") }
        XCTAssertEqual(fetched?.status, .archived)
        XCTAssertEqual(fetched?.changeSeq, 6) // max(5) + 1
    }

    func testArchiveChangeSeqIsMaxPlusOne() throws {
        // Two items, max seq = 10
        let a = makeItem(id: "a", changeSeq: 3)
        let b = makeItem(id: "b", changeSeq: 10)
        try db.dbWriter.write { d in try a.insert(d); try b.insert(d) }

        try archiveItem(a, in: db)

        let fetched = try db.dbWriter.read { d in try StashItem.fetchOne(d, key: "a") }
        XCTAssertEqual(fetched?.changeSeq, 11) // max(10) + 1
    }

    func testArchivedItemExcludedFromQuery() throws {
        let item = makeItem(id: "a1", status: .unread)
        try db.dbWriter.write { d in try item.insert(d) }

        try archiveItem(item, in: db)

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, search: "")
        }
        XCTAssertTrue(results.isEmpty)
    }
}
