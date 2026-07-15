import React, { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { openDatabase } from '../src/db/database'
import { SQLiteLocalStore, makeExpoSyncDb } from '../src/sync/SQLiteLocalStore'
import { deleteTagLocal } from '../src/lib/tags'
import { triggerSync } from '../src/hooks/useSyncEngine'
import { useTheme, SPACING } from '../src/hooks/useTheme'

interface Tag { id: string; name: string; count: number }

export default function TagsScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [tags, setTags] = useState<Tag[]>([])
  const userIdRef = useRef('local')

  useEffect(() => {
    load()
    AsyncStorage.getItem('stashbro:userId').then(id => { if (id) userIdRef.current = id })
  }, [])

  const load = useCallback(() => {
    const db = openDatabase()
    setTags(db.getAllSync<Tag>(
      'SELECT t.id, t.name, COUNT(it.item_id) as count FROM tags t LEFT JOIN item_tags it ON it.tag_id = t.id GROUP BY t.id ORDER BY t.name'
    ))
  }, [])

  const deleteTag = useCallback((tag: Tag) => {
    Alert.alert('Delete Tag', `Remove "#${tag.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        const rawDb = openDatabase()
        const syncDb = makeExpoSyncDb(rawDb)
        const store = new SQLiteLocalStore(syncDb, AsyncStorage, userIdRef.current)
        deleteTagLocal(syncDb, store, tag.id)
        load()
        void triggerSync()
      }},
    ])
  }, [load])

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.backBtn, { color: theme.accent }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Tags</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={tags}
        keyExtractor={t => t.id}
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() => deleteTag(item)}
            style={[styles.row, { backgroundColor: theme.bg }]}
          >
            <View style={styles.tagInfo}>
              <Text style={[styles.name, { color: theme.text }]}>#{item.name}</Text>
              <Text style={[styles.count, { color: theme.meta }]}>
                {item.count} {item.count === 1 ? 'item' : 'items'}
              </Text>
            </View>
            <Pressable onPress={() => deleteTag(item)} hitSlop={8}>
              <Text style={styles.deleteBtn}>Delete</Text>
            </Pressable>
          </Pressable>
        )}
        contentContainerStyle={tags.length === 0 ? styles.listEmpty : styles.listPad}
        ItemSeparatorComponent={() => (
          <View style={[styles.sep, { backgroundColor: theme.sep }]} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No tags yet</Text>
            <Text style={[styles.emptySub, { color: theme.meta }]}>
              Add tags when saving links from the share sheet
            </Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm,
  },
  backBtn: { fontSize: 16, fontWeight: '500', width: 60 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: 14,
  },
  tagInfo: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '500' },
  count: { fontSize: 12 },
  deleteBtn: { fontSize: 14, color: '#B53030' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: SPACING.lg },
  listPad: { paddingTop: SPACING.sm },
  listEmpty: { flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: SPACING.sm },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: SPACING.xl },
})
