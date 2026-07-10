// apps/mac/StashBro/DB/StashItem+Tags.swift
// ponytail: split from StashItem+DB.swift so widget target can omit Tag+DB.swift
import GRDB

extension StashItem {
    static let itemTags = hasMany(ItemTag.self, using: ForeignKey(["item_id"]))
    static let tags = hasMany(Tag.self, through: itemTags, using: ItemTag.tag)
}
