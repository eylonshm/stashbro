// apps/mac/StashBroShareExtension/ShareViewController.swift
import Cocoa
import Foundation

final class ShareViewController: NSViewController {
    override func loadView() {
        self.view = NSView(frame: NSRect(x: 0, y: 0, width: 200, height: 60))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        extractURL { [weak self] url in
            guard let self, let url else { self?.cancel(); return }
            self.writeInboxFile(url: url)
        }
    }

    private func extractURL(completion: @escaping (URL?) -> Void) {
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem else {
            completion(nil); return
        }
        for provider in item.attachments ?? [] {
            if provider.hasItemConformingToTypeIdentifier("public.url") {
                provider.loadItem(forTypeIdentifier: "public.url") { (data, _) in
                    let url = data as? URL ?? (data as? String).flatMap(URL.init(string:))
                    completion(url)
                }
                return
            }
        }
        completion(nil)
    }

    private func writeInboxFile(url: URL) {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.stashbro.app"
        ) else { cancel(); return }

        let inbox = container.appendingPathComponent("inbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)

        let host = url.host?.replacingOccurrences(of: "www.", with: "") ?? url.absoluteString
        let typeMap: [String: String] = [
            "youtube.com": "video", "youtu.be": "video", "vimeo.com": "video",
            "x.com": "post", "twitter.com": "post", "reddit.com": "post", "threads.net": "post",
        ]
        let detectedType = typeMap.first(where: { host == $0.key || host.hasSuffix(".\($0.key)") })?.value ?? "article"

        let itemId = UUID().uuidString
        let payload: [String: String] = [
            "id": itemId,
            "url": url.absoluteString,
            "title": url.absoluteString,
            "domain": host,
            "type": detectedType,
            "priority": "medium",
            "createdAt": ISO8601DateFormatter().string(from: Date()),
        ]

        let file = inbox.appendingPathComponent("\(itemId).json")
        try? JSONEncoder().encode(payload).write(to: file, options: .atomic)

        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: "StashBro", code: 0))
    }
}
