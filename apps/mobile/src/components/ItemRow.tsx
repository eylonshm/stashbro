import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking, Pressable } from 'react-native'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import type { LocalItem } from '../hooks/useItems.js'
import { useTheme } from '../hooks/useTheme.js'

const THUMB_BG: Record<string, string> = {
  video: '#CC0000', post: '#1C1C1C', article: '#3A3A5C', other: '#5A2A8C',
}

export function ItemRow({ item, onArchive }: { item: LocalItem; onArchive: (item: LocalItem) => void }) {
  const theme = useTheme()
  const typeColor = theme.typeBadge[item.type as keyof typeof theme.typeBadge] ?? theme.typeBadge.article
  const priorityBarColor = item.priority === 'high' ? '#D95A28' : item.priority === 'low' ? '#9EA1B4' : null

  const renderRightActions = () => (
    <Pressable style={styles.archiveAction} onPress={() => onArchive(item)}>
      <Text style={styles.archiveText}>Archive</Text>
    </Pressable>
  )

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <TouchableOpacity
        style={[styles.row, { backgroundColor: theme.bg }]}
        onPress={() => Linking.openURL(item.url)}
        activeOpacity={0.7}
      >
        {priorityBarColor && <View style={[styles.bar, { backgroundColor: priorityBarColor }]} />}
        <View style={[styles.thumb, { backgroundColor: THUMB_BG[item.type] ?? '#888' }]} />
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
          <View style={styles.meta}>
            <Text style={[styles.domain, { color: theme.meta }]}>{item.domain}</Text>
            <View style={[styles.badge, { backgroundColor: typeColor.bg }]}>
              <Text style={[styles.badgeText, { color: typeColor.fg }]}>{item.type.toUpperCase()}</Text>
            </View>
            {item.tag_names.slice(0, 2).map(tag => (
              <View key={tag} style={[styles.tag, { backgroundColor: theme.tagBg }]}>
                <Text style={[styles.tagText, { color: theme.tagText }]}>#{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, gap: 10 },
  bar: { width: 3, borderRadius: 2, alignSelf: 'stretch', marginVertical: 4 },
  thumb: { width: 40, height: 40, borderRadius: 8 },
  info: { flex: 1 },
  title: { fontSize: 14, fontWeight: '500', lineHeight: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  domain: { fontSize: 11 },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
  tag: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 99 },
  tagText: { fontSize: 10, fontWeight: '500' },
  archiveAction: { backgroundColor: '#C87A38', justifyContent: 'center', alignItems: 'center', width: 80 },
  archiveText: { color: '#fff', fontSize: 13, fontWeight: '600' },
})
