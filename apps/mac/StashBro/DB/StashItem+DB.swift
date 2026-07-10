// apps/mac/StashBro/DB/StashItem+DB.swift
import Foundation
import GRDB

// ISO-8601 with milliseconds, matching server contract: "2026-01-01T12:00:00.000Z"
// DateFormatter is NOT thread-safe; use per-thread instances via Thread.threadDictionary.
private func serverDateFormatter() -> DateFormatter {
    let key = "com.stashbro.serverDateFormatter"
    if let cached = Thread.current.threadDictionary[key] as? DateFormatter { return cached }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
    f.timeZone = TimeZone(abbreviation: "UTC")!
    Thread.current.threadDictionary[key] = f
    return f
}

enum ItemType: String, Codable, DatabaseValueConvertible {
    case video, post, article, other
}
enum ItemStatus: String, Codable, DatabaseValueConvertible {
    case unread, archived
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

    static let databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static let databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase
    // ponytail: thread-local formatter - DateFormatter is not thread-safe
    static let databaseDateEncodingStrategy = DatabaseDateEncodingStrategy.custom { date -> (any DatabaseValueConvertible)? in
        serverDateFormatter().string(from: date)   // String is DatabaseValueConvertible
    }
    static let databaseDateDecodingStrategy = DatabaseDateDecodingStrategy.custom { dbValue -> Date? in
        guard let string = String.fromDatabaseValue(dbValue) else { return nil }
        return serverDateFormatter().date(from: string)
    }
}

// Relationship to tags
extension StashItem {
    static let itemTags = hasMany(ItemTag.self, using: ForeignKey(["item_id"]))
    static let tags = hasMany(Tag.self, through: itemTags, using: ItemTag.tag)
}
