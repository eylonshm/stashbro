import { eq, desc } from 'drizzle-orm'
import { lookup } from 'dns/promises'
import type { AppDb } from '../db/index.js'
import { items } from '../db/schema.js'

// ponytail: SSRF guard - blocks fetches to private/loopback IPs; required since users supply URLs
function isPrivateIP(ip: string): boolean {
  const privateRanges = [
    /^127\./,                              // loopback
    /^10\./,                               // RFC1918
    /^192\.168\./,                         // RFC1918
    /^172\.(1[6-9]|2\d|3[0-1])\./,       // RFC1918
    /^169\.254\./,                         // link-local
    /^0\./,                                // unspecified
    /^::1$/,                               // IPv6 loopback
    /^fc[0-9a-f]{2}:/i,                   // IPv6 unique local (fc00::/7 lower half)
    /^fd[0-9a-f]{2}:/i,                   // IPv6 unique local (fc00::/7 upper half)
    /^fe80:/i,                             // IPv6 link-local
  ]
  return privateRanges.some(r => r.test(ip))
}

async function assertSSRFSafe(url: string): Promise<void> {
  const parsed = new URL(url)
  const host = parsed.hostname
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    if (isPrivateIP(host)) throw new Error(`SSRF: private IP blocked: ${host}`)
    return
  }
  try {
    const addresses = await lookup(host, { all: true })
    for (const { address } of addresses) {
      if (isPrivateIP(address)) throw new Error(`SSRF: hostname resolves to private IP: ${address}`)
    }
  } catch (err) {
    if ((err as Error).message.startsWith('SSRF:')) throw err
    throw new Error(`SSRF: DNS resolution failed for ${host}`)
  }
}

const MAX_REDIRECTS = 3
const SIZE_LIMIT = 5 * 1024 * 1024 // 5MB

// C1: manual redirect following - re-checks SSRF on each hop to block redirect-to-private-IP attacks
async function fetchSafe(url: string, hops = 0): Promise<Response> {
  await assertSSRFSafe(url)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'StashBro/1.0 (+https://github.com/stashbro)' },
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  })
  if (res.status >= 300 && res.status < 400) {
    if (hops >= MAX_REDIRECTS) throw new Error('SSRF: too many redirects')
    const location = res.headers.get('location')
    if (!location) throw new Error('SSRF: redirect missing Location header')
    return fetchSafe(new URL(location, url).href, hops + 1)
  }
  return res
}

const OEMBED_PROVIDERS: Array<{ pattern: RegExp; endpoint: string }> = [
  { pattern: /youtube\.com|youtu\.be/, endpoint: 'https://www.youtube.com/oembed' },
  { pattern: /twitter\.com|x\.com/, endpoint: 'https://publish.twitter.com/oembed' },
]

export async function fetchOgMeta(url: string): Promise<{
  title?: string; description?: string; image?: string; favicon?: string
}> {
  try {
    const res = await fetchSafe(url)
    if (!res.ok) return {}
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return {}
    // I2: ponytail: content-length-only guard; stream cap for responses without content-length not implemented - add if large pageless sites are observed in prod
    const cl = res.headers.get('content-length')
    if (cl && parseInt(cl, 10) > SIZE_LIMIT) return {}
    const html = await res.text()
    const get = (prop: string) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
        ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
      return m?.[1]
    }
    const faviconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)
      ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i)
    let favicon = faviconMatch?.[1]
    if (favicon && !favicon.startsWith('http')) {
      try { favicon = new URL(favicon, url).href } catch { favicon = undefined }
    }
    return {
      title: get('og:title') ?? get('twitter:title'),
      description: get('og:description') ?? get('twitter:description'),
      image: get('og:image') ?? get('twitter:image'),
      favicon,
    }
  } catch {
    return {}
  }
}

export async function fetchOEmbed(url: string): Promise<{ title?: string; thumbnail_url?: string } | null> {
  const provider = OEMBED_PROVIDERS.find(p => p.pattern.test(url))
  if (!provider) return null
  // oEmbed endpoints are hardcoded to trusted providers - no SSRF check needed here
  try {
    const endpoint = `${provider.endpoint}?url=${encodeURIComponent(url)}&format=json`
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return res.json() as Promise<{ title?: string; thumbnail_url?: string }>
  } catch {
    return null
  }
}

async function enrichOnce(db: AppDb, itemId: string, url: string): Promise<void> {
  const [og, oembed] = await Promise.all([fetchOgMeta(url), fetchOEmbed(url)])

  // Re-read fresh - item may have been edited since enrichment started
  const [current] = db.select().from(items).where(eq(items.id, itemId)).all()
  if (!current) return // deleted

  const update: Record<string, unknown> = {}

  // Only overwrite title when it's still the URL fallback (user hasn't edited it)
  const title = oembed?.title ?? og.title
  if (title && current.title === url) update.title = title

  // Only fill nullable fields when currently empty (never clobber existing values)
  if (og.description && !current.description) update.description = og.description
  const thumbnail = oembed?.thumbnail_url ?? og.image
  if (thumbnail && !current.thumbnail_url) update.thumbnail_url = thumbnail
  if (og.favicon && !current.favicon_url) update.favicon_url = og.favicon

  if (Object.keys(update).length === 0) return

  // I4: transaction closes TOCTOU between change_seq SELECT and UPDATE vs concurrent route writes
  db.transaction((tx) => {
    const seqRow = tx.select({ seq: items.change_seq })
      .from(items)
      .where(eq(items.user_id, current.user_id))
      .orderBy(desc(items.change_seq))
      .limit(1)
      .all()[0]
    const seq = (seqRow?.seq ?? 0) + 1

    tx.update(items)
      .set({ ...update, updated_at: new Date().toISOString(), change_seq: seq })
      .where(eq(items.id, itemId))
      .run()
  })
}

export async function enrichMetadataAsync(db: AppDb, itemId: string, url: string): Promise<void> {
  // ponytail: immediate first attempt, then exponential backoff; 3 total attempts per spec
  const delays = [0, 2000, 8000]
  for (const delay of delays) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    try {
      await enrichOnce(db, itemId, url)
      return
    } catch {
      // retry - URL-as-title fallback already in place from insert
    }
  }
}
