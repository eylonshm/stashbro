import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, RefreshControl, SafeAreaView } from 'react-native'
import { router } from 'expo-router'
import { useSyncEngine } from '../src/hooks/useSyncEngine.js'
import { useItems } from '../src/hooks/useItems.js'
import { useTheme } from '../src/hooks/useTheme.js'
import { ItemRow } from '../src/components/ItemRow.js'
import { FilterChips } from '../src/components/FilterChips.js'
import type { LocalItem } from '../src/hooks/useItems.js'

type TypeFilter = 'all' | 'video' | 'post' | 'article' | 'other'
type PriorityFilter = 'all' | 'high' | 'low'

export default function HomeScreen() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const theme = useTheme()

  const { items, refresh } = useItems({
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.wordmark, { color: theme.text }]}>Stash<Text style={styles.accent}>Bro</Text></Text>
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
        renderItem={({ item }) => <ItemRow item={item} onArchive={archive} />}
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
  accent: { color: '#C87A38' },
  gear: { fontSize: 22 },
  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 12, marginTop: 0, padding: 10, borderRadius: 12, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  priorityRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  priorityLabel: { fontSize: 12, fontWeight: '500', marginRight: 4 },
  sep: { height: 1, marginHorizontal: 16 },
})
