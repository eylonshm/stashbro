import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, FlatList, ScrollView, StyleSheet, Pressable, RefreshControl, ActivityIndicator, Modal, Share, Image, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import SegmentedControl from '@react-native-segmented-control/segmented-control'
import { router } from 'expo-router'
import { useSyncEngine, type SyncStatus } from '../src/hooks/useSyncEngine'
import type { Theme } from '../src/hooks/useTheme'
import { useItems } from '../src/hooks/useItems'
import { useTheme, SPACING, ACCENT } from '../src/hooks/useTheme'
import { ItemRow } from '../src/components/ItemRow'
import { FilterChips } from '../src/components/FilterChips'
import { EmptyState } from '../src/components/EmptyState'
import type { LocalItem } from '../src/hooks/useItems'
import { AddURLSheet } from '../src/components/AddURLSheet'
import { genId } from '../src/sync/SQLiteLocalStore'

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
  const { sync, saveLocalItem, status, realtimeConnected, lastError } = useSyncEngine(refresh)
  const [errorModal, setErrorModal] = useState(false)
  const [addUrlVisible, setAddUrlVisible] = useState(false)

  const handleAddUrl = useCallback((item: {
    url: string; title: string; description: string | null
    thumbnail_url: string | null; domain: string; type: string; priority: string
  }) => {
    saveLocalItem({
      id: genId(), url: item.url, title: item.title, description: item.description,
      thumbnail_url: item.thumbnail_url, favicon_url: null, domain: item.domain,
      type: item.type, status: 'unread', priority: item.priority,
      updated_at: new Date().toISOString(), deleted_at: null,
      tag_names: [],
    })
    refresh()
    void sync()
    setAddUrlVisible(false)
  }, [saveLocalItem, sync, refresh])

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
          <Image source={require('../assets/icon.png')} style={styles.wordmarkIcon} />
          <Text style={[styles.wordmark, { color: theme.text }]}>
            Stash<Text style={{ color: theme.accent }}>Bro</Text>
          </Text>
          <Pressable onPress={() => setErrorModal(true)} hitSlop={8}>
            <SyncBadge status={status} realtime={realtimeConnected} theme={theme} />
          </Pressable>
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

      <SyncDetailModal
        visible={errorModal}
        onClose={() => setErrorModal(false)}
        status={status}
        realtime={realtimeConnected}
        error={lastError}
        theme={theme}
        onRetry={() => { void sync() }}
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => setAddUrlVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <AddURLSheet
        visible={addUrlVisible}
        onSave={handleAddUrl}
        onClose={() => setAddUrlVisible(false)}
      />
    </View>
  )
}

// Tap-through detail for the sync badge: shows the full error, selectable + shareable.
function SyncDetailModal({
  visible, onClose, status, realtime, error, theme, onRetry,
}: {
  visible: boolean; onClose: () => void; status: SyncStatus; realtime: boolean
  error: string | null; theme: Theme; onRetry: () => void
}) {
  const stateLine =
    status === 'error' ? 'Last sync failed.'
    : status === 'syncing' ? 'Syncing now…'
    : status === 'offline' ? 'No server configured.'
    : status === 'synced' ? (realtime ? 'Synced - realtime connected.' : 'Synced.')
    : 'Connecting…'
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: theme.bg }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Sync status</Text>
          <Text style={[styles.modalState, { color: theme.secondary }]}>{stateLine}</Text>
          {error ? (
            <>
              <Text style={[styles.modalLabel, { color: theme.meta }]}>Error detail (long-press to select)</Text>
              <ScrollView style={[styles.modalErrorBox, { borderColor: theme.border }]}>
                <Text selectable style={[styles.modalErrorText, { color: theme.text }]}>{error}</Text>
              </ScrollView>
              <Pressable
                onPress={() => { void Share.share({ message: error }) }}
                style={[styles.modalBtn, { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.modalBtnText, { color: theme.accentText }]}>Copy / Share error</Text>
              </Pressable>
            </>
          ) : (
            <Text style={[styles.modalState, { color: theme.meta }]}>No errors. Everything is in sync.</Text>
          )}
          <View style={styles.modalActions}>
            <Pressable onPress={() => { onRetry(); onClose() }} style={[styles.modalBtnSecondary, { borderColor: theme.border }]}>
              <Text style={[styles.modalBtnText, { color: theme.accent }]}>Retry sync</Text>
            </Pressable>
            <Pressable onPress={onClose} style={[styles.modalBtnSecondary, { borderColor: theme.border }]}>
              <Text style={[styles.modalBtnText, { color: theme.secondary }]}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  wordmarkIcon: { width: 30, height: 30, borderRadius: 7 },
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncDot: { width: 7, height: 7, borderRadius: 3.5 },
  syncBadgeText: { fontSize: 12, fontWeight: '500' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
  modalCard: { borderRadius: 14, padding: 20, gap: 10, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalState: { fontSize: 14 },
  modalLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  modalErrorBox: { borderWidth: 1, borderRadius: 8, padding: 10, maxHeight: 240 },
  modalErrorText: { fontSize: 12, fontFamily: 'Menlo' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  modalBtnSecondary: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  modalBtnText: { fontSize: 14, fontWeight: '600' },
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
  // minHeight floors the horizontal ScrollView frame: on device its cross-axis height
  // can collapse and clip the chips (not reproducible in sim). Grows for larger text.
  filterScrollBox: { flexGrow: 0, minHeight: 44 },
  filterScroll: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs },
  filterDivider: { width: StyleSheet.hairlineWidth, height: 20, marginHorizontal: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  listContent: { paddingBottom: 24 },
  listEmpty: { flexGrow: 1 },
  fab: {
    position: 'absolute', right: 16,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: ACCENT,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 6,
    elevation: 8,
  },
  fabIcon: {
    color: '#FFFFFF', fontSize: 28, fontWeight: '300', marginTop: -2,
  },
})
