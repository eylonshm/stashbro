// apps/mac/StashBroTests/Task9Tests.swift
import XCTest
import GRDB
@testable import StashBro

final class ShareExtensionInboxTests: XCTestCase {

    // MARK: - helpers

    private func makeInbox() throws -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("inbox-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func writeInboxJSON(to inbox: URL, id: String = UUID().uuidString,
                                url: String = "https://example.com/article",
                                domain: String = "example.com",
                                type: String = "article",
                                priority: String = "medium") throws -> URL {
        let iso = ISO8601DateFormatter()
        let payload: [String: String] = [
            "id": id,
            "url": url,
            "title": url,
            "domain": domain,
            "type": type,
            "priority": priority,
            "createdAt": iso.string(from: Date()),
        ]
        let data = try JSONEncoder().encode(payload)
        let file = inbox.appendingPathComponent("\(id).json")
        try data.write(to: file, options: .atomic)
        return file
    }

    // MARK: - tests

    func testIngestWritesItemToDBAndDeletesFile() throws {
        let inbox = try makeInbox()
        let itemId = UUID().uuidString
        let file = try writeInboxJSON(to: inbox, id: itemId, url: "https://swift.org/blog")

        let db = AppDatabase.makeInMemory()
        let defaults = UserDefaults(suiteName: "test.\(UUID().uuidString)")!
        let store = GRDBLocalStore(db: db, defaults: defaults)

        let count = processShareInbox(at: inbox, into: store)

        XCTAssertEqual(count, 1)

        // file deleted
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))

        // item in DB
        let item = try db.dbWriter.read { try StashItem.fetchOne($0, key: itemId) }
        XCTAssertNotNil(item)
        XCTAssertEqual(item?.url, "https://swift.org/blog")
        XCTAssertEqual(item?.domain, "example.com")
        XCTAssertEqual(item?.type, .article)
        XCTAssertEqual(item?.priority, .medium)
        XCTAssertEqual(item?.changeSeq, 1) // MAX(empty)+1 = 1, not 0 (fix: local items must be pushable)
    }

    func testIngestVideoType() throws {
        let inbox = try makeInbox()
        let itemId = UUID().uuidString
        _ = try writeInboxJSON(to: inbox, id: itemId,
                               url: "https://youtube.com/watch?v=abc",
                               domain: "youtube.com", type: "video")

        let db = AppDatabase.makeInMemory()
        let defaults = UserDefaults(suiteName: "test.\(UUID().uuidString)")!
        let store = GRDBLocalStore(db: db, defaults: defaults)

        processShareInbox(at: inbox, into: store)

        let item = try db.dbWriter.read { try StashItem.fetchOne($0, key: itemId) }
        XCTAssertEqual(item?.type, .video)
    }

    func testMalformedJSONDeletedAndSkipped() throws {
        let inbox = try makeInbox()
        let bad = inbox.appendingPathComponent("bad.json")
        try "not json".write(to: bad, atomically: true, encoding: .utf8)

        let db = AppDatabase.makeInMemory()
        let defaults = UserDefaults(suiteName: "test.\(UUID().uuidString)")!
        let store = GRDBLocalStore(db: db, defaults: defaults)

        let count = processShareInbox(at: inbox, into: store)

        XCTAssertEqual(count, 0)
        XCTAssertFalse(FileManager.default.fileExists(atPath: bad.path))

        let items = try db.dbWriter.read { try StashItem.fetchAll($0) }
        XCTAssertTrue(items.isEmpty)
    }

    func testEmptyInboxReturnsZero() throws {
        let inbox = try makeInbox()
        let db = AppDatabase.makeInMemory()
        let defaults = UserDefaults(suiteName: "test.\(UUID().uuidString)")!
        let store = GRDBLocalStore(db: db, defaults: defaults)

        let count = processShareInbox(at: inbox, into: store)
        XCTAssertEqual(count, 0)
    }

    func testMultipleFilesAllIngested() throws {
        let inbox = try makeInbox()
        let id1 = UUID().uuidString
        let id2 = UUID().uuidString
        _ = try writeInboxJSON(to: inbox, id: id1)
        _ = try writeInboxJSON(to: inbox, id: id2)

        let db = AppDatabase.makeInMemory()
        let defaults = UserDefaults(suiteName: "test.\(UUID().uuidString)")!
        let store = GRDBLocalStore(db: db, defaults: defaults)

        let count = processShareInbox(at: inbox, into: store)
        XCTAssertEqual(count, 2)

        let items = try db.dbWriter.read { try StashItem.fetchAll($0) }
        XCTAssertEqual(items.count, 2)

        // inbox empty after ingest
        let remaining = try FileManager.default.contentsOfDirectory(atPath: inbox.path)
        XCTAssertTrue(remaining.isEmpty)
    }
}

