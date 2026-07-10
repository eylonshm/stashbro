import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SyncEngine, StashBroClient } from '@stashbro/shared'
import { openDatabase } from '../db/database.js'
import { SQLiteLocalStore, makeExpoSyncDb } from '../sync/SQLiteLocalStore.js'

export function useSyncEngine(onSyncComplete?: () => void) {
  const engineRef = useRef<SyncEngine | null>(null)

  useEffect(() => {
    async function init() {
      const [url, token, userId] = await Promise.all([
        AsyncStorage.getItem('stashbro:serverURL'),
        AsyncStorage.getItem('stashbro:serverToken'),
        AsyncStorage.getItem('stashbro:userId'),
      ])
      if (!url || !token) return
      const rawDb = openDatabase()
      const store = new SQLiteLocalStore(makeExpoSyncDb(rawDb), AsyncStorage, userId ?? 'local')
      const client = new StashBroClient({ baseUrl: url, token })
      engineRef.current = new SyncEngine({ client, store, ...(onSyncComplete && { onSyncComplete }) })
      void engineRef.current.sync()
    }
    void init()

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void engineRef.current?.sync()
    })
    return () => sub.remove()
  }, [onSyncComplete])

  return engineRef.current
}
