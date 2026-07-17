// HTML metadata parser - mirrors the regex approach in apps/server/src/services/metadata.ts.
// parseHtmlMeta is DOM-free and network-free (safe in share extensions and tests);
// fetchHtmlMeta is a thin network wrapper for callers that need to load a URL first.
export interface HtmlMeta {
  title?: string
  description?: string
  image?: string
}

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function getMeta(html: string, prop: string): string | undefined {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i')) ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
  return m?.[1]
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#x27;/g, "'")
    .trim()
}

// baseUrl (optional) resolves a relative og:image to an absolute URL.
export function parseHtmlMeta(html: string, baseUrl?: string): HtmlMeta {
  const title =
    getMeta(html, 'og:title') ??
    getMeta(html, 'twitter:title') ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
  const description =
    getMeta(html, 'og:description') ??
    getMeta(html, 'twitter:description') ??
    getMeta(html, 'description')
  let image = getMeta(html, 'og:image') ?? getMeta(html, 'twitter:image')
  if (image && baseUrl && !/^https?:\/\//.test(image) && !image.startsWith('//')) {
    try { image = new URL(image, baseUrl).href } catch { /* keep as-is */ }
  }
  const result: HtmlMeta = {}
  if (title) result.title = decodeEntities(title)
  if (description) result.description = decodeEntities(description)
  if (image) result.image = decodeEntities(image)
  return result
}

// Fetch a URL and parse its metadata. Aborts after 5s, or when `signal` fires
// (e.g. the caller's URL changed mid-flight). Returns {} on any failure.
// Note: browsers silently drop a custom User-Agent header (forbidden name) - fine.
export async function fetchHtmlMeta(url: string, signal?: AbortSignal): Promise<HtmlMeta> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const res = await fetch(url, { headers: { 'User-Agent': CHROME_UA }, signal: controller.signal })
    const html = await res.text()
    return parseHtmlMeta(html, url)
  } catch {
    return {}
  } finally {
    clearTimeout(timeout)
  }
}