// MARK: - Local change_seq allocation tests (fix for local items never being pushed)

final class LocalChangeSeqTests: XCTestCase {

    private func makeStore() -> (AppDatabase, GRDBLocalStore) {
        let db = AppDatabase.makeInMemory()
        let store = GRDBLocalStore(db: db, defaults: UserDefaults(suiteName: "test.\(UUID().uuidString)")!)
        return (db, store)
    }

    private func localItem(id: String = UUID().uuidString, url: String = "https://example.com") -> StashItem {
        let now = Date()
        return StashItem(id: id, userId: "default", url: url, title: url,
                         description: nil, thumbnailUrl: nil, faviconUrl: nil,
                         domain: "example.com", type: .article, status: .unread,
                         priority: .medium, createdAt: now, updatedAt: now,
                         deletedAt: nil, changeSeq: 0)
    }

    // (a) saveURL-equivalent: fresh db, saveLocalItem → getChangesSince(0) returns it
    func testSaveLocalItemAppearsInGetChangesSince() throws {
        let (_, store) = makeStore()
        try store.saveLocalItem(localItem())
        let changes = try store.getChangesSince(0)
        XCTAssertEqual(changes.count, 1)
        XCTAssertGreaterThan(changes[0].changeSeq, 0)
    }

    // (b) inbox ingest → getChangesSince(cursor after prior sync) returns ingested item
    func testIngestAppearsAfterCursorAdvanced() throws {
        let (_, store) = makeStore()

        // Simulate a prior sync: server item at seq=5, cursor moved to 5
        let now = Date()
        let serverChange = SyncChange(
            id: UUID().uuidString, changeSeq: 5, createdAt: now, updatedAt: now,
            deletedAt: nil, url: "https://server.com", title: "Server",
            description: nil, thumbnailUrl: nil, faviconUrl: nil,
            domain: "server.com", type: .article, status: .unread, priority: .medium, tagNames: []
        )
        try store.applyChanges([serverChange])
        store.setCursor(5)

        // Inbox ingest after that sync
        let inbox = FileManager.default.temporaryDirectory
            .appendingPathComponent("inbox-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let id = UUID().uuidString
        let payload: [String: String] = [
            "id": id, "url": "https://local.com", "title": "local",
            "domain": "local.com", "type": "article", "priority": "medium",
            "createdAt": ISO8601DateFormatter().string(from: Date()),
        ]
        try JSONEncoder().encode(payload).write(
            to: inbox.appendingPathComponent("\(id).json"), options: .atomic)
        processShareInbox(at: inbox, into: store)

        // Must appear in next push (getChangesSince current cursor)
        let pending = try store.getChangesSince(store.getCursor())
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending[0].id, id)
    }

    // (c) seq strictly increases across mixed saves; server-applied items not re-pushed
    func testSeqStrictlyIncreasesAndServerItemNotRepushed() throws {
        let (_, store) = makeStore()
        let now = Date()

        // Server-applied item at seq=10
        let serverChange = SyncChange(
            id: UUID().uuidString, changeSeq: 10, createdAt: now, updatedAt: now,
            deletedAt: nil, url: "https://server.com", title: "s",
            description: nil, thumbnailUrl: nil, faviconUrl: nil,
            domain: "server.com", type: .article, status: .unread, priority: .medium, tagNames: []
        )
        try store.applyChanges([serverChange])
        store.setCursor(10)

        // Two local saves
        try store.saveLocalItem(localItem(url: "https://a.com"))
        try store.saveLocalItem(localItem(url: "https://b.com"))

        let pending = try store.getChangesSince(10)
        XCTAssertEqual(pending.count, 2)
        XCTAssertTrue(pending.allSatisfy { $0.changeSeq > 10 })
        // Strictly increasing (no duplicates)
        let seqs = pending.map(\.changeSeq)
        XCTAssertEqual(Set(seqs).count, seqs.count)
    }
}
