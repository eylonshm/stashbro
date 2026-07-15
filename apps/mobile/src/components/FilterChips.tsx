import React from 'react'
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useTheme } from '../hooks/useTheme'

interface Props<T extends string> {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}

export function FilterChips<T extends string>({ options, value, onChange }: Props<T>) {
  const theme = useTheme()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map(opt => {
        const active = value === opt.value
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, { backgroundColor: active ? theme.accent : theme.bg, borderColor: active ? theme.accent : theme.border }]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.text, { color: active ? theme.accentText : theme.secondary }]}>{opt.label}</Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 6, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
  text: { fontSize: 12, fontWeight: '500' },
})
