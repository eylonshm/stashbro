// apps/mac/StashBro/Sync/ItemTypeDetector.swift
import Foundation

// ponytail: detectItemType duplicated from shared package; Swift can't consume TS packages
func detectItemType(url: String) -> ItemType {
    let domainMap: [String: ItemType] = [
        "youtube.com": .video, "youtu.be": .video, "vimeo.com": .video,
        "x.com": .post, "twitter.com": .post, "reddit.com": .post, "threads.net": .post,
    ]
    guard let host = URL(string: url)?.host?.replacingOccurrences(of: "www.", with: "") else { return .article }
    return domainMap.first(where: { host == $0.key || host.hasSuffix(".\($0.key)") })?.value ?? .article
}
