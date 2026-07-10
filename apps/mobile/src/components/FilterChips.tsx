import React from 'react'
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native'

interface Props<T extends string> {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}

export function FilterChips<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.chip, value === opt.value && styles.active]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={[styles.text, value === opt.value && styles.activeText]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 6, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(18,19,28,.09)' },
  active: { backgroundColor: '#C87A38', borderColor: '#C87A38' },
  text: { fontSize: 12, fontWeight: '500', color: '#5E6175' },
  activeText: { color: '#fff' },
})
