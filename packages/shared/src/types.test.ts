import { describe, it, expect } from 'vitest'
import { detectType, DOMAIN_TYPE_MAP } from './types.js'

describe('detectType', () => {
  it('detects youtube as video', () => {
    expect(detectType('https://youtube.com/watch?v=abc')).toBe('video')
  })
  it('detects vimeo as video', () => {
    expect(detectType('https://vimeo.com/123456')).toBe('video')
  })
  it('detects x.com as post', () => {
    expect(detectType('https://x.com/user/status/123')).toBe('post')
  })
  it('detects twitter.com as post', () => {
    expect(detectType('https://twitter.com/user/status/123')).toBe('post')
  })
  it('detects reddit.com as post', () => {
    expect(detectType('https://reddit.com/r/programming')).toBe('post')
  })
  it('detects threads.net as post', () => {
    expect(detectType('https://threads.net/@user')).toBe('post')
  })
  it('defaults unknown domain to article', () => {
    expect(detectType('https://stratechery.com/2026/post')).toBe('article')
  })
})
