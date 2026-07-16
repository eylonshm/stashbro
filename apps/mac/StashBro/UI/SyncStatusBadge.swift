// apps/mac/StashBro/UI/SyncStatusBadge.swift
import SwiftUI

// Compact sync indicator for the list header: spinner while syncing, otherwise a
// colored dot + label reflecting the shared SyncStatusStore.
struct SyncStatusBadge: View {
    @ObservedObject var status: SyncStatusStore

    var body: some View {
        HStack(spacing: 4) {
            if status.state == .syncing {
                ProgressView().controlSize(.mini)
            } else {
                Circle().fill(dotColor).frame(width: 6, height: 6)
            }
            Text(status.label)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
        }
        .help(status.label)
    }

    private var dotColor: Color {
        switch status.state {
        case .synced: return .green
        case .error: return .red
        default: return .secondary
        }
    }
}
