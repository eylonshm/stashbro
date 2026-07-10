import { SQLiteLocalStore } from './SQLiteLocalStore.js'

// ponytail: InboxFS injectable so tests use node:fs without pulling in RNFS
export interface InboxFS {
  exists(path: string): Promise<boolean>
  listFiles(dir: string): Promise<string[]>
  readFile(path: string): Promise<string>
  deleteFile(path: string): Promise<void>
}

interface InboxPayload {
  id: string; url: string; title: string; domain: string
  type: string; priority: string; createdAt: string
}

function isValidPayload(v: unknown): v is InboxPayload {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return (
    typeof p['id'] === 'string' && p['id'].length > 0 &&
    typeof p['url'] === 'string' && p['url'].length > 0 &&
    typeof p['title'] === 'string' &&
    typeof p['domain'] === 'string' &&
    typeof p['type'] === 'string' &&
    typeof p['priority'] === 'string' &&
    typeof p['createdAt'] === 'string'
  )
}

// Replicates Mac AppDelegate processShareInbox semantics (data-loss guard):
//   malformed → delete (won't block future ingests)
//   DB error  → keep  (retry on next foreground activation)
//   success   → delete
export async function ingestShareExtensionInbox(
  store: SQLiteLocalStore,
  inboxDir: string,
  fs: InboxFS,
): Promise<number> {
  if (!(await fs.exists(inboxDir))) return 0

  const files = (await fs.listFiles(inboxDir)).filter(f => f.endsWith('.json'))
  let count = 0

  for (const file of files) {
    const filePath = `${inboxDir}/${file}`
    let payload: InboxPayload

    try {
      const raw = await fs.readFile(filePath)
      const parsed = JSON.parse(raw) as unknown
      if (!isValidPayload(parsed)) throw new Error('invalid shape')
      payload = parsed
    } catch {
      // malformed - delete so it doesn't block future ingests
      await fs.deleteFile(filePath).catch(() => {})
      continue
    }

    try {
      store.saveLocalItem({
        id: payload.id, url: payload.url, title: payload.title || payload.url,
        description: null, thumbnail_url: null, favicon_url: null,
        domain: payload.domain, type: payload.type, status: 'unread',
        priority: payload.priority, updated_at: payload.createdAt,
        deleted_at: null, tag_names: [],
      })
      // ponytail: if deleteFile fails the item re-ingests next foreground (saveLocalItem is idempotent via UPDATE, bumps seq harmlessly)
      await fs.deleteFile(filePath)
      count++
    } catch {
      // DB error - leave file in inbox for retry on next foreground activation
    }
  }

  return count
}
