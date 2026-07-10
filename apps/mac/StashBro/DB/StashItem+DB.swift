// apps/mac/StashBro/DB/StashItem+DB.swift
import Foundation
import GRDB

// ISO-8601 with milliseconds, matching server contract: "2026-01-01T12:00:00.000Z"
private let serverDateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
    f.timeZone = TimeZone(abbreviation: "UTC")!
    return f
}()

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
    static let databaseDateEncodingStrategy = DatabaseDateEncodingStrategy.formatted(serverDateFormatter)
    static let databaseDateDecodingStrategy = DatabaseDateDecodingStrategy.formatted(serverDateFormatter)
}

// Relationship to tags
extension StashItem {
    static let itemTags = hasMany(ItemTag.self, using: ForeignKey(["item_id"]))
    static let tags = hasMany(Tag.self, through: itemTags, using: ItemTag.tag)
}
