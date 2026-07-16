// In-process per-user change bus for SSE realtime sync.
// ponytail: single-instance in-memory pub/sub; upgrade path: Redis pub/sub if the
// server is ever horizontally scaled across processes.
type Listener = () => void

const listeners = new Map<string, Set<Listener>>()

export function subscribeChanges(userId: string, cb: Listener): () => void {
  let set = listeners.get(userId)
  if (!set) {
    set = new Set()
    listeners.set(userId, set)
  }
  set.add(cb)
  return () => {
    const s = listeners.get(userId)
    if (!s) return
    s.delete(cb)
    if (s.size === 0) listeners.delete(userId)
  }
}

export function emitChange(userId: string): void {
  const set = listeners.get(userId)
  if (!set) return
  for (const cb of [...set]) {
    try { cb() } catch { /* a broken listener must not block others */ }
  }
}
