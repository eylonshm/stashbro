import React from 'react'
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Image } from 'expo-image'
import * as Linking from 'expo-linking'
import * as Clipboard from 'expo-clipboard'
import { useTheme, SPACING } from '../hooks/useTheme'
import type { LocalItem } from '../hooks/useItems'

interface ItemRowProps {
  item: LocalItem
  onArchive: (item: LocalItem) => void
  onMarkRead: (item: LocalItem) => void
}

const SCREEN_W = Dimensions.get('window').width
const ACTION_W = 84            // width of one action button
const LEFT_REVEAL = ACTION_W       // Read (1 button) revealed on swipe right
const RIGHT_REVEAL = ACTION_W * 2  // Copy + Archive revealed on swipe left
const FULL = SCREEN_W * 0.4        // drag past this on release = trigger primary action

const READ_COLOR = '#3A7BD5'
const COPY_COLOR = '#6B7280'

function formatReadingTime(seconds: number): string {
  return seconds < 60 ? '< 1 min' : `${Math.round(seconds / 60)} min`
}

function ActionButton({ label, glyph, color, width, onPress }: { label: string; glyph: string; color: string; width: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.action, { backgroundColor: color, width }]}>
      <Text style={styles.actionGlyph}>{glyph}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  )
}

export function ItemRow({ item, onArchive, onMarkRead }: ItemRowProps) {
  const theme = useTheme()
  const typeBadge = theme.typeBadge[item.type as keyof typeof theme.typeBadge] ?? theme.typeBadge.other
  const tags = item.tag_names.slice(0, 2)

  const tx = useSharedValue(0)

  const close = () => { tx.value = withSpring(0, { damping: 20, stiffness: 220 }) }
  const doRead = () => { close(); onMarkRead(item) }
  const doArchive = () => { close(); onArchive(item) }
  const doCopy = () => { close(); void Clipboard.setStringAsync(item.url) }

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])  // only claim horizontal drags
    .failOffsetY([-10, 10])    // let the FlatList handle vertical scroll
    .onChange((e) => {
      const next = tx.value + e.changeX
      // allow overscroll a little past the reveal, clamp to screen width
      tx.value = Math.max(-SCREEN_W, Math.min(SCREEN_W, next))
    })
    .onEnd(() => {
      const x = tx.value
      if (x > FULL) { runOnJS(doRead)(); return }
      if (x < -FULL) { runOnJS(doArchive)(); return }
      if (x > LEFT_REVEAL / 2) { tx.value = withSpring(LEFT_REVEAL, { damping: 20, stiffness: 220 }); return }
      if (x < -RIGHT_REVEAL / 2) { tx.value = withSpring(-RIGHT_REVEAL, { damping: 20, stiffness: 220 }); return }
      tx.value = withSpring(0, { damping: 20, stiffness: 220 })
    })

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }))
  // Action layers fade/grow with the drag so nothing shows at rest.
  const leftStyle = useAnimatedStyle(() => ({ opacity: tx.value > 4 ? 1 : 0 }))
  const rightStyle = useAnimatedStyle(() => ({ opacity: tx.value < -4 ? 1 : 0 }))

  return (
    <View style={styles.wrap}>
      {/* Left actions (revealed by swiping right): Read */}
      <Animated.View style={[styles.actionsLeft, leftStyle]}>
        <ActionButton label="Read" glyph="✓" color={READ_COLOR} width={LEFT_REVEAL} onPress={doRead} />
      </Animated.View>
      {/* Right actions (revealed by swiping left): Copy, Archive */}
      <Animated.View style={[styles.actionsRight, rightStyle]}>
        <ActionButton label="Copy" glyph="⧉" color={COPY_COLOR} width={ACTION_W} onPress={doCopy} />
        <ActionButton label="Archive" glyph="🗄" color={theme.accent} width={ACTION_W} onPress={doArchive} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          <Pressable
            onPress={() => (tx.value !== 0 ? close() : Linking.openURL(item.url))}
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
                {item.reading_time_seconds != null ? (
                  <Text style={[styles.domain, { color: theme.meta }]} numberOfLines={1}>
                    {formatReadingTime(item.reading_time_seconds)}
                  </Text>
                ) : null}
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
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  actionsLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, flexDirection: 'row' },
  actionsRight: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  action: { justifyContent: 'center', alignItems: 'center', gap: 3 },
  actionGlyph: { color: '#FFF', fontSize: 18 },
  actionLabel: { color: '#FFF', fontSize: 12, fontWeight: '600' },
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
})
