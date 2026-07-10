import { useEffect, useRef, useCallback, useMemo } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SyncEngine, StashBroClient } from '@stashbro/shared'
import { openDatabase } from '../db/database.js'
import { SQLiteLocalStore, makeExpoSyncDb } from '../sync/SQLiteLocalStore.js'

// ponytail: module-level refs so settings screen can reinit/sync without context wiring
// Mobile has one active session; these are always the home screen's engine refs.
let _initFn: (() => Promise<void>) | null = null
let _syncFn: (() => Promise<void>) | null = null

export const reinitializeSyncEngine = (): Promise<void> => _initFn?.() ?? Promise.resolve()
export const triggerSync = (): Promise<void> => _syncFn?.() ?? Promise.resolve()

export function useSyncEngine(onSyncComplete?: () => void) {
  const engineRef = useRef<SyncEngine | null>(null)
  const storeRef = useRef<SQLiteLocalStore | null>(null)
  // ponytail: callback ref keeps engine init stable across filter changes
  const onSyncCompleteRef = useRef(onSyncComplete)
  useEffect(() => { onSyncCompleteRef.current = onSyncComplete })

  const init = useCallback(async () => {
    const [url, token, userId] = await Promise.all([
      AsyncStorage.getItem('stashbro:serverURL'),
      AsyncStorage.getItem('stashbro:serverToken'),
      AsyncStorage.getItem('stashbro:userId'),
    ])
    if (!url || !token) return
    const rawDb = openDatabase()
    storeRef.current = new SQLiteLocalStore(makeExpoSyncDb(rawDb), AsyncStorage, userId ?? 'local')
    const client = new StashBroClient({ baseUrl: url, token })
    engineRef.current = new SyncEngine({ client, store: storeRef.current, onSyncComplete: () => onSyncCompleteRef.current?.() })
    void engineRef.current.sync()
  }, []) // stable - no deps needed, reads AsyncStorage fresh each call

  useEffect(() => {
    _initFn = init
    _syncFn = () => engineRef.current?.sync() ?? Promise.resolve()
    void init()

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void engineRef.current?.sync()
    })
    return () => {
      _initFn = null
      _syncFn = null
      sub.remove()
    }
  }, [init])

  // Stable refs - safe to call before init (no-op until engine is ready)
  const sync = useCallback((): Promise<void> => engineRef.current?.sync() ?? Promise.resolve(), [])
  const saveLocalItem = useCallback((item: Parameters<SQLiteLocalStore['saveLocalItem']>[0]): void => {
    storeRef.current?.saveLocalItem(item)
  }, [])

  return useMemo(() => ({ sync, saveLocalItem }), [sync, saveLocalItem])
}
