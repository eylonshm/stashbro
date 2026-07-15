import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme, SPACING } from '../hooks/useTheme'

interface EmptyStateProps {
  title: string
  subtitle: string
}

export function EmptyState({ title, subtitle }: EmptyStateProps) {
  const theme = useTheme()
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: theme.meta }]}>{subtitle}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, paddingTop: 80 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: SPACING.sm },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
})
