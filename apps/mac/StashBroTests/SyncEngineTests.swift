// apps/mac/StashBroTests/SyncEngineTests.swift
import XCTest
import GRDB
@testable import StashBro

// MARK: - Mocks

final class MockLocalStore: LocalStoreProtocol {
    var cursor: Int = 0
    var localChanges: [SyncChange] = []
    var appliedChanges: [SyncChange] = []

    func getChangesSince(_ c: Int) throws -> [SyncChange] { localChanges.filter { $0.changeSeq > c } }
    func applyChanges(_ changes: [SyncChange]) throws { appliedChanges.append(contentsOf: changes) }
    func saveLocalItem(_ item: StashItem) throws {}  // ponytail: SyncEngine never calls this
    func getCursor() -> Int { cursor }
    func setCursor(_ c: Int) { cursor = c }
}

final class MockSyncClient: SyncClientProtocol {
    var pushCalled = false
    var pullResult: (changes: [SyncChange], cursor: Int) = ([], 0)
    var shouldThrow = false

    func pushChanges(_ changes: [SyncChange]) async throws -> Int {
        if shouldThrow { throw URLError(.notConnectedToInternet) }
        pushCalled = true
        return changes.count
    }
    func pullChanges(cursor: Int) async throws -> (changes: [SyncChange], cursor: Int) {
        if shouldThrow { throw URLError(.notConnectedToInternet) }
        return pullResult
    }
}

// MARK: - SyncEngine tests (mock store + client)

@MainActor
final class SyncEngineTests: XCTestCase {

    func testSyncPushesLocalAndPullsRemote() async throws {
        let store = MockLocalStore()
        store.localChanges = [SyncChange.make(id: "local-1", changeSeq: 1)]
        let client = MockSyncClient()
        client.pullResult = ([SyncChange.make(id: "remote-1", changeSeq: 2)], 2)
        let engine = SyncEngine(store: store, client: client)

        await engine.sync()

        XCTAssertTrue(client.pushCalled)
        XCTAssertEqual(store.appliedChanges.count, 1)
        XCTAssertEqual(store.appliedChanges[0].id, "remote-1")
        XCTAssertEqual(store.cursor, 2)
    }

    func testSyncSilentOnNetworkError() async {
        let store = MockLocalStore()
        let client = MockSyncClient()
        client.shouldThrow = true
        let engine = SyncEngine(store: store, client: client)
        await XCTAssertNoThrowAsync { await engine.sync() }
    }

    func testOnSyncErrorCalled() async {
        let store = MockLocalStore()
        let client = MockSyncClient()
        client.shouldThrow = true
        var receivedError: Error?
        let engine = SyncEngine(store: store, client: client) { err in receivedError = err }

        await engine.sync()

        XCTAssertNotNil(receivedError)
    }

    func testIsSyncingGuardAndPendingSyncRerun() async throws {
        // Gate actor controls when pullChanges returns
        actor Gate {
            var waiters: [CheckedContinuation<Void, Never>] = []
            var released = false

            func wait() async {
                if released { return }
                await withCheckedContinuation { waiters.append($0) }
            }

            func release() {
                released = true
                waiters.forEach { $0.resume() }
                waiters.removeAll()
            }
        }

        let gate = Gate()
        let pullCountActor = Actor_Counter()

        final class GatedClient: SyncClientProtocol {
            let gate: Gate
            let counter: Actor_Counter
            init(gate: Gate, counter: Actor_Counter) {
                self.gate = gate
                self.counter = counter
            }
            func pushChanges(_ changes: [SyncChange]) async throws -> Int { 0 }
            func pullChanges(cursor: Int) async throws -> (changes: [SyncChange], cursor: Int) {
                await counter.increment()
                await gate.wait()
                return ([], 0)
            }
        }

        let client = GatedClient(gate: gate, counter: pullCountActor)
        let store = MockLocalStore()
        let engine = SyncEngine(store: store, client: client)

        // Start first sync in background - blocks at pullChanges
        let task1 = Task { await engine.sync() }
        // Yield so task1 can start and hit the gate
        try await Task.sleep(nanoseconds: 50_000_000)

        // Second sync while first is in-flight - should set pendingSync and return immediately
        await engine.sync()

        // Release gate - first sync finishes, pendingSync triggers second run
        await gate.release()
        await task1.value
        // Allow pendingSync re-run to complete
        try await Task.sleep(nanoseconds: 100_000_000)

        let count = await pullCountActor.value
        XCTAssertEqual(count, 2) // both syncs executed
    }

