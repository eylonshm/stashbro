// Pure HTML metadata parser - mirrors regex approach from apps/server/src/services/metadata.ts.
// No DOM, no network - safe to call from share extensions and tests alike.
export interface HtmlMeta {
  title?: string
  description?: string
}

function getMeta(html: string, prop: string): string | undefined {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i')) ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
  return m?.[1]
}

export function parseHtmlMeta(html: string): HtmlMeta {
  const title =
    getMeta(html, 'og:title') ??
    getMeta(html, 'twitter:title') ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
  const description =
    getMeta(html, 'og:description') ??
    getMeta(html, 'twitter:description') ??
    getMeta(html, 'description')
  const result: HtmlMeta = {}
  if (title) result.title = title
  if (description) result.description = description
  return result
}
