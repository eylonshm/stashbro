import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, RefreshControl, SafeAreaView } from 'react-native'
import { router } from 'expo-router'
import { useSyncEngine } from '../src/hooks/useSyncEngine'
import { useItems } from '../src/hooks/useItems'
import { useTheme } from '../src/hooks/useTheme'
import { ItemRow } from '../src/components/ItemRow'
import { FilterChips } from '../src/components/FilterChips'
import type { LocalItem } from '../src/hooks/useItems'

type TypeFilter = 'all' | 'video' | 'post' | 'article' | 'other'
type PriorityFilter = 'all' | 'high' | 'low'
type StatusFilter = 'unread' | 'read' | 'archived'

export default function HomeScreen() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unread')
  const theme = useTheme()

  const { items, refresh } = useItems({
    status: statusFilter,
    ...(typeFilter !== 'all' && { type: typeFilter }),
    ...(priorityFilter !== 'all' && { priority: priorityFilter }),
    ...(search && { search }),
  })

  // ponytail: onSyncComplete wires foreground sync → list refresh without extra state
  const { sync, saveLocalItem } = useSyncEngine(refresh)

  // sync() is a stable ref-backed fn - safe before init (no-op) and fixes pull-to-refresh null issue
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await sync()
    refresh()
    setRefreshing(false)
  }, [sync, refresh])

  const [refreshing, setRefreshing] = useState(false)

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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.wordmark, { color: theme.text }]}>Stash<Text style={{ color: theme.accent }}>Bro</Text></Text>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Text style={[styles.gear, { color: theme.meta }]}>⚙</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.searchBar, { backgroundColor: theme.bg, borderColor: theme.border }]}>
        <Text>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search your stash…"
          placeholderTextColor={theme.meta}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>
      {/* Status tabs - unread/read/archived */}
      <FilterChips
        options={[{label:'Unread',value:'unread'},{label:'Read',value:'read'},{label:'Archived',value:'archived'}]}
        value={statusFilter}
        onChange={setStatusFilter}
      />
      <FilterChips
        options={[{label:'All',value:'all'},{label:'Video',value:'video'},{label:'Post',value:'post'},{label:'Article',value:'article'}]}
        value={typeFilter}
        onChange={setTypeFilter}
      />
      <View style={styles.priorityRow}>
        <Text style={[styles.priorityLabel, { color: theme.meta }]}>Priority:</Text>
        <FilterChips
          options={[{label:'All',value:'all'},{label:'High',value:'high'},{label:'Low',value:'low'}]}
          value={priorityFilter}
          onChange={setPriorityFilter}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        renderItem={({ item }) => <ItemRow item={item} onArchive={archive} onMarkRead={markRead} />}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: theme.sep }]} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 8 },
  wordmark: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  gear: { fontSize: 22 },
  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 12, marginTop: 0, padding: 10, borderRadius: 12, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  priorityRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  priorityLabel: { fontSize: 12, fontWeight: '500', marginRight: 4 },
  sep: { height: 1, marginHorizontal: 16 },
})
