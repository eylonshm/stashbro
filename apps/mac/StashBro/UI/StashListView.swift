// apps/mac/StashBro/UI/StashListView.swift
// ponytail: stub - Task 6 will implement the real list UI
import SwiftUI

enum ListStyle { case popover, notch }

struct StashListView: View {
    let db: AppDatabase
    let syncEngine: SyncEngine?
    let style: ListStyle

    var body: some View {
        Text("StashBro - coming soon")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
