import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, FlatList, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import SegmentedControl from '@react-native-segmented-control/segmented-control'
import { router } from 'expo-router'
import { useSyncEngine, type SyncStatus } from '../src/hooks/useSyncEngine'
import type { Theme } from '../src/hooks/useTheme'
import { useItems } from '../src/hooks/useItems'
import { useTheme, SPACING } from '../src/hooks/useTheme'
import { ItemRow } from '../src/components/ItemRow'
import { FilterChips } from '../src/components/FilterChips'
import { EmptyState } from '../src/components/EmptyState'
import type { LocalItem } from '../src/hooks/useItems'

type TypeFilter = 'all' | 'video' | 'post' | 'article' | 'other'
type PriorityFilter = 'all' | 'high' | 'low'

const STATUS_VALUES = ['unread', 'read', 'archived'] as const
const STATUS_LABELS = ['Unread', 'Read', 'Archived']

export default function HomeScreen() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [statusIndex, setStatusIndex] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const statusFilter = STATUS_VALUES[statusIndex]

  const { items, refresh } = useItems({
    status: statusFilter,
    ...(typeFilter !== 'all' && { type: typeFilter }),
    ...(priorityFilter !== 'all' && { priority: priorityFilter }),
    ...(search && { search }),
  })

  // ponytail: onSyncComplete wires foreground sync → list refresh without extra state
  const { sync, saveLocalItem, status, realtimeConnected } = useSyncEngine(refresh)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await sync()
    refresh()
    setRefreshing(false)
  }, [sync, refresh])

  const archive = useCallback((item: LocalItem) => {
    saveLocalItem({
      id: item.id, url: item.url, title: item.title, description: item.description,
      thumbnail_url: item.thumbnail_url, favicon_url: item.favicon_url, domain: item.domain,
      type: item.type, status: 'archived', priority: item.priority,
      updated_at: new Date().toISOString(), deleted_at: item.deleted_at,
      tag_names: item.tag_names,
    })
    refresh()
    void sync()
  }, [saveLocalItem, sync, refresh])

  const markRead = useCallback((item: LocalItem) => {
    saveLocalItem({
      id: item.id, url: item.url, title: item.title, description: item.description,
      thumbnail_url: item.thumbnail_url, favicon_url: item.favicon_url, domain: item.domain,
      type: item.type, status: 'read', priority: item.priority,
      updated_at: new Date().toISOString(), deleted_at: item.deleted_at,
      tag_names: item.tag_names,
    })
    refresh()
    void sync()
  }, [saveLocalItem, sync, refresh])

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.wordmarkRow}>
          <Text style={[styles.wordmark, { color: theme.text }]}>
            Stash<Text style={{ color: theme.accent }}>Bro</Text>
          </Text>
          <SyncBadge status={status} realtime={realtimeConnected} theme={theme} />
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/tags')} hitSlop={8}>
            <Text style={[styles.headerIcon, { color: theme.meta }]}>#</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
            {/* U+FE0E forces monochrome text glyph instead of the emoji gear */}
            <Text style={[styles.headerIcon, { color: theme.meta }]}>{'⚙︎'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: theme.searchBg }]}>
        <Text style={{ color: theme.meta }}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search your stash..."
          placeholderTextColor={theme.meta}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {/* Status tabs - native segmented control */}
      <View style={styles.segmentWrap}>
        <SegmentedControl
          values={STATUS_LABELS}
          selectedIndex={statusIndex}
          onChange={e => setStatusIndex(e.nativeEvent.selectedSegmentIndex)}
          appearance={theme.isDark ? 'dark' : 'light'}
        />
      </View>

      {/* Type + Priority filters - single scroll row so nothing clips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScrollBox}
        contentContainerStyle={styles.filterScroll}
      >
        <FilterChips
          bare
          options={[
            { label: 'All', value: 'all' },
            { label: 'Video', value: 'video' },
            { label: 'Post', value: 'post' },
            { label: 'Article', value: 'article' },
          ]}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        <View style={[styles.filterDivider, { backgroundColor: theme.border }]} />
        <FilterChips
          bare
          options={[
            { label: 'All', value: 'all' },
            { label: 'High', value: 'high' },
            { label: 'Low', value: 'low' },
          ]}
          value={priorityFilter}
          onChange={setPriorityFilter}
        />
      </ScrollView>

      {/* Item list */}
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <ItemRow item={item} onArchive={archive} onMarkRead={markRead} />
        )}
        ItemSeparatorComponent={() => (
          <View style={[styles.sep, { backgroundColor: theme.sep }]} />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
        }
        contentContainerStyle={[
          styles.listContent,
          items.length === 0 && styles.listEmpty,
        ]}
        ListEmptyComponent={
          <EmptyState
            title={search ? 'No results' : 'Nothing here yet'}
            subtitle={search ? 'Try a different search term' : 'Save a link from Safari or any app using the share sheet'}
          />
        }
      />
    </View>
  )
}

// Compact sync indicator: spinner while syncing, colored dot + label otherwise.
function SyncBadge({ status, realtime, theme }: { status: SyncStatus; realtime: boolean; theme: Theme }) {
  if (status === 'syncing') {
    return (
      <View style={styles.syncBadge}>
        <ActivityIndicator size="small" color={theme.meta} />
        <Text style={[styles.syncBadgeText, { color: theme.meta }]}>Syncing…</Text>
      </View>
    )
  }
  const map: Record<Exclude<SyncStatus, 'syncing'>, { color: string; label: string }> = {
    idle: { color: theme.meta, label: 'Connecting…' },
    synced: { color: theme.typeBadge.article.fg, label: realtime ? 'Live' : 'Synced' },
    error: { color: theme.typeBadge.video.fg, label: 'Sync error' },
    offline: { color: theme.meta, label: 'No server' },
  }
  const { color, label } = map[status]
  return (
    <View style={styles.syncBadge}>
      <View style={[styles.syncDot, { backgroundColor: color }]} />
      <Text style={[styles.syncBadgeText, { color: theme.meta }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.sm,
  },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncDot: { width: 7, height: 7, borderRadius: 3.5 },
  syncBadgeText: { fontSize: 12, fontWeight: '500' },
  wordmark: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  headerIcon: { fontSize: 20, fontWeight: '500' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: SPACING.lg, marginBottom: SPACING.sm,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  segmentWrap: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  filterScrollBox: { flexGrow: 0 },
  filterScroll: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs },
  filterDivider: { width: StyleSheet.hairlineWidth, height: 20, marginHorizontal: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  listContent: { paddingBottom: 24 },
  listEmpty: { flexGrow: 1 },
})
