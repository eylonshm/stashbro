// ponytail: extracted for testability; one-liner logic
export function validateServerUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}
