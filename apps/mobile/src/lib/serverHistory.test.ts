import { describe, it, expect } from 'vitest'
import { mergeHistory } from './serverHistory'

describe('mergeHistory', () => {
  it('prepends new url, dedupes, strips trailing slash, caps at 8', () => {
    expect(mergeHistory([], 'http://a/')).toEqual(['http://a'])
    // most-recent-first, no duplicate
    expect(mergeHistory(['http://a', 'http://b'], 'http://b')).toEqual(['http://b', 'http://a'])
    // cap
    const many = Array.from({ length: 10 }, (_, i) => `http://s${i}`)
    expect(mergeHistory(many, 'http://new')).toHaveLength(8)
    expect(mergeHistory(many, 'http://new')[0]).toBe('http://new')
  })
})
