import AsyncStorage from '@react-native-async-storage/async-storage'

const HISTORY_KEY = 'stashbro:serverHistory'
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
