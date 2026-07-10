import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { useTheme } from '../src/hooks/useTheme.js'
import { validateServerUrl } from '../src/lib/config.js'

export default function SettingsScreen() {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [saved, setSaved] = useState(false)
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

  const save = async () => {
    if (!validateServerUrl(url)) { Alert.alert('Invalid URL', 'Must start with http(s)://'); return }
    await Promise.all([
      AsyncStorage.setItem('stashbro:serverURL', url),
      AsyncStorage.setItem('stashbro:serverToken', token),
    ])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
      <TouchableOpacity style={styles.btn} onPress={save}>
        <Text style={styles.btnText}>{saved ? 'Saved!' : 'Save & Sync'}</Text>
      </TouchableOpacity>
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
