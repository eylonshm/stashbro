import { describe, it, expect } from 'vitest'
import { validateOptions } from './validateOptions.js'

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
