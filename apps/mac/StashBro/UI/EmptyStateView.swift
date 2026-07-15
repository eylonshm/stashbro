// apps/mac/StashBro/UI/EmptyStateView.swift
import SwiftUI

/// Branded empty state shown when a list has no items. The BrandLogo tile carries its own
/// dark background + honey glyph, so it reads on both light and dark surfaces without tinting.
struct EmptyStateView: View {
    let title: String
    var subtitle: String? = nil
    var compact: Bool = false

    var body: some View {
        VStack(spacing: compact ? 8 : 12) {
            Image("BrandLogo")
                .resizable()
                .interpolation(.high)
                .frame(width: compact ? 40 : 54, height: compact ? 40 : 54)
                .clipShape(RoundedRectangle(cornerRadius: compact ? 10 : 13))
                .opacity(0.9)
            VStack(spacing: 3) {
                Text(title)
                    .font(.system(size: compact ? 13 : 15, weight: .semibold))
                    .foregroundStyle(.secondary)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: compact ? 11 : 12))
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }
}
