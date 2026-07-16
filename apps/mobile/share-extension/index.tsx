import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { close, type InitialProps } from 'expo-share-extension'
import RNFS from 'react-native-fs'
import { detectType, extractDomain } from '@stashbro/shared'
import { genId } from '../src/sync/SQLiteLocalStore'
import { ACCENT } from '../src/hooks/useTheme'

// ponytail: share extension runs in a separate iOS process (no React context/hooks)
// align with LIGHT theme values from useTheme.ts
const COLORS = {
  bg: '#FFFFFF',
  surface: '#ECEDF2',
  text: '#12131C',
  meta: '#9EA1B4',
  border: 'rgba(18,19,28,.09)',
  accent: ACCENT,
  accentText: '#FFFFFF',
}

type Priority = 'low' | 'medium' | 'high'

const APP_GROUP = 'group.com.stashbro.mobile'

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  video:   { bg: '#FCEAEA', fg: '#B53030' },
  post:    { bg: '#EAF0FD', fg: '#2A56A8' },
  article: { bg: '#E8F7EF', fg: '#1F7A47' },
  other:   { bg: '#F2EDF8', fg: '#6441A0' },
}

// expo-share-extension v1.10.7: shared data arrives as InitialProps component props (no getShareData)
export default function ShareExtension({ url: sharedUrl = '', text }: InitialProps) {
  const initialUrl = sharedUrl || text || ''
  const [url, setUrl] = useState(initialUrl)
  const [title, setTitle] = useState(initialUrl)
  const [detectedType, setDetectedType] = useState(() => detectType(initialUrl))
  const [domain, setDomain] = useState(() => extractDomain(initialUrl))
  const [priority, setPriority] = useState<Priority>('medium')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)

  useEffect(() => {
    setDetectedType(detectType(url))
    setDomain(extractDomain(url))
  }, [url])

  const save = async () => {
    try {
      const groupDir = await RNFS.pathForGroup(APP_GROUP)
      const inboxDir = `${groupDir}/inbox`
      await RNFS.mkdir(inboxDir)
      // Hermes has no global crypto - crypto.randomUUID() throws on-device
      const id = genId()
      const payload = JSON.stringify({
        id, url, title: title || url, domain,
        type: detectedType, priority,
        createdAt: new Date().toISOString(),
      })
      // atomic write: unique filename prevents collisions if user shares twice quickly
      await RNFS.writeFile(`${inboxDir}/${id}.json`, payload, 'utf8')
      setSaved(true)
      setTimeout(close, 1200)
    } catch (e) {
      console.error('ShareExtension save error:', e)
      setSaveError(true)
      setTimeout(close, 1500)
    }
  }

  const tc = TYPE_COLORS[detectedType] ?? TYPE_COLORS['article']!

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.icon}><Text style={styles.iconText}>S</Text></View>
        <View>
          <Text style={styles.appName}>StashBro</Text>
          <Text style={styles.sub}>{saveError ? 'Save failed' : saved ? 'Saved!' : 'Quick save'}</Text>
        </View>
      </View>

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.titleInput} value={title} onChangeText={setTitle} multiline />

      <Text style={styles.label}>Type</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <View style={[styles.badge, { backgroundColor: tc.bg }]}>
          <Text style={[styles.badgeText, { color: tc.fg }]}>{detectedType.toUpperCase()}</Text>
        </View>
        <Text style={{ fontSize: 12, color: COLORS.meta }}>{domain}</Text>
      </View>

      <Text style={styles.label}>Priority</Text>
      <View style={styles.seg}>
        {(['low', 'medium', 'high'] as Priority[]).map(p => (
          <TouchableOpacity key={p} style={[styles.segBtn, priority === p && styles.segBtnActive]} onPress={() => setPriority(p)}>
            <Text style={[styles.segText, priority === p && styles.segTextActive]}>
              {p === 'medium' ? 'Med' : p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saved && { backgroundColor: '#1F7A47' }]}
        onPress={save}
        disabled={saved}
      >
        <Text style={{ color: COLORS.accentText, fontWeight: '600', fontSize: 16 }}>
          {saved ? 'Saved!' : 'Save to StashBro'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:     { padding: 20, gap: 8 },
  header:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  icon:          { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  iconText:      { fontSize: 20, fontWeight: '800', color: COLORS.accentText },
  appName:       { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sub:           { fontSize: 12, color: COLORS.meta },
  label:         { fontSize: 11, fontWeight: '600', color: COLORS.meta, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  titleInput:    { backgroundColor: COLORS.bg, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 14, minHeight: 44 },
  badge:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  badgeText:     { fontSize: 10, fontWeight: '700' },
  seg:           { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 8, padding: 2, gap: 1, marginTop: 4 },
  segBtn:        { flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
  segBtnActive:  { backgroundColor: COLORS.bg },
  segText:       { fontSize: 12, fontWeight: '600', color: COLORS.meta },
  segTextActive: { color: COLORS.text },
  saveBtn:       { backgroundColor: COLORS.accent, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
})
