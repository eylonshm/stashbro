const WPM = 238

export function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function estimateReadingTimeSeconds(textOrHtml: string): number {
  const text = extractTextFromHtml(textOrHtml)
  if (!text) return 0
  const words = text.split(/\s+/).length
  return Math.max(1, Math.ceil(words / WPM * 60))
}
