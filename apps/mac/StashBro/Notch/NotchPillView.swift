// apps/mac/StashBro/Notch/NotchPillView.swift
import SwiftUI
import GRDB

struct NotchPillView: View {
    let db: AppDatabase
    let syncEngine: SyncEngine?
    let onExpand: () -> Void
    let onCollapse: () -> Void

    @State private var unreadCount = 0

    var body: some View {
        HStack(spacing: 7) {
            RoundedRectangle(cornerRadius: 5)
                .fill(Color(red: 0.784, green: 0.478, blue: 0.220))
                .frame(width: 18, height: 18)
                .overlay(Text("S").font(.system(size: 10, weight: .bold)).foregroundStyle(.white))

            Text("StashBro")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Color.white.opacity(0.82))

            if unreadCount > 0 {
                Text("\(unreadCount)")
                    .font(.system(size: 11, weight: .semibold))
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(Color(red: 0.784, green: 0.478, blue: 0.220))
                    .foregroundStyle(.white)
                    .cornerRadius(99)
            }
        }
        .frame(width: 192, height: 30)
        .background(Color(red: 0.039, green: 0.039, blue: 0.047))
        // ponytail: UnevenRoundedRectangle (macOS 14+) replaces custom NSBezierPath shape
        .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 16, bottomTrailingRadius: 16))
        .onHover { hovering in if hovering { onExpand() } }
        .onTapGesture { onExpand() }
        .task { await loadCount() }
    }

    private func loadCount() async {
        unreadCount = (try? await db.dbWriter.read { dbConn in
            try StashItem.filter(Column("status") == "unread" && Column("deleted_at") == nil).fetchCount(dbConn)
        }) ?? 0
    }
}