    func testCursorPersisted() async {
        let store = MockLocalStore()
        let client = MockSyncClient()
        client.pullResult = ([], 42)
        let engine = SyncEngine(store: store, client: client)

        await engine.sync()

        XCTAssertEqual(store.cursor, 42)
    }
}

// Helper actor for thread-safe counter
actor Actor_Counter {
    private(set) var value = 0
    func increment() { value += 1 }
}

// MARK: - GRDBLocalStore tests (real DB, LWW + tombstone)

final class GRDBLocalStoreTests: XCTestCase {

    private func makeStore() -> (GRDBLocalStore, AppDatabase) {
        let db = AppDatabase.makeInMemory()
        let defaults = UserDefaults(suiteName: "test.\(UUID().uuidString)")!
        let store = GRDBLocalStore(db: db, defaults: defaults)
        return (store, db)
    }

    private func insertItem(_ db: AppDatabase, id: String, title: String, updatedAt: Date) throws {
        let item = StashItem(id: id, userId: "u", url: "https://x.com", title: title,
                             description: nil, thumbnailUrl: nil, faviconUrl: nil,
                             domain: "x.com", type: .article, status: .unread, priority: .medium,
                             createdAt: updatedAt, updatedAt: updatedAt, deletedAt: nil, changeSeq: 1)
        try db.dbWriter.write { try item.insert($0) }
    }

    func testLWWLocalNewerSkips() throws {
        let (store, db) = makeStore()
        let now = Date(timeIntervalSince1970: 1_000_000.000)

        try insertItem(db, id: "x", title: "Local", updatedAt: now)

        // Remote change is older - should be skipped
        let older = SyncChange.make(id: "x", changeSeq: 2, updatedAt: now.addingTimeInterval(-10), title: "Remote")
        try store.applyChanges([older])

        let fetched = try db.dbWriter.read { try StashItem.fetchOne($0, key: "x") }
        XCTAssertEqual(fetched?.title, "Local") // local wins when newer
    }

    func testLWWServerWinsOnTie() throws {
        let (store, db) = makeStore()
        let now = Date(timeIntervalSince1970: 1_000_000.000)

        try insertItem(db, id: "x", title: "Local", updatedAt: now)
        // Read back the DB-normalized date (ms precision after formatter round-trip)
        // so change.updatedAt == existing.updatedAt exactly
        let dbDate = try db.dbWriter.read { try StashItem.fetchOne($0, key: "x")!.updatedAt }

        let tied = SyncChange.make(id: "x", changeSeq: 2, updatedAt: dbDate, title: "Remote")
        try store.applyChanges([tied])

        let fetched = try db.dbWriter.read { try StashItem.fetchOne($0, key: "x") }
        XCTAssertEqual(fetched?.title, "Remote") // server wins on tie
    }

    func testLWWRemoteNewerApplies() throws {
        let (store, db) = makeStore()
        let now = Date(timeIntervalSince1970: 1_000_000.000)

        try insertItem(db, id: "x", title: "Local", updatedAt: now)

        // Remote is newer - should apply
        let newer = SyncChange.make(id: "x", changeSeq: 2, updatedAt: now.addingTimeInterval(10), title: "Remote")
        try store.applyChanges([newer])

        let fetched = try db.dbWriter.read { try StashItem.fetchOne($0, key: "x") }
        XCTAssertEqual(fetched?.title, "Remote") // remote wins when newer
    }

    func testTombstoneApplied() throws {
        let (store, db) = makeStore()
        let now = Date(timeIntervalSince1970: 1_000_000.000)

        try insertItem(db, id: "x", title: "T", updatedAt: now)

        let deletedAt = now.addingTimeInterval(1)
        let tombstone = SyncChange(id: "x", changeSeq: 2, createdAt: now,
                                   updatedAt: deletedAt, deletedAt: deletedAt,
                                   url: "https://x.com", title: "T", description: nil,
                                   thumbnailUrl: nil, faviconUrl: nil, domain: "x.com",
                                   type: .article, status: .unread, priority: .medium, tagNames: [])
        try store.applyChanges([tombstone])

        let fetched = try db.dbWriter.read { try StashItem.fetchOne($0, key: "x") }
        XCTAssertNotNil(fetched?.deletedAt) // tombstone persisted
    }

