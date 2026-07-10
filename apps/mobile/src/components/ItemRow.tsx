import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import type { LocalItem } from '../hooks/useItems.js'

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  video: { bg: '#FCEAEA', fg: '#B53030' }, post: { bg: '#EAF0FD', fg: '#2A56A8' },
  article: { bg: '#E8F7EF', fg: '#1F7A47' }, other: { bg: '#F2EDF8', fg: '#6441A0' },
}
const THUMB_BG: Record<string, string> = {
  video: '#CC0000', post: '#1C1C1C', article: '#3A3A5C', other: '#5A2A8C',
}

export function ItemRow({ item, onArchive }: { item: LocalItem; onArchive: (id: string) => void }) {
  const typeColor = TYPE_COLORS[item.type] ?? TYPE_COLORS['article']!
  const priorityBarColor = item.priority === 'high' ? '#D95A28' : item.priority === 'low' ? '#9EA1B4' : null

  return (
    <TouchableOpacity style={styles.row} onPress={() => Linking.openURL(item.url)} activeOpacity={0.7}>
      {priorityBarColor && <View style={[styles.bar, { backgroundColor: priorityBarColor }]} />}
      <View style={[styles.thumb, { backgroundColor: THUMB_BG[item.type] ?? '#888' }]} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <View style={styles.meta}>
          <Text style={styles.domain}>{item.domain}</Text>
          <View style={[styles.badge, { backgroundColor: typeColor.bg }]}>
            <Text style={[styles.badgeText, { color: typeColor.fg }]}>{item.type.toUpperCase()}</Text>
          </View>
          {item.tag_names.slice(0, 2).map(tag => (
            <View key={tag} style={styles.tag}><Text style={styles.tagText}>#{tag}</Text></View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, gap: 10 },
  bar: { width: 3, borderRadius: 2, alignSelf: 'stretch', marginVertical: 4 },
  thumb: { width: 40, height: 40, borderRadius: 8 },
  info: { flex: 1 },
  title: { fontSize: 14, fontWeight: '500', color: '#12131C', lineHeight: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  domain: { fontSize: 11, color: '#9EA1B4' },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
  tag: { backgroundColor: '#ECEDF4', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 99 },
  tagText: { fontSize: 10, fontWeight: '500', color: '#4A4D62' },
})
