import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { Swipeable } from 'react-native-gesture-handler'
import * as Linking from 'expo-linking'
import { useTheme, SPACING } from '../hooks/useTheme'
import type { LocalItem } from '../hooks/useItems'

interface ItemRowProps {
  item: LocalItem
  onArchive: (item: LocalItem) => void
  onMarkRead: (item: LocalItem) => void
}

function SwipeAction({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.swipeAction, { backgroundColor: color }]}>
      <Text style={styles.swipeLabel}>{label}</Text>
    </Pressable>
  )
}

export function ItemRow({ item, onArchive, onMarkRead }: ItemRowProps) {
  const theme = useTheme()
  const typeBadge = theme.typeBadge[item.type as keyof typeof theme.typeBadge] ?? theme.typeBadge.other
  // tag_names is string[] from useItems
  const tags = item.tag_names.slice(0, 2)

  const renderRightActions = () => (
    <View style={styles.swipeRow}>
      <SwipeAction label="Read" color="#3A7BD5" onPress={() => onMarkRead(item)} />
      <SwipeAction label="Archive" color={theme.accent} onPress={() => onArchive(item)} />
    </View>
  )

  return (
    <Swipeable renderRightActions={renderRightActions} overshootFriction={8}>
      <Pressable
        onPress={() => Linking.openURL(item.url)}
        style={[styles.row, { backgroundColor: theme.bg }]}
      >
        {/* Favicon */}
        <View style={[styles.faviconWrap, { backgroundColor: theme.searchBg }]}>
          {item.favicon_url ? (
            <Image source={{ uri: item.favicon_url }} style={styles.favicon} contentFit="contain" />
          ) : (
            <Text style={[styles.faviconFallback, { color: theme.meta }]}>
              {(item.domain || item.title || '?')[0].toUpperCase()}
            </Text>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {item.title || item.url}
            </Text>
            {item.priority === 'high' && <View style={styles.highDot} />}
          </View>

          <View style={styles.metaRow}>
            {item.domain ? (
              <Text style={[styles.domain, { color: theme.meta }]} numberOfLines={1}>
                {item.domain}
              </Text>
            ) : null}
            <View style={[styles.typePill, { backgroundColor: typeBadge.bg }]}>
              <Text style={[styles.typeText, { color: typeBadge.fg }]}>{item.type}</Text>
            </View>
          </View>

          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map(t => (
                <View key={t} style={[styles.tag, { backgroundColor: theme.tagBg }]}>
                  <Text style={[styles.tagText, { color: theme.tagText }]}>{t.trim()}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Thumbnail */}
        {item.thumbnail_url ? (
          <Image
            source={{ uri: item.thumbnail_url }}
            style={styles.thumbnail}
            contentFit="cover"
            transition={200}
          />
        ) : null}
      </Pressable>
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: SPACING.lg, gap: 12 },
  faviconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  favicon: { width: 20, height: 20 },
  faviconFallback: { fontSize: 16, fontWeight: '600' },
  content: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  title: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  highDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E85D3A', marginTop: 7 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  domain: { fontSize: 12 },
  typePill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  typeText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  tagRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { fontSize: 11 },
  thumbnail: { width: 56, height: 56, borderRadius: 8 },
  swipeRow: { flexDirection: 'row' },
  swipeAction: { justifyContent: 'center', alignItems: 'center', width: 72 },
  swipeLabel: { color: '#FFF', fontSize: 12, fontWeight: '600' },
})
