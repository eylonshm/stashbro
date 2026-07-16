import React, { useState, useRef, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, Image, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { detectType, extractDomain } from '@stashbro/shared'
import { fetchOGMetadata } from '../lib/ogMetadata'
import { useTheme, ACCENT } from '../hooks/useTheme'

type Priority = 'low' | 'medium' | 'high'

interface AddURLSheetProps {
  visible: boolean
  onSave: (item: {
    url: string; title: string; description: string | null
    thumbnail_url: string | null; domain: string; type: string; priority: string
  }) => void
  onClose: () => void
}

function isValidURL(text: string): boolean {
  try {
    const u = new URL(text)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch { return false }
}

export function AddURLSheet({ visible, onSave, onClose }: AddURLSheetProps) {
  const theme = useTheme()
  const urlRef = useRef<TextInput>(null)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [priority, setPriority] = useState<Priority>('medium')
  const [ogLoading, setOgLoading] = useState(false)
  const [ogLoaded, setOgLoaded] = useState(false)

  useEffect(() => {
    if (visible) {
      setUrl(''); setTitle(''); setDescription(''); setThumbnailUrl(null)
      setPriority('medium'); setUrlError(''); setOgLoaded(false)
      setTimeout(() => urlRef.current?.focus(), 300)
    }
  }, [visible])

  const submitURL = async () => {
    const trimmed = url.trim()
    if (!isValidURL(trimmed)) {
      setUrlError('Enter a valid http:// or https:// URL')
      return
    }
    setUrlError('')
    setOgLoading(true)
    const meta = await fetchOGMetadata(trimmed)
    if (meta.title) setTitle(meta.title)
    else setTitle(trimmed)
    if (meta.description) setDescription(meta.description)
    if (meta.image) setThumbnailUrl(meta.image)
    setOgLoading(false)
    setOgLoaded(true)
  }

  const handleSave = () => {
    const trimmed = url.trim()
    if (!isValidURL(trimmed)) return
    onSave({
      url: trimmed,
      title: title || trimmed,
      description: description || null,
      thumbnail_url: thumbnailUrl,
      domain: extractDomain(trimmed),
      type: detectType(trimmed),
      priority,
    })
  }

  const detectedType = url.trim() ? detectType(url.trim()) : 'article'
  const domain = url.trim() ? extractDomain(url.trim()) : ''
  const tc = theme.typeBadge[detectedType as keyof typeof theme.typeBadge] ?? theme.typeBadge.article

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.bg }]} onPress={() => {}}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>Add URL</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Text style={[styles.closeBtn, { color: theme.meta }]}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: theme.meta }]}>URL</Text>
            <TextInput
              ref={urlRef}
              style={[styles.input, { backgroundColor: theme.searchBg, color: theme.text, borderColor: urlError ? '#B53030' : theme.border }]}
              value={url}
              onChangeText={setUrl}
              placeholder="https://..."
              placeholderTextColor={theme.meta}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={submitURL}
            />
            {urlError ? <Text style={styles.errorText}>{urlError}</Text> : null}

            {/* Preview card */}
            <View style={[styles.previewCard, { backgroundColor: theme.searchBg, borderColor: theme.border }]}>
              {ogLoading ? (
                <View style={styles.previewLoading}>
                  <ActivityIndicator color={theme.meta} />
                  <Text style={[styles.previewLoadingText, { color: theme.meta }]}>Fetching preview...</Text>
                </View>
              ) : ogLoaded ? (
                <View style={styles.previewRow}>
                  {thumbnailUrl ? (
                    <Image source={{ uri: thumbnailUrl }} style={styles.previewThumb} />
                  ) : (
                    <View style={[styles.previewThumb, { backgroundColor: tc.bg }]}>
                      <Text style={[styles.previewThumbText, { color: tc.fg }]}>{detectedType[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.previewText}>
                    <Text style={[styles.previewTitle, { color: theme.text }]} numberOfLines={2}>{title || url}</Text>
                    {description ? <Text style={[styles.previewDesc, { color: theme.secondary }]} numberOfLines={2}>{description}</Text> : null}
                    <Text style={[styles.previewDomain, { color: theme.meta }]}>{domain}</Text>
                  </View>
                </View>
              ) : (
                <Text style={[styles.previewPlaceholder, { color: theme.meta }]}>Enter a URL above to preview</Text>
              )}
            </View>

            {ogLoaded ? (
              <>
                <Text style={[styles.label, { color: theme.meta }]}>Title</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.searchBg, color: theme.text, borderColor: theme.border }]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Title"
                  placeholderTextColor={theme.meta}
                />

                <Text style={[styles.label, { color: theme.meta }]}>Description</Text>
                <TextInput
                  style={[styles.input, styles.multiline, { backgroundColor: theme.searchBg, color: theme.text, borderColor: theme.border }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Description"
                  placeholderTextColor={theme.meta}
                  multiline
                />

                <Text style={[styles.label, { color: theme.meta }]}>Type</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <View style={[styles.badge, { backgroundColor: tc.bg }]}>
                    <Text style={[styles.badgeText, { color: tc.fg }]}>{detectedType.toUpperCase()}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: theme.meta }}>{domain}</Text>
                </View>

                <Text style={[styles.label, { color: theme.meta }]}>Priority</Text>
                <View style={[styles.seg, { backgroundColor: theme.searchBg }]}>
                  {(['low', 'medium', 'high'] as Priority[]).map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.segBtn, priority === p && [styles.segBtnActive, { backgroundColor: theme.bg }]]}
                      onPress={() => setPriority(p)}
                    >
                      <Text style={[styles.segText, { color: theme.meta }, priority === p && { color: theme.text }]}>
                        {p === 'medium' ? 'Med' : p.charAt(0).toUpperCase() + p.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.saveBtn, (!isValidURL(url.trim()) || ogLoading) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!isValidURL(url.trim()) || ogLoading}
            >
              <Text style={styles.saveBtnText}>Save to StashBro</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  closeBtn: { fontSize: 15 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  input: { padding: 12, borderRadius: 10, borderWidth: 1, fontSize: 15, minHeight: 44 },
  multiline: { minHeight: 66, textAlignVertical: 'top' },
  errorText: { color: '#B53030', fontSize: 12, marginTop: 4 },
  previewCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 12, minHeight: 70 },
  previewLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 12 },
  previewLoadingText: { fontSize: 13 },
  previewRow: { flexDirection: 'row', gap: 10 },
  previewThumb: { width: 56, height: 56, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  previewThumbText: { fontSize: 20, fontWeight: '700' },
  previewText: { flex: 1, gap: 2 },
  previewTitle: { fontSize: 14, fontWeight: '600' },
  previewDesc: { fontSize: 12 },
  previewDomain: { fontSize: 11 },
  previewPlaceholder: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  seg: { flexDirection: 'row', borderRadius: 8, padding: 2, gap: 1, marginBottom: 8 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  segBtnActive: {},
  segText: { fontSize: 13, fontWeight: '600' },
  saveBtn: { backgroundColor: ACCENT, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
})
