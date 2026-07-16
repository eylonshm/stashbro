// apps/mac/StashBro/Notch/NotchPanelView.swift
import SwiftUI

extension Notification.Name {
    static let openManualAddURL = Notification.Name("openManualAddURL")
}

struct NotchPanelView: View {
    let db: AppDatabase
    let syncEngine: () -> SyncEngine?  // ponytail: closure for live engine after reconnect
    var notchHeight: CGFloat = 32      // physical notch height - the cutout strip over the notch
    var width: CGFloat = 640           // = open notch width (NotchWindowController.openWidth)

    // Inset content away from the NotchShape's concave top corners and rounded bottom so nothing
    // clips or spills past the edges (boring.notch pads its content the same way).
    private let hInset: CGFloat = 20
    private let bottomInset: CGFloat = 14

    var body: some View {
        VStack(spacing: 0) {
            // Notch cutout strip - sits over the physical notch. Transparent; the black NotchShape
            // (from NotchRootView) shows through, matching the notch.
            Color.clear.frame(height: notchHeight)

            VStack(spacing: 0) {
                // Header
                HStack {
                    HStack(spacing: 5) {
                        Image("BrandLogo")
                            .resizable()
                            .interpolation(.high)
                            .frame(width: 24, height: 24)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        Text("StashBro")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white.opacity(0.9))
                    }
                    Spacer()
                    Button("Open App") {
                        NotificationCenter.default.post(name: MainWindowController.openMainWindow, object: nil)
                    } // AppDelegate observes and calls mainWindowController.show()
                        .buttonStyle(.plain)
                        .font(.system(size: 11))
                        .foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
                        .help("Open StashBro main window")
                }
                // +12 matches the search bar's own horizontal inset below, so the logo/title and
                // Open App line up with the search box edges.
                .padding(.horizontal, 12)
                .padding(.vertical, 10)

                Divider().opacity(0.1)

                // Reading list
                StashListView(db: db, syncEngine: syncEngine, style: .notch)

                Divider().opacity(0.1)

                // Footer: add button + save hint
                HStack(spacing: 5) {
                    Button(action: {
                        NotificationCenter.default.post(name: .openManualAddURL, object: nil)
                    }) {
                        HStack(spacing: 3) {
                            Image(systemName: "plus")
                                .font(.system(size: 10, weight: .semibold))
                            Text("Add URL")
                                .font(.system(size: 11))
                        }
                        .foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
                    }
                    .buttonStyle(.plain)
                    .help("Manually add a URL")

                    Spacer()

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
            .padding(.horizontal, hInset)
            .padding(.bottom, bottomInset)
        }
        .frame(width: width)
        // No own background/clip - NotchRootView's NotchShape is the surface.
    }
}
