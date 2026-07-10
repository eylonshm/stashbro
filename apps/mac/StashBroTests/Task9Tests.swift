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
        XCTAssertEqual(item?.changeSeq, 0)
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