    func testCursorStored() {
        let (store, _) = makeStore()
        XCTAssertEqual(store.getCursor(), 0)
        store.setCursor(99)
        XCTAssertEqual(store.getCursor(), 99)
    }

    func testGetChangesSinceFiltersOnChangeSeq() throws {
        let (store, db) = makeStore()
        let now = Date()

        // Insert two items with different changeSeq
        let item1 = StashItem(id: "a", userId: "u", url: "https://a.com", title: "A",
                               description: nil, thumbnailUrl: nil, faviconUrl: nil,
                               domain: "a.com", type: .article, status: .unread, priority: .medium,
                               createdAt: now, updatedAt: now, deletedAt: nil, changeSeq: 5)
        let item2 = StashItem(id: "b", userId: "u", url: "https://b.com", title: "B",
                               description: nil, thumbnailUrl: nil, faviconUrl: nil,
                               domain: "b.com", type: .article, status: .unread, priority: .medium,
                               createdAt: now, updatedAt: now, deletedAt: nil, changeSeq: 10)
        try db.dbWriter.write {
            try item1.insert($0)
            try item2.insert($0)
        }

        let changes = try store.getChangesSince(7)
        XCTAssertEqual(changes.count, 1)
        XCTAssertEqual(changes[0].id, "b") // only changeSeq=10 > 7
    }

    func testNewItemFromServerApplied() throws {
        let (store, db) = makeStore()
        let now = Date(timeIntervalSince1970: 1_000_000.000)

        let change = SyncChange(id: "new", changeSeq: 5, createdAt: now, updatedAt: now,
                                deletedAt: nil, url: "https://new.com", title: "New",
                                description: nil, thumbnailUrl: nil, faviconUrl: nil,
                                domain: "new.com", type: .article, status: .unread,
                                priority: .medium, tagNames: ["swift", "mac"])
        try store.applyChanges([change])

        let fetched = try db.dbWriter.read { try StashItem.fetchOne($0, key: "new") }
        XCTAssertEqual(fetched?.title, "New")
        XCTAssertEqual(fetched?.changeSeq, 5) // server changeSeq preserved, not incremented

        let tagCount = try db.dbWriter.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM item_tags WHERE item_id = 'new'")!
        }
        XCTAssertEqual(tagCount, 2) // both tags linked
    }

    func testTombstoneForUnknownItemCreatesRecord() throws {
        let (store, db) = makeStore()
        let now = Date(timeIntervalSince1970: 1_000_000.000)
        let deletedAt = now.addingTimeInterval(1)

        let tombstone = SyncChange(id: "ghost", changeSeq: 3, createdAt: now,
                                   updatedAt: deletedAt, deletedAt: deletedAt,
                                   url: "https://x.com", title: "Ghost",
                                   description: nil, thumbnailUrl: nil, faviconUrl: nil,
                                   domain: "x.com", type: .article, status: .unread,
                                   priority: .medium, tagNames: [])
        try store.applyChanges([tombstone])

        let fetched = try db.dbWriter.read { try StashItem.fetchOne($0, key: "ghost") }
        XCTAssertNotNil(fetched)
        XCTAssertNotNil(fetched?.deletedAt) // tombstone created even for unknown item
    }

    @MainActor
    func testAppliedItemsNotRepushed() async throws {
        let (store, db) = makeStore()
        _ = db // confirm in-memory DB wired to store

        let client = MockSyncClient()
        let newCursor = 10
        client.pullResult = ([SyncChange.make(id: "r1", changeSeq: 5),
                              SyncChange.make(id: "r2", changeSeq: 10)], newCursor)
        let engine = SyncEngine(store: store, client: client)

        await engine.sync() // applies r1 (seq=5) + r2 (seq=10), sets cursor=10

        let pending = try store.getChangesSince(store.getCursor())
        XCTAssertTrue(pending.isEmpty) // no echo: server seqs ≤ newCursor are never re-pushed
    }
}

// MARK: - Helpers

func XCTAssertNoThrowAsync(_ block: () async -> Void) async {
    await block()
}

extension SyncChange {
    static func make(id: String, changeSeq: Int, updatedAt: Date = Date(), title: String = "Test") -> SyncChange {
        SyncChange(id: id, changeSeq: changeSeq, createdAt: updatedAt, updatedAt: updatedAt,
                   deletedAt: nil, url: "https://example.com", title: title, description: nil,
                   thumbnailUrl: nil, faviconUrl: nil, domain: "example.com",
                   type: .article, status: .unread, priority: .medium, tagNames: [])
    }
}
