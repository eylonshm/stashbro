import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { useTheme } from '../src/hooks/useTheme.js'
import { validateServerUrl } from '../src/lib/config.js'
import { reinitializeSyncEngine } from '../src/hooks/useSyncEngine.js'

export default function SettingsScreen() {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [saved, setSaved] = useState(false)
  const [serverMode, setServerMode] = useState<'token' | 'magic-link' | 'unknown'>('unknown')
  const [email, setEmail] = useState('')
  const [codeStep, setCodeStep] = useState(false)
  const [code, setCode] = useState('')
  const [loginStatus, setLoginStatus] = useState('')
  const theme = useTheme()

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('stashbro:serverURL'),
      AsyncStorage.getItem('stashbro:serverToken'),
    ]).then(([u, t]) => {
      if (u) setUrl(u)
      if (t) setToken(t)
    })
  }, [])

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
    const mode = await detectMode(url)
    setServerMode(mode)
    if (mode === 'magic-link') {
      // In magic-link mode, just save the URL and show email flow
      await AsyncStorage.setItem('stashbro:serverURL', url)
      return
    }
    if (!token.trim()) { Alert.alert('Missing Token', 'Bearer token cannot be empty'); return }
    await Promise.all([
      AsyncStorage.setItem('stashbro:serverURL', url),
      AsyncStorage.setItem('stashbro:serverToken', token),
    ])
    await reinitializeSyncEngine()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.surface }}
      contentContainerStyle={{ padding: 20 }}
    >
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 16 }}>
        <Text style={{ color: '#C87A38', fontSize: 16 }}>Back</Text>
      </TouchableOpacity>
      <Text style={[styles.heading, { color: theme.text }]}>Settings</Text>
      <Text style={[styles.label, { color: theme.meta }]}>Server URL</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
        value={url}
        onChangeText={setUrl}
        placeholder="https://your-server.fly.dev"
        placeholderTextColor={theme.meta}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {serverMode !== 'magic-link' && (
        <>
          <Text style={[styles.label, { color: theme.meta }]}>Bearer Token</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
            value={token}
            onChangeText={setToken}
            placeholder="your-secret-token"
            placeholderTextColor={theme.meta}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </>
      )}
      <TouchableOpacity style={styles.btn} onPress={save}>
        <Text style={styles.btnText}>{saved ? 'Saved!' : 'Save & Sync'}</Text>
      </TouchableOpacity>

      {serverMode === 'magic-link' && (
        <>
          <Text style={[styles.label, { color: theme.meta, marginTop: 20 }]}>Sign In (Hosted Mode)</Text>
          {!codeStep ? (
            <>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={theme.meta}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.btn} onPress={sendCode}>
                <Text style={styles.btnText}>Send Code</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor={theme.meta}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.btn} onPress={verifyCode}>
                <Text style={styles.btnText}>Verify</Text>
              </TouchableOpacity>
            </>
          )}
          {loginStatus ? <Text style={{ color: '#1F7A47', fontSize: 13, marginTop: 8 }}>{loginStatus}</Text> : null}
        </>
      )}
      <TouchableOpacity style={{ marginTop: 24, alignItems: 'center' }} onPress={() => router.push('/tags')}>
        <Text style={{ color: '#C87A38', fontSize: 15 }}>Manage Tags →</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 8 },
  input: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 4, fontSize: 14 },
  btn: { backgroundColor: '#C87A38', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
})
