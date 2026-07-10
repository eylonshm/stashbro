import { describe, it, expect } from 'vitest'

// Inline the validation logic matching options/main.tsx save()
function validateOptions(url: string, token: string): string | null {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return 'URL must start with http:// or https://'
  if (!token.trim()) return 'Token cannot be empty'
  return null
}

describe('options validation', () => {
  it('accepts valid https URL and token', () => {
    expect(validateOptions('https://example.com', 'tok')).toBeNull()
  })
  it('accepts http URL', () => {
    expect(validateOptions('http://localhost:3000', 'tok')).toBeNull()
  })
  it('rejects URL without scheme', () => {
    expect(validateOptions('example.com', 'tok')).toMatch(/http/)
  })
  it('rejects empty token', () => {
    expect(validateOptions('https://example.com', '')).toMatch(/empty/)
  })
  it('rejects whitespace-only token', () => {
    expect(validateOptions('https://example.com', '   ')).toMatch(/empty/)
  })
})
