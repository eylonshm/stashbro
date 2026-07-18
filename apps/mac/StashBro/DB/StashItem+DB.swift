// apps/mac/StashBro/DB/StashItem+DB.swift
import Foundation
import GRDB

// ISO-8601 with milliseconds, matching server contract: "2026-01-01T12:00:00.000Z"
// ISO8601DateFormatter is thread-safe per Apple (unlike DateFormatter).
// Guard: testTimestampRoundTrip verifies the exact round-trip format.
private let serverISO: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    f.timeZone = TimeZone(secondsFromGMT: 0)
    return f
}()

enum ItemType: String, Codable, DatabaseValueConvertible {
    case video, post, article, other
}
enum ItemStatus: String, Codable, DatabaseValueConvertible {
    case unread, read, archived
}
enum ItemPriority: String, Codable, DatabaseValueConvertible {
    case low, medium, high
}

struct StashItem: Identifiable, Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "stash_items"

    var id: String
    var userId: String
    var url: String
    var title: String
    var description: String?
    var thumbnailUrl: String?
    var faviconUrl: String?
    var domain: String
    var type: ItemType
    var status: ItemStatus
    var priority: ItemPriority
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date?
    var changeSeq: Int
    var readingTimeSeconds: Int? = nil

    static let databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static let databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase
    static let databaseDateEncodingStrategy = DatabaseDateEncodingStrategy.custom { date -> (any DatabaseValueConvertible)? in
        serverISO.string(from: date)
    }
    static let databaseDateDecodingStrategy = DatabaseDateDecodingStrategy.custom { dbValue -> Date? in
        guard let string = String.fromDatabaseValue(dbValue) else { return nil }
        return serverISO.date(from: string)
    }
}

