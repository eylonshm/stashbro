import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, RefreshControl, SafeAreaView } from 'react-native'
import { router } from 'expo-router'
import { useSyncEngine } from '../src/hooks/useSyncEngine.js'
import { useItems } from '../src/hooks/useItems.js'
import { ItemRow } from '../src/components/ItemRow.js'
import { FilterChips } from '../src/components/FilterChips.js'
import { openDatabase } from '../src/db/database.js'

type TypeFilter = 'all' | 'video' | 'post' | 'article' | 'other'
type PriorityFilter = 'all' | 'high' | 'low'

export default function HomeScreen() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [refreshing, setRefreshing] = useState(false)

  const { items, refresh } = useItems({
    ...(typeFilter !== 'all' && { type: typeFilter }),
    ...(priorityFilter !== 'all' && { priority: priorityFilter }),
    ...(search && { search }),
  })

  // ponytail: onSyncComplete wires foreground sync → list refresh without extra state
  const engine = useSyncEngine(refresh)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await engine?.sync()
    refresh()
    setRefreshing(false)
  }, [engine, refresh])

  const archive = useCallback((id: string) => {
    const db = openDatabase()
    // Allocate MAX+1 change_seq so getChangesSince picks this up and pushes to server
    const nextSeq = ((db.getFirstSync<{ seq: number | null }>('SELECT MAX(change_seq) as seq FROM items', [])?.seq) ?? 0) + 1
    db.runSync('UPDATE items SET status=?, updated_at=?, change_seq=? WHERE id=?',
      ['archived', new Date().toISOString(), nextSeq, id])
    refresh()
    void engine?.sync()
  }, [engine, refresh])

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Stash<Text style={styles.accent}>Bro</Text></Text>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Text style={styles.gear}>⚙</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.searchBar}>
        <Text>🔍</Text>
        <TextInput style={styles.searchInput} placeholder="Search your stash…" value={search} onChangeText={setSearch} clearButtonMode="while-editing" />
      </View>
      <FilterChips options={[{label:'All',value:'all'},{label:'Video',value:'video'},{label:'Post',value:'post'},{label:'Article',value:'article'}]} value={typeFilter} onChange={setTypeFilter} />
      <View style={styles.priorityRow}>
        <Text style={styles.priorityLabel}>Priority:</Text>
        <FilterChips options={[{label:'All',value:'all'},{label:'High',value:'high'},{label:'Low',value:'low'}]} value={priorityFilter} onChange={setPriorityFilter} />
      </View>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        renderItem={({ item }) => <ItemRow item={item} onArchive={archive} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECEDF2' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 8 },
  wordmark: { fontSize: 24, fontWeight: '700', color: '#12131C', letterSpacing: -0.5 },
  accent: { color: '#C87A38' },
  gear: { fontSize: 22 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 12, marginTop: 0, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(18,19,28,.09)', gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#12131C' },
  priorityRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  priorityLabel: { fontSize: 12, fontWeight: '500', color: '#9EA1B4', marginRight: 4 },
  sep: { height: 1, backgroundColor: 'rgba(18,19,28,.06)', marginHorizontal: 16 },
})
