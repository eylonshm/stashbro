// apps/mac/StashBro/Sync/SyncChange.swift
import Foundation

// Mirrors packages/shared/src/types.ts SyncChange (snake_case wire, camelCase Swift).
// created_at included per Phase 1 gate contract.
struct SyncChange: Codable {
    var id: String
    var changeSeq: Int
    var createdAt: Date       // ISO-8601; included per Phase 1 gate fix
    var updatedAt: Date
    var deletedAt: Date?
    var url: String
    var title: String
    var description: String?
    var thumbnailUrl: String?
    var faviconUrl: String?
    var domain: String
    var type: ItemType
    var status: ItemStatus
    var priority: ItemPriority
    var tagNames: [String]
    var readingTimeSeconds: Int? = nil

    // Explicit snake_case mapping for wire format - don't rely on future client's decoder strategy
    enum CodingKeys: String, CodingKey {
        case id
        case changeSeq = "change_seq"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
        case url, title, description
        case thumbnailUrl = "thumbnail_url"
        case faviconUrl = "favicon_url"
        case domain, type, status, priority
        case tagNames = "tag_names"
        case readingTimeSeconds = "reading_time_seconds"
    }
}
