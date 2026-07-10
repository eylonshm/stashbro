export function validateOptions(url: string, token: string): string | null {
  if (!url.startsWith('http://') && !url.startsWith('https://'))
    return 'URL must start with http:// or https://'
  if (!token.trim()) return 'Token cannot be empty'
  return null
}
