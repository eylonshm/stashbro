import AsyncStorage from '@react-native-async-storage/async-storage'

const HISTORY_KEY = 'stashbro:serverHistory'
const CURSOR_PREFIX = 'stashbro:sync:cursor:'
const MAX_HISTORY = 8

// --- pure helper (exported for testing) ---
export function mergeHistory(existing: string[], url: string): string[] {
  const clean = url.replace(/\/$/, '')
  return [clean, ...existing.filter((u) => u !== clean)].slice(0, MAX_HISTORY)
}

export async function getServerHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export async function addServerToHistory(url: string): Promise<void> {
  const existing = await getServerHistory()
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(mergeHistory(existing, url)))
}

// Switching servers must force a full resync: clear every sync cursor so the next
// sync re-pushes all local items and re-pulls everything from the new server.
export async function resetSyncCursors(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys()
  const cursorKeys = keys.filter((k) => k.startsWith(CURSOR_PREFIX))
  if (cursorKeys.length) await AsyncStorage.multiRemove(cursorKeys)
}
