// apps/mac/StashBroTests/ReadStatusTests.swift
import XCTest
import GRDB
@testable import StashBro

// MARK: - relativeAge

final class RelativeAgeTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    func testNow()     { XCTAssertEqual(relativeAge(t0, now: t0.addingTimeInterval(30)),        "now") }
    func testMinutes() { XCTAssertEqual(relativeAge(t0, now: t0.addingTimeInterval(300)),        "5m") }
    func testHours()   { XCTAssertEqual(relativeAge(t0, now: t0.addingTimeInterval(10_800)),     "3h") }
    func testDays()    { XCTAssertEqual(relativeAge(t0, now: t0.addingTimeInterval(172_800)),    "2d") }
    func testWeeks()   { XCTAssertEqual(relativeAge(t0, now: t0.addingTimeInterval(1_814_400)),  "3w") }
    // edge: exactly 60s is 1m not "now"
    func testExactlyOneMinute() { XCTAssertEqual(relativeAge(t0, now: t0.addingTimeInterval(60)), "1m") }
    // edge: 13d is still days, 14d flips to weeks
    func test13dStillDays() { XCTAssertEqual(relativeAge(t0, now: t0.addingTimeInterval(86_400 * 13)), "13d") }
    func test14dFlipsWeeks() { XCTAssertEqual(relativeAge(t0, now: t0.addingTimeInterval(86_400 * 14)), "2w") }
}

// MARK: - read status mutations and filtering

private func makeItem(id: String, status: ItemStatus, changeSeq: Int = 0) -> StashItem {
    StashItem(
        id: id, userId: "u", url: "https://example.com", title: "T",
        description: nil, thumbnailUrl: nil, faviconUrl: nil,
        domain: "example.com", type: .article, status: status, priority: .medium,
        createdAt: Date(), updatedAt: Date(), deletedAt: nil, changeSeq: changeSeq
    )
}

final class ReadStatusMutationTests: XCTestCase {
    var db: AppDatabase!
    override func setUp() { db = AppDatabase.makeInMemory() }

    func testSetItemStatusReadBumpsSeq() throws {
        let item = makeItem(id: "a", status: .unread, changeSeq: 1)
        try db.dbWriter.write { d in try item.insert(d) }

        try setItemStatus(item, status: .read, in: db)

        let fetched = try db.dbWriter.read { d in try StashItem.fetchOne(d, key: "a") }
        XCTAssertEqual(fetched?.status, .read)
        XCTAssertEqual(fetched?.changeSeq, 2)  // max(1)+1
    }

    func testReadItemExcludedFromDefaultUnreadQuery() throws {
        let unread = makeItem(id: "u", status: .unread)
        let read   = makeItem(id: "r", status: .read)
        try db.dbWriter.write { d in try unread.insert(d); try read.insert(d) }

        // default status filter is .unread
        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, tag: nil, search: "")
        }
        XCTAssertEqual(results.map(\.0.id), ["u"])
    }

    func testReadStatusFilterReturnsReadItems() throws {
        let unread = makeItem(id: "u", status: .unread)
        let read   = makeItem(id: "r", status: .read)
        try db.dbWriter.write { d in try unread.insert(d); try read.insert(d) }

        let results = try db.dbWriter.read { d in
            try stashListQuery(in: d, type: nil, priority: nil, tag: nil, search: "", status: .read)
        }
        XCTAssertEqual(results.map(\.0.id), ["r"])
    }
}

final class SidebarCountsWithReadTests: XCTestCase {
    var db: AppDatabase!
    override func setUp() { db = AppDatabase.makeInMemory() }

    func testLoadSidebarCountsIncludesRead() throws {
        let u = makeItem(id: "u", status: .unread)
        let r = makeItem(id: "r", status: .read)
        let a = makeItem(id: "a", status: .archived)
        try db.dbWriter.write { d in try u.insert(d); try r.insert(d); try a.insert(d) }

        let counts = try db.dbWriter.read { d in try loadSidebarCounts(in: d) }
        XCTAssertEqual(counts.all, 3)
        XCTAssertEqual(counts.unread, 1)
        XCTAssertEqual(counts.read, 1)
        XCTAssertEqual(counts.archived, 1)
    }

    func testUnreadCountExcludesRead() throws {
        // Widget and notch badge should count only .unread
        let u = makeItem(id: "u", status: .unread)
        let r = makeItem(id: "r", status: .read)
        try db.dbWriter.write { d in try u.insert(d); try r.insert(d) }

        let counts = try db.dbWriter.read { d in try loadSidebarCounts(in: d) }
        XCTAssertEqual(counts.unread, 1, "unread badge must not include read items")
    }
}
