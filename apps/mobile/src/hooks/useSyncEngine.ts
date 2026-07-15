import { useEffect, useRef, useCallback, useMemo } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import RNFS from 'react-native-fs'
import { SyncEngine, StashBroClient } from '@stashbro/shared'
import { openDatabase } from '../db/database'
import { SQLiteLocalStore, makeExpoSyncDb } from '../sync/SQLiteLocalStore'
import { ingestShareExtensionInbox, type InboxFS } from '../sync/ingestInbox'

const APP_GROUP = 'group.com.stashbro.mobile'

// ponytail: copy DB to app group after each sync so the iOS widget can read it.
// Widget can't access the default expo-sqlite sandbox path; app group is the shared container.
// TRUNCATE checkpoint flushes + zeroes WAL; atomic tmp→rename prevents widget reading a partial file.
// Widget freshness ceiling: 0–15 min behind sync (widget drives its own timeline clock).
// Upgrade path: native module → WidgetCenter.shared.reloadAllTimelines() after copy for instant refresh.
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
    const client = new StashBroClient({ baseUrl: url, token }, fetch, {
      getRefreshToken: () => AsyncStorage.getItem('stashbro:refreshToken'),
      setAccessToken: async (t) => { await AsyncStorage.setItem('stashbro:serverToken', t) },
    })
    engineRef.current = new SyncEngine({
      client,
      store: storeRef.current,
      onSyncComplete: () => {
        onSyncCompleteRef.current?.()
        void copyDbToAppGroup()
      },
    })
    void engineRef.current.sync()
  }, []) // stable - no deps needed, reads AsyncStorage fresh each call

  useEffect(() => {
    _initFn = init
    _syncFn = () => engineRef.current?.sync() ?? Promise.resolve()
    void init()

    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        if (storeRef.current) {
          // pathForGroup is async; safe to await here since AppState handler is already async
          const groupDir = await RNFS.pathForGroup(APP_GROUP)
          const inboxDir = `${groupDir}/inbox`
          await ingestShareExtensionInbox(storeRef.current, inboxDir, rnfsInboxFS)
        }
        void engineRef.current?.sync()
      }
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
