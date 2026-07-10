// apps/mac/StashBro/DB/Tag+DB.swift
import Foundation
import GRDB

struct Tag: Identifiable, Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "tags"
    var id: String
    var userId: String
    var name: String

    static let databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static let databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase
}

struct ItemTag: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "item_tags"
    var itemId: String
    var tagId: String

    static let tag = belongsTo(Tag.self, using: ForeignKey(["tag_id"]))

    static let databaseColumnDecodingStrategy = DatabaseColumnDecodingStrategy.convertFromSnakeCase
    static let databaseColumnEncodingStrategy = DatabaseColumnEncodingStrategy.convertToSnakeCase
}
