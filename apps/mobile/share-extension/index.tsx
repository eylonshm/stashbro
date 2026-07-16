import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, useColorScheme, ActivityIndicator,
} from 'react-native'
import { close, type InitialProps } from 'expo-share-extension'
import RNFS from 'react-native-fs'
import { detectType, extractDomain, parseHtmlMeta } from '@stashbro/shared'
import { genId } from '../src/sync/SQLiteLocalStore'
import { ACCENT, LIGHT, DARK } from '../src/hooks/useTheme'

// ponytail: share extension runs in a separate iOS process (no React context/hooks from main app)
// useColorScheme() works here - extension inherits system appearance

type Priority = 'low' | 'medium' | 'high'
type SaveStatus = 'idle' | 'saving' | 'saved-synced' | 'saved-offline' | 'error'

const APP_GROUP = 'group.com.stashbro.mobile'

// expo-share-extension v1.10.7: shared data arrives as InitialProps component props (no getShareData)
export default function ShareExtension({ url: sharedUrl = '', text }: InitialProps) {
  const scheme = useColorScheme()
  // ponytail: recompute on scheme change; component re-renders on system appearance toggle
  const C = scheme === 'dark' ? DARK : LIGHT

  const initialUrl = sharedUrl || text || ''
  const [url] = useState(initialUrl)  // URL is read-only after mount
  const [title, setTitle] = useState(initialUrl)
  const [description, setDescription] = useState('')
  const [detectedType, setDetectedType] = useState(() => detectType(initialUrl))
  const [domain, setDomain] = useState(() => extractDomain(initialUrl))
  const [priority, setPriority] = useState<Priority>('medium')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  // Tags
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [allSuggestions, setAllSuggestions] = useState<string[]>([])

  // Metadata fetch state
  const [metaLoading, setMetaLoading] = useState(!!initialUrl)
  const titleEdited = useRef(false)
  const descEdited = useRef(false)

  // Direct upload credentials (written by host app on sync init)
  const [credentials, setCredentials] = useState<{ serverURL: string; token: string } | null>(null)

  // Load tags.json + credentials.json from app group on mount
  useEffect(() => {
    RNFS.pathForGroup(APP_GROUP).then(g => {
      RNFS.readFile(`${g}/tags.json`, 'utf8')
        .then(j => { setAllSuggestions(JSON.parse(j) as string[]) })
        .catch(() => {})
      RNFS.readFile(`${g}/credentials.json`, 'utf8')
        .then(j => {
          const c = JSON.parse(j) as { serverURL?: string; token?: string }
          if (c.serverURL && c.token) setCredentials({ serverURL: c.serverURL, token: c.token })
        })
        .catch(() => {})
    }).catch(() => {})
  }, [])

  // Auto-load title + description from shared URL (5s timeout, graceful failure)
  useEffect(() => {
    if (!initialUrl) { setMetaLoading(false); return }
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 5000)
    fetch(initialUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'StashBro/1.0' },
    })
      .then(r => (r.ok ? r.text() : Promise.reject()))
      .then(html => {
        const meta = parseHtmlMeta(html)
        // Don't clobber user edits - respect ref tracking
        if (!titleEdited.current && meta.title) setTitle(meta.title)
        if (!descEdited.current && meta.description) setDescription(meta.description)
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timeout); setMetaLoading(false) })
    return () => { ctrl.abort(); clearTimeout(timeout) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDetectedType(detectType(url))
    setDomain(extractDomain(url))
  }, [url])

  const filteredSuggestions = useMemo(
    () => allSuggestions
      .filter(t => !selectedTags.includes(t) && (tagInput ? t.toLowerCase().includes(tagInput.toLowerCase()) : true))
      .slice(0, 4),
    [allSuggestions, selectedTags, tagInput],
  )

  const addTag = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || selectedTags.includes(trimmed)) return
    setSelectedTags(prev => [...prev, trimmed])
    setTagInput('')
  }
  const removeTag = (name: string) => setSelectedTags(prev => prev.filter(t => t !== name))

  const save = async () => {
    if (saveStatus !== 'idle') return
    setSaveStatus('saving')
    try {
      const groupDir = await RNFS.pathForGroup(APP_GROUP)
      const inboxDir = `${groupDir}/inbox`
      await RNFS.mkdir(inboxDir)
      // Hermes has no global crypto - crypto.randomUUID() throws on-device
      const id = genId()
      const now = new Date().toISOString()
      const payload = JSON.stringify({
        id, url, title: title || url,
        description: description || null,
        domain, type: detectedType, priority,
        tag_names: selectedTags,
        createdAt: now,
      })
      // atomic write: unique filename prevents collisions if user shares twice quickly
      await RNFS.writeFile(`${inboxDir}/${id}.json`, payload, 'utf8')

      // Inbox write succeeded - item is safe. Show offline state immediately.
      setSaveStatus('saved-offline')
      const closeTimer = setTimeout(close, 1500)

      // Best-effort direct upload via sync/push (dedupes by id when host app later syncs)
      if (credentials) {
        try {
          const uploadCtrl = new AbortController()
          const uploadTimeout = setTimeout(() => uploadCtrl.abort(), 4000)
          const res = await fetch(`${credentials.serverURL}/sync/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.token}` },
            body: JSON.stringify({
              changes: [{
                id, change_seq: 0,
                created_at: now, updated_at: now, deleted_at: null,
                url, title: title || url,
                description: description || null,
                thumbnail_url: null, favicon_url: null,
                domain, type: detectedType, status: 'unread' as const,
                priority, tag_names: selectedTags,
              }],
            }),
            signal: uploadCtrl.signal,
          })
          clearTimeout(uploadTimeout)
          if (res.ok) {
            clearTimeout(closeTimer)
            setSaveStatus('saved-synced')
            setTimeout(close, 1000)
          }
          // if !res.ok: keep saved-offline state, close at original 1500ms
        } catch {
          // network offline or aborted - already in inbox, will sync when app opens
        }
      }
    } catch (e) {
      console.error('ShareExtension save error:', e)
      setSaveStatus('error')
      setTimeout(close, 1500)
    }
  }

  const isSaved = saveStatus === 'saved-synced' || saveStatus === 'saved-offline'
  const statusLabel = saveStatus === 'saved-synced' ? 'Saved & synced' :
    saveStatus === 'saved-offline' ? 'Saved - will sync later' :
    saveStatus === 'error' ? 'Save failed' : 'Quick save'

  const tc = (C.typeBadge as Record<string, { bg: string; fg: string }>)[detectedType] ?? C.typeBadge.article

  // ponytail: styles inside render so colors respond to scheme change; layout props are static
  const s = useMemo(() => StyleSheet.create({
    container:     { padding: 20, paddingBottom: 28, gap: 8 },
    header:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    icon:          { width: 40, height: 40, borderRadius: 10, backgroundColor: ACCENT, justifyContent: 'center', alignItems: 'center' },
    iconText:      { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
    appName:       { fontSize: 15, fontWeight: '600', color: C.text },
    sub:           { fontSize: 12, color: C.meta },
    label:         { fontSize: 11, fontWeight: '600', color: C.meta, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
    textInput:     { backgroundColor: C.surface, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border, fontSize: 14, color: C.text, minHeight: 44 },
    descInput:     { backgroundColor: C.surface, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border, fontSize: 14, color: C.text, minHeight: 60 },
    badge:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
    badgeText:     { fontSize: 10, fontWeight: '700' },
    typeRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    domainText:    { fontSize: 12, color: C.meta },
    seg:           { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 8, padding: 2, gap: 1, marginTop: 2 },
    segBtn:        { flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
    segBtnActive:  { backgroundColor: C.bg },
    segText:       { fontSize: 12, fontWeight: '600', color: C.meta },
    segTextActive: { color: C.text },
    saveBtn:       { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
    saveBtnText:   { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
    // Tags
    tagsRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    tagChip:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.tagBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
    tagText:       { fontSize: 12, color: C.tagText, fontWeight: '500' },
    tagRemove:     { fontSize: 12, color: C.meta, marginLeft: 2 },
    tagInput:      { backgroundColor: C.surface, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border, fontSize: 13, color: C.text, marginTop: 4, height: 36 },
    suggestRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    suggestChip:   { backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C.border },
    suggestText:   { fontSize: 12, color: C.secondary, fontWeight: '500' },
    // Loading skeleton
    skeletonInput: { opacity: 0.45 },
    syncHint:      { fontSize: 11, color: C.meta, textAlign: 'center', marginTop: 4 },
  }), [C])

  const saveBtnColor = isSaved ? '#1F7A47' : saveStatus === 'error' ? '#B53030' : ACCENT
  const saveBtnLabel = saveStatus === 'saving' ? 'Saving...' :
    saveStatus === 'saved-synced' ? 'Saved & synced!' :
    saveStatus === 'saved-offline' ? 'Saved!' :
    saveStatus === 'error' ? 'Failed' : 'Save to StashBro'

  return (
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={s.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.icon}><Text style={s.iconText}>S</Text></View>
        <View>
          <Text style={s.appName}>StashBro</Text>
          <Text style={s.sub}>{statusLabel}</Text>
        </View>
        {metaLoading && <ActivityIndicator size="small" color={C.meta} style={{ marginLeft: 'auto' }} />}
      </View>

      {/* Title */}
      <Text style={s.label}>Title</Text>
      <TextInput
        style={[s.textInput, metaLoading && !titleEdited.current && s.skeletonInput]}
        value={title}
        onChangeText={v => { titleEdited.current = true; setTitle(v) }}
        multiline
        // ponytail: allowFontScaling=false prevents layout shift in extensions (system fonts can resize mid-render)
        allowFontScaling={false}
        editable={!isSaved}
      />

      {/* Description */}
      <Text style={s.label}>Description</Text>
      <TextInput
        style={[s.descInput, metaLoading && !descEdited.current && s.skeletonInput]}
        value={description}
        onChangeText={v => { descEdited.current = true; setDescription(v) }}
        multiline
        placeholder="Optional"
        placeholderTextColor={C.meta}
        allowFontScaling={false}
        editable={!isSaved}
      />

      {/* Tags */}
      <Text style={s.label}>Tags</Text>
      {selectedTags.length > 0 && (
        <View style={s.tagsRow}>
          {selectedTags.map(t => (
            <TouchableOpacity key={t} style={s.tagChip} onPress={() => removeTag(t)} disabled={isSaved}>
              <Text style={s.tagText}>{t}</Text>
              {!isSaved && <Text style={s.tagRemove}>×</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TextInput
        style={s.tagInput}
        value={tagInput}
        onChangeText={v => {
          // comma or space submits current tag
          if (v.endsWith(',') || v.endsWith(' ')) { addTag(v.slice(0, -1)); return }
          setTagInput(v)
        }}
        onSubmitEditing={() => addTag(tagInput)}
        returnKeyType="done"
        blurOnSubmit={false}
        placeholder={selectedTags.length === 0 ? 'Add tags...' : 'Add more...'}
        placeholderTextColor={C.meta}
        allowFontScaling={false}
        editable={!isSaved}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {filteredSuggestions.length > 0 && !isSaved && (
        <View style={s.suggestRow}>
          {filteredSuggestions.map(s_ => (
            <TouchableOpacity key={s_} style={s.suggestChip} onPress={() => addTag(s_)}>
              <Text style={s.suggestText}>{s_}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Type */}
      <Text style={s.label}>Type</Text>
      <View style={s.typeRow}>
        <View style={[s.badge, { backgroundColor: tc.bg }]}>
          <Text style={[s.badgeText, { color: tc.fg }]}>{detectedType.toUpperCase()}</Text>
        </View>
        <Text style={s.domainText}>{domain}</Text>
      </View>

      {/* Priority */}
      <Text style={s.label}>Priority</Text>
      <View style={s.seg}>
        {(['low', 'medium', 'high'] as Priority[]).map(p => (
          <TouchableOpacity
            key={p}
            style={[s.segBtn, priority === p && s.segBtnActive]}
            onPress={() => setPriority(p)}
            disabled={isSaved}
          >
            <Text style={[s.segText, priority === p && s.segTextActive]}>
              {p === 'medium' ? 'Med' : p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Save button */}
      <TouchableOpacity
        style={[s.saveBtn, { backgroundColor: saveBtnColor }]}
        onPress={save}
        disabled={saveStatus !== 'idle'}
      >
        <Text style={s.saveBtnText}>{saveBtnLabel}</Text>
      </TouchableOpacity>

      {/* Offline hint - only shown when no credentials configured */}
      {!credentials && saveStatus === 'idle' && (
        <Text style={s.syncHint}>Will sync when app opens</Text>
      )}
    </ScrollView>
  )
}
