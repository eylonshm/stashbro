import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking, Pressable } from 'react-native'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import type { LocalItem } from '../hooks/useItems.js'
import { useTheme } from '../hooks/useTheme.js'

const THUMB_BG: Record<string, string> = {
  video: '#CC0000', post: '#1C1C1C', article: '#3A3A5C', other: '#5A2A8C',
}

// ponytail: plain integer arithmetic, no locale/timezone traps
function relativeAge(createdAt: string): string {
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  if (secs < 60) return 'now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  const days = Math.floor(secs / 86400)
  if (days < 14) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

export function ItemRow({
  item,
  onArchive,
  onMarkRead,
}: {
  item: LocalItem
  onArchive: (item: LocalItem) => void
  onMarkRead: (item: LocalItem) => void
}) {
  const theme = useTheme()
  const typeColor = theme.typeBadge[item.type as keyof typeof theme.typeBadge] ?? theme.typeBadge.article
  const priorityBarColor = item.priority === 'high' ? '#D95A28' : item.priority === 'low' ? '#9EA1B4' : '#D9922A'

  const renderRightActions = () => (
    <View style={styles.swipeActions}>
      {item.status === 'unread' && (
        <Pressable style={styles.readAction} onPress={() => onMarkRead(item)}>
          <Text style={styles.actionText}>Read</Text>
        </Pressable>
      )}
      <Pressable style={styles.archiveAction} onPress={() => onArchive(item)}>
        <Text style={styles.actionText}>Archive</Text>
      </Pressable>
    </View>
  )

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <TouchableOpacity
        style={[styles.row, { backgroundColor: theme.bg }]}
        onPress={() => Linking.openURL(item.url)}
        activeOpacity={0.7}
      >
        <View style={[styles.bar, { backgroundColor: priorityBarColor }]} />
        <View style={[styles.thumb, { backgroundColor: THUMB_BG[item.type] ?? '#888' }]} />
        <View style={styles.info}>
          {/* read items dimmed to signal consumed */}
          <Text
            style={[styles.title, { color: theme.text, opacity: item.status === 'read' ? 0.65 : 1 }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
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
            <Text style={[styles.age, { color: theme.meta }]}>· {relativeAge(item.created_at)}</Text>
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
  age: { fontSize: 11 },
  swipeActions: { flexDirection: 'row' },
  readAction: { backgroundColor: '#3A7BD5', justifyContent: 'center', alignItems: 'center', width: 80 },
  archiveAction: { backgroundColor: '#C87A38', justifyContent: 'center', alignItems: 'center', width: 80 },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '600' },
})
