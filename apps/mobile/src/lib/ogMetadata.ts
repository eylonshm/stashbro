const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export async function fetchOGMetadata(url: string): Promise<{
  title?: string
  description?: string
  image?: string
}> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': CHROME_UA },
      signal: controller.signal,
    })
    const html = await res.text()
    return parseOGMetadata(html, url)
  } catch {
    return {}
  } finally {
    clearTimeout(timeout)
  }
}

function parseOGMetadata(html: string, baseUrl: string): {
  title?: string; description?: string; image?: string
} {
  const title = ogContent(html, 'og:title')
    ?? ogContent(html, 'twitter:title')
    ?? htmlTitle(html)
  const description = ogContent(html, 'og:description')
    ?? ogContent(html, 'twitter:description')
    ?? metaName(html, 'description')
  let image = ogContent(html, 'og:image')
    ?? ogContent(html, 'twitter:image')

  if (image && !image.startsWith('http://') && !image.startsWith('https://') && !image.startsWith('//')) {
    try { image = new URL(image, baseUrl).href } catch {}
  }

  return {
    title: title ? decodeEntities(title) : undefined,
    description: description ? decodeEntities(description) : undefined,
    image: image ? decodeEntities(image) : undefined,
  }
}

function ogContent(html: string, property: string): string | undefined {
  const esc = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pats = [
    new RegExp(`<meta[^>]+property=["']${esc}["'][^>]+content=["']([^"'<>]+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+property=["']${esc}["']`, 'i'),
  ]
  for (const re of pats) {
    const m = html.match(re)
    if (m?.[1]) return m[1]
  }
}

function metaName(html: string, name: string): string | undefined {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pats = [
    new RegExp(`<meta[^>]+name=["']${esc}["'][^>]+content=["']([^"'<>]+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+name=["']${esc}["']`, 'i'),
  ]
  for (const re of pats) {
    const m = html.match(re)
    if (m?.[1]) return m[1]
  }
}

function htmlTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m?.[1]
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#x27;/g, "'")
    .trim()
}
