import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import RNFS from 'react-native-fs'
import EventSource from 'react-native-sse'
import { SyncEngine, StashBroClient } from '@stashbro/shared'
import { openDatabase } from '../db/database'
import { SQLiteLocalStore, makeExpoSyncDb } from '../sync/SQLiteLocalStore'
import { ingestShareExtensionInbox, type InboxFS } from '../sync/ingestInbox'

const APP_GROUP = 'group.com.stashbro.mobile'
// Foreground fallback poll: covers the window when SSE is disconnected/reconnecting.
const POLL_INTERVAL_MS = 20000

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

// ponytail: copy DB to app group after each sync so the iOS widget can read it.
// Widget can't access the default expo-sqlite sandbox path; app group is the shared container.
// TRUNCATE checkpoint flushes + zeroes WAL; atomic tmp→rename prevents widget reading a partial file.
async function copyDbToAppGroup(): Promise<void> {
  try {
    const groupDir = await RNFS.pathForGroup(APP_GROUP)
    const db = openDatabase()
    db.execSync('PRAGMA wal_checkpoint(TRUNCATE)')
    const dst = `${groupDir}/stashbro.db`
    const tmp = `${dst}.tmp`
    await RNFS.copyFile(db.databasePath, tmp)
    await RNFS.moveFile(tmp, dst)
  } catch {
    // non-fatal: widget shows stale or empty data until next successful copy
  }
}

// ponytail: RNFS adapter defined once at module level; only referenced in prod (never in tests)
const rnfsInboxFS: InboxFS = {
  exists: (p) => RNFS.exists(p),
  listFiles: (dir) => RNFS.readdir(dir),
  readFile: (p) => RNFS.readFile(p, 'utf8'),
  deleteFile: (p) => RNFS.unlink(p),
}

// ponytail: module-level refs so settings screen can reinit/sync without context wiring
// Mobile has one active session; these are always the home screen's engine refs.
let _initFn: (() => Promise<void>) | null = null
let _syncFn: (() => Promise<void>) | null = null

export const reinitializeSyncEngine = (): Promise<void> => _initFn?.() ?? Promise.resolve()
export const triggerSync = (): Promise<void> => _syncFn?.() ?? Promise.resolve()

export function useSyncEngine(onSyncComplete?: () => void) {
  const engineRef = useRef<SyncEngine | null>(null)
  const storeRef = useRef<SQLiteLocalStore | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // ponytail: callback ref keeps engine init stable across filter changes
  const onSyncCompleteRef = useRef(onSyncComplete)
  useEffect(() => { onSyncCompleteRef.current = onSyncComplete })

  const [status, setStatus] = useState<SyncStatus>('idle')
  const [realtimeConnected, setRealtimeConnected] = useState(false)

  const closeRealtime = useCallback(() => {
    esRef.current?.removeAllEventListeners()
    esRef.current?.close()
    esRef.current = null
    setRealtimeConnected(false)
  }, [])

  // Open an SSE stream so remote changes (e.g. saved on Mac) sync in near-real-time.
  const openRealtime = useCallback((url: string, token: string) => {
    closeRealtime()
    const es = new EventSource(`${url.replace(/\/$/, '')}/sync/events`, {
      headers: { Authorization: `Bearer ${token}` },
      // Let the server keepalive drive liveness; the lib auto-reconnects on drop.
      lineEndingCharacter: '\n',
    })
    es.addEventListener('open', () => setRealtimeConnected(true))
    es.addEventListener('message', (e) => {
      // 'connected' / 'ping' are liveness only; 'change' means pull now.
      if (e.data === 'change') void engineRef.current?.sync()
    })
    es.addEventListener('error', () => setRealtimeConnected(false))
    esRef.current = es
  }, [closeRealtime])

  const init = useCallback(async () => {
    const [url, token, userId] = await Promise.all([
      AsyncStorage.getItem('stashbro:serverURL'),
      AsyncStorage.getItem('stashbro:serverToken'),
      AsyncStorage.getItem('stashbro:userId'),
    ])
    closeRealtime()
    if (!url || !token) { setStatus('offline'); return }
    const rawDb = openDatabase()
    storeRef.current = new SQLiteLocalStore(makeExpoSyncDb(rawDb), AsyncStorage, userId ?? 'local')
    const client = new StashBroClient({ baseUrl: url, token }, fetch, {
      getRefreshToken: () => AsyncStorage.getItem('stashbro:refreshToken'),
      setAccessToken: async (t) => { await AsyncStorage.setItem('stashbro:serverToken', t) },
    })
    engineRef.current = new SyncEngine({
      client,
      store: storeRef.current,
      onSyncStart: () => setStatus('syncing'),
      onSyncComplete: () => {
        setStatus('synced')
        onSyncCompleteRef.current?.()
        void copyDbToAppGroup()
      },
      onSyncError: () => setStatus('error'),
    })
    openRealtime(url, token)
    void engineRef.current.sync()
  }, [closeRealtime, openRealtime])

  useEffect(() => {
    _initFn = init
    _syncFn = () => engineRef.current?.sync() ?? Promise.resolve()
    void init()

    // Foreground fallback poll - only ticks while the app is active.
    pollRef.current = setInterval(() => {
      if (AppState.currentState === 'active') void engineRef.current?.sync()
    }, POLL_INTERVAL_MS)

    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        if (storeRef.current) {
          const groupDir = await RNFS.pathForGroup(APP_GROUP)
          const inboxDir = `${groupDir}/inbox`
          await ingestShareExtensionInbox(storeRef.current, inboxDir, rnfsInboxFS)
        }
        // Re-establish realtime if it dropped while backgrounded.
        if (!esRef.current) {
          const [url, token] = await Promise.all([
            AsyncStorage.getItem('stashbro:serverURL'),
            AsyncStorage.getItem('stashbro:serverToken'),
          ])
          if (url && token) openRealtime(url, token)
        }
        void engineRef.current?.sync()
      } else {
        // iOS suspends network in background; drop SSE so it reconnects cleanly on resume.
        closeRealtime()
      }
    })
    return () => {
      _initFn = null
      _syncFn = null
      sub.remove()
      if (pollRef.current) clearInterval(pollRef.current)
      closeRealtime()
    }
  }, [init, openRealtime, closeRealtime])

  // Stable refs - safe to call before init (no-op until engine is ready)
  const sync = useCallback((): Promise<void> => engineRef.current?.sync() ?? Promise.resolve(), [])
  const saveLocalItem = useCallback((item: Parameters<SQLiteLocalStore['saveLocalItem']>[0]): void => {
    storeRef.current?.saveLocalItem(item)
  }, [])

  return useMemo(
    () => ({ sync, saveLocalItem, status, realtimeConnected }),
    [sync, saveLocalItem, status, realtimeConnected],
  )
}
