import React, { useRef } from 'react'
import { View, Text, Pressable, StyleSheet, Animated, Dimensions } from 'react-native'
import { Image } from 'expo-image'
import { Swipeable } from 'react-native-gesture-handler'
import * as Linking from 'expo-linking'
import * as Clipboard from 'expo-clipboard'
import { useTheme, SPACING } from '../hooks/useTheme'
import type { LocalItem } from '../hooks/useItems'

interface ItemRowProps {
  item: LocalItem
  onArchive: (item: LocalItem) => void
  onMarkRead: (item: LocalItem) => void
}

// Past this drag distance a release triggers the side's primary action (iOS Mail
// full-swipe). Below it, the row just snaps open to reveal the tappable buttons.
const FULL_SWIPE = Dimensions.get('window').width * 0.45

const ACTION_COLORS = { read: '#3A7BD5', copy: '#6B7280' }

function SwipeAction({ label, glyph, color, onPress }: { label: string; glyph: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.swipeAction, { backgroundColor: color }]}>
      <Text style={styles.swipeGlyph}>{glyph}</Text>
      <Text style={styles.swipeLabel}>{label}</Text>
    </Pressable>
  )
}

export function ItemRow({ item, onArchive, onMarkRead }: ItemRowProps) {
  const theme = useTheme()
  const typeBadge = theme.typeBadge[item.type as keyof typeof theme.typeBadge] ?? theme.typeBadge.other
  const tags = item.tag_names.slice(0, 2)

  const swipeRef = useRef<Swipeable>(null)
  // Track live drag per side so a full swipe (past FULL_SWIPE) triggers the primary
  // action, while a small swipe only reveals buttons. Listener attached once per
  // Animated.Value (Swipeable creates it once for the row's lifetime).
  const leftDrag = useRef<Animated.AnimatedInterpolation<string | number> | null>(null)
  const rightDrag = useRef<Animated.AnimatedInterpolation<string | number> | null>(null)
  const leftFull = useRef(false)
  const rightFull = useRef(false)

  const close = () => swipeRef.current?.close()
  const doRead = () => { close(); onMarkRead(item) }
  const doArchive = () => { close(); onArchive(item) }
  const doCopy = async () => { close(); await Clipboard.setStringAsync(item.url) }

  // Left actions (revealed by swiping RIGHT): Read.
  const renderLeftActions = (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<string | number>) => {
    if (leftDrag.current !== dragX) {
      leftDrag.current = dragX
      dragX.addListener(({ value }) => { leftFull.current = Number(value) > FULL_SWIPE })
    }
    return (
      <View style={styles.swipeRow}>
        <SwipeAction label="Read" glyph="✓" color={ACTION_COLORS.read} onPress={doRead} />
      </View>
    )
  }

  // Right actions (revealed by swiping LEFT): Copy, Archive.
  const renderRightActions = (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<string | number>) => {
    if (rightDrag.current !== dragX) {
      rightDrag.current = dragX
      dragX.addListener(({ value }) => { rightFull.current = Number(value) < -FULL_SWIPE })
    }
    return (
      <View style={styles.swipeRow}>
        <SwipeAction label="Copy" glyph="⧉" color={ACTION_COLORS.copy} onPress={doCopy} />
        <SwipeAction label="Archive" glyph="🗄" color={theme.accent} onPress={doArchive} />
      </View>
    )
  }

  // Fired when either side snaps open. Distinguish a full swipe (trigger primary)
  // from a small reveal (leave buttons showing) via the per-side drag flags.
  const onOpen = (direction: 'left' | 'right') => {
    if (direction === 'left' && leftFull.current) doRead()
    else if (direction === 'right' && rightFull.current) doArchive()
  }

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={onOpen}
      leftThreshold={36}
      rightThreshold={36}
      overshootFriction={8}
    >
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
              {(item.domain || item.title || '?').charAt(0).toUpperCase()}
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
  swipeAction: { justifyContent: 'center', alignItems: 'center', width: 76, gap: 3 },
  swipeGlyph: { color: '#FFF', fontSize: 18 },
  swipeLabel: { color: '#FFF', fontSize: 12, fontWeight: '600' },
})
