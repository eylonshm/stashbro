// apps/mac/StashBro/Notch/NotchPanelView.swift
import SwiftUI

struct NotchPanelView: View {
    let db: AppDatabase
    let syncEngine: () -> SyncEngine?  // ponytail: closure for live engine after reconnect
    let onCollapse: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Notch cutout area - sits above the physical notch
            Color.black.frame(height: 30)

            // Header
            HStack {
                HStack(spacing: 7) {
                    RoundedRectangle(cornerRadius: 5)
                        .fill(Color(red: 0.784, green: 0.478, blue: 0.220))
                        .frame(width: 16, height: 16)
                        .overlay(Text("S").font(.system(size: 9, weight: .bold)).foregroundStyle(.white))
                    Text("StashBro")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white.opacity(0.9))
                }
                Spacer()
                Button("Open App") { NSApp.activate() } // macOS 14+ API; deployment target is 14
                    .buttonStyle(.plain)
                    .font(.system(size: 11))
                    .foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
            }
            .padding(.horizontal, 16).padding(.vertical, 10)

            Divider().opacity(0.1)

            // Reading list
            StashListView(db: db, syncEngine: syncEngine, style: .notch)

            Divider().opacity(0.1)

            // Footer save hint
            HStack(spacing: 5) {
                Text("Save:")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.38))
                Group {
                    Text("⌘").font(.system(size: 10)) + Text("⇧").font(.system(size: 10)) + Text("S").font(.system(size: 10))
                }
                .padding(.horizontal, 5).padding(.vertical, 1)
                .background(Color.white.opacity(0.10))
                .cornerRadius(4)
                .foregroundStyle(.white.opacity(0.55))
            }
            .padding(.vertical, 8)
        }
        .frame(width: 360)
        .background(Color(red: 0.055, green: 0.055, blue: 0.071).opacity(0.97))
        .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 18, bottomTrailingRadius: 18))
        // Collapse when clicking outside is handled by AppKit event monitor in NotchWindowController
        .onTapGesture { } // absorb taps inside panel so they don't trigger outside-click dismiss
    }
}
