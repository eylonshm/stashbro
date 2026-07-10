// apps/mac/StashBro/UI/FilterChipRow.swift
import SwiftUI

struct FilterChipRow<T: Hashable>: View {
    let options: [(label: String, value: T?)]
    @Binding var selection: T?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 5) {
                ForEach(options, id: \.label) { option in
                    Button(option.label) { selection = option.value }
                        .buttonStyle(ChipButtonStyle(isActive: selection == option.value))
                }
            }
            .padding(.horizontal, 12)
        }
    }
}

struct ChipButtonStyle: ButtonStyle {
    let isActive: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 11, weight: .medium))
            .padding(.horizontal, 9).padding(.vertical, 3)
            .background(isActive ? Color(red: 0.784, green: 0.478, blue: 0.220) : Color(NSColor.controlBackgroundColor))
            .foregroundStyle(isActive ? Color.white : Color.secondary)
            .cornerRadius(99)
            .overlay(RoundedRectangle(cornerRadius: 99).stroke(Color(NSColor.separatorColor), lineWidth: 1).opacity(isActive ? 0 : 1))
    }
}
