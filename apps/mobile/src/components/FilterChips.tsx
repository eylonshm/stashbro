import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme, SPACING } from '../hooks/useTheme'

type Option<T extends string> = { label: string; value: T }

interface FilterChipsProps<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  // bare: drop outer padding so the group can be composed inside a shared scroll row
  bare?: boolean
}

export function FilterChips<T extends string>({ options, value, onChange, bare }: FilterChipsProps<T>) {
  const theme = useTheme()
  return (
    <View style={bare ? styles.rowBare : styles.row}>
      {options.map(o => {
        const active = o.value === value
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.accent : theme.bg,
                borderColor: active ? theme.accent : theme.border,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? theme.accentText : theme.secondary }]}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs },
  rowBare: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '500' },
})
