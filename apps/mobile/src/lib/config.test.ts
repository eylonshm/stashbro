import { describe, it, expect } from 'vitest'
import { validateServerUrl } from './config'

describe('validateServerUrl', () => {
  it('accepts http://', () => expect(validateServerUrl('http://localhost:3000')).toBe(true))
  it('accepts https://', () => expect(validateServerUrl('https://server.fly.dev')).toBe(true))
  it('rejects empty string', () => expect(validateServerUrl('')).toBe(false))
  it('rejects bare host', () => expect(validateServerUrl('server.fly.dev')).toBe(false))
  it('rejects ftp://', () => expect(validateServerUrl('ftp://example.com')).toBe(false))
})
