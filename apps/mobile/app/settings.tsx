import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { useTheme, SPACING } from '../src/hooks/useTheme'
import { validateServerUrl } from '../src/lib/config'
import { reinitializeSyncEngine } from '../src/hooks/useSyncEngine'
import { getServerHistory, addServerToHistory } from '../src/lib/serverHistory'

export default function SettingsScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverMode, setServerMode] = useState<'token' | 'magic-link' | 'unknown'>('unknown')
  const [email, setEmail] = useState('')
  const [codeStep, setCodeStep] = useState(false)
  const [code, setCode] = useState('')
  const [loginStatus, setLoginStatus] = useState('')
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('stashbro:serverURL'),
      AsyncStorage.getItem('stashbro:serverToken'),
      getServerHistory(),
    ]).then(([u, t, h]) => {
      if (u) setUrl(u)
      if (t) setToken(t)
      setHistory(h as string[])
    })
  }, [])

  // Record the server in history. Cursors are per-server (see SQLiteLocalStore),
  // so switching servers already triggers a full resync automatically.
  const handleServerSwitch = async (newUrl: string) => {
    await addServerToHistory(newUrl)
    setHistory(await getServerHistory())
  }

  const detectMode = async (serverUrl: string): Promise<'token' | 'magic-link' | 'unknown'> => {
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/health`)
      if (!res.ok) return 'unknown'
      const data = await res.json() as { mode?: string }
      return data.mode === 'magic-link' ? 'magic-link' : 'token'
    } catch { return 'unknown' }
  }

  const save = async () => {
    if (!validateServerUrl(url)) { Alert.alert('Invalid URL', 'Must start with http(s)://'); return }
    setSaving(true)
    try {
      const mode = await detectMode(url)
      setServerMode(mode)
      if (mode === 'magic-link') {
        await handleServerSwitch(url)
        await AsyncStorage.setItem('stashbro:serverURL', url)
        return
      }
      if (!token.trim()) { Alert.alert('Missing Token', 'Bearer token cannot be empty'); return }
      await handleServerSwitch(url)
      await Promise.all([
        AsyncStorage.setItem('stashbro:serverURL', url),
        AsyncStorage.setItem('stashbro:serverToken', token),
      ])
      await reinitializeSyncEngine()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const sendCode = async () => {
    if (!email.trim()) { setLoginStatus('Email required'); return }
    try {
      const base = url.replace(/\/$/, '')
      const res = await fetch(`${base}/auth/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) { setLoginStatus('Failed to send code'); return }
      setCodeStep(true)
      setLoginStatus('Code sent! Check your email.')
    } catch { setLoginStatus('Connection failed') }
  }

  const verifyCode = async () => {
    if (!code.trim()) { setLoginStatus('Code required'); return }
    try {
      const base = url.replace(/\/$/, '')
      const res = await fetch(`${base}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      if (!res.ok) { setLoginStatus('Invalid code'); return }
      const data = await res.json() as { accessToken: string; refreshToken: string }
      await Promise.all([
        AsyncStorage.setItem('stashbro:serverToken', data.accessToken),
        AsyncStorage.setItem('stashbro:refreshToken', data.refreshToken),
      ])
      await reinitializeSyncEngine()
      setLoginStatus('Signed in!')
      setCodeStep(false)
    } catch { setLoginStatus('Verification failed') }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.backBtn, { color: theme.accent }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Server section */}
        <Text style={[styles.sectionHeader, { color: theme.meta }]}>SERVER</Text>
        <View style={[styles.card, { backgroundColor: theme.bg }]}>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: theme.secondary }]}>Server URL</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              value={url}
              onChangeText={setUrl}
              placeholder="https://your-server.fly.dev"
              placeholderTextColor={theme.meta}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {history.length > 0 && (
              <View style={styles.historyWrap}>
                <Text style={[styles.fieldLabel, { color: theme.meta }]}>Recent servers</Text>
                {history.map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => setUrl(h)}
                    style={[styles.historyChip, { borderColor: theme.border }]}
                  >
                    <Text style={[styles.historyChipText, { color: url.replace(/\/$/, '') === h ? theme.accent : theme.secondary }]} numberOfLines={1}>
                      {h}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Auth section */}
        <Text style={[styles.sectionHeader, { color: theme.meta }]}>
          {serverMode === 'magic-link' ? 'SIGN IN' : 'AUTHENTICATION'}
        </Text>
        <View style={[styles.card, { backgroundColor: theme.bg }]}>
          {serverMode === 'magic-link' ? (
            <>
              {!codeStep ? (
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: theme.secondary }]}>Email</Text>
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={theme.meta}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable
                    onPress={sendCode}
                    style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
                  >
                    <Text style={[styles.primaryBtnText, { color: theme.accentText }]}>Send Code</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: theme.secondary }]}>Verification Code</Text>
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                    value={code}
                    onChangeText={setCode}
                    placeholder="6-digit code"
                    placeholderTextColor={theme.meta}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable
                    onPress={verifyCode}
                    style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
                  >
                    <Text style={[styles.primaryBtnText, { color: theme.accentText }]}>Verify</Text>
                  </Pressable>
                </View>
              )}
              {loginStatus ? (
                <Text style={[styles.statusText, { color: theme.accent }]}>{loginStatus}</Text>
              ) : null}
            </>
          ) : (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: theme.secondary }]}>Bearer Token</Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                value={token}
                onChangeText={setToken}
                placeholder="your-secret-token"
                placeholderTextColor={theme.meta}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}
        </View>

        {/* Save */}
        <Pressable
          onPress={save}
          disabled={saving}
          style={[styles.primaryBtn, styles.saveBtn, { backgroundColor: theme.accent }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.accentText} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: theme.accentText }]}>
              {saved ? 'Saved!' : 'Save & Sync'}
            </Text>
          )}
        </Pressable>

        {/* Navigation */}
        <Text style={[styles.sectionHeader, { color: theme.meta }]}>MORE</Text>
        <View style={[styles.card, { backgroundColor: theme.bg }]}>
          <Pressable onPress={() => router.push('/tags')} style={styles.navRow}>
            <Text style={[styles.navLabel, { color: theme.text }]}>Manage Tags</Text>
            <Text style={[styles.navChevron, { color: theme.meta }]}>→</Text>
          </Pressable>
        </View>

        <View style={{ height: insets.bottom + SPACING.xl }} />
      </ScrollView>
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
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  sectionHeader: {
    fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase',
    marginTop: SPACING.xl, marginBottom: SPACING.sm, marginLeft: SPACING.xs,
  },
  card: { borderRadius: 12, padding: SPACING.lg, gap: SPACING.md },
  field: { gap: SPACING.xs },
  fieldLabel: { fontSize: 13, fontWeight: '500' },
  input: {
    fontSize: 15, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  primaryBtn: {
    borderRadius: 10, paddingVertical: 13,
    alignItems: 'center', marginTop: SPACING.xs,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { marginTop: SPACING.xl },
  statusText: { fontSize: 13, marginTop: SPACING.xs },
  historyWrap: { gap: SPACING.xs, marginTop: SPACING.xs },
  historyChip: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  historyChipText: { fontSize: 13 },
  navRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  navLabel: { fontSize: 15 },
  navChevron: { fontSize: 16 },
})
