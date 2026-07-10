import React, { useState, useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { openDatabase } from '../src/db/database.js'
import { router } from 'expo-router'
import { useTheme } from '../src/hooks/useTheme.js'

interface Tag { id: string; name: string; count: number }

export default function TagsScreen() {
  const [tags, setTags] = useState<Tag[]>([])
  const theme = useTheme()

  const load = () => {
    const db = openDatabase()
    setTags(db.getAllSync<Tag>(
      'SELECT t.id, t.name, COUNT(it.item_id) as count FROM tags t LEFT JOIN item_tags it ON it.tag_id = t.id GROUP BY t.id ORDER BY t.name'
    ))
  }

  useEffect(() => { load() }, [])

  const deleteTag = (tag: Tag) => {
    Alert.alert('Delete Tag', `Remove "#${tag.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        const db = openDatabase()
        db.runSync('DELETE FROM item_tags WHERE tag_id = ?', [tag.id])
        db.runSync('DELETE FROM tags WHERE id = ?', [tag.id])
        load()
      }},
    ])
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.surface }}>
      <View style={{ padding: 20, paddingTop: 60, gap: 8 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: '#C87A38', fontSize: 16 }}>Back</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: '700', color: theme.text }}>Tags</Text>
      </View>
      <FlatList
        data={tags}
        keyExtractor={t => t.id}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: theme.bg }]}>
            <View>
              <Text style={[styles.name, { color: theme.text }]}>#{item.name}</Text>
              <Text style={[styles.count, { color: theme.meta }]}>{item.count} items</Text>
            </View>
            <TouchableOpacity onPress={() => deleteTag(item)}>
              <Text style={{ color: '#B53030', fontSize: 14 }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.sep }} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderRadius: 10, paddingHorizontal: 16, marginBottom: 1 },
  name: { fontSize: 15, fontWeight: '500' },
  count: { fontSize: 12, marginTop: 2 },
})
