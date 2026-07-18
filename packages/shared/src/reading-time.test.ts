import { describe, it, expect } from 'vitest'
import { estimateReadingTimeSeconds, extractTextFromHtml } from './reading-time.js'

describe('extractTextFromHtml', () => {
  it('strips HTML tags', () => {
    expect(extractTextFromHtml('<p>Hello <b>world</b></p>')).toBe('Hello world')
  })

  it('strips script and style blocks', () => {
    expect(extractTextFromHtml('<style>.x{}</style><script>alert(1)</script><p>content</p>')).toBe('content')
  })

  it('collapses whitespace', () => {
    expect(extractTextFromHtml('<p>a</p>  <p>b</p>\n\n<p>c</p>')).toBe('a b c')
  })

  it('returns empty string for empty input', () => {
    expect(extractTextFromHtml('')).toBe('')
  })
})

describe('estimateReadingTimeSeconds', () => {
  it('estimates ~60s for 238 words', () => {
    const text = 'word '.repeat(238).trim()
    expect(estimateReadingTimeSeconds(text)).toBe(60)
  })

  it('returns minimum 1 second for very short text', () => {
    expect(estimateReadingTimeSeconds('hi')).toBeGreaterThanOrEqual(1)
  })

  it('handles HTML input by stripping tags first', () => {
    const html = '<p>' + 'word '.repeat(476) + '</p>'
    expect(estimateReadingTimeSeconds(html)).toBe(120)
  })

  it('returns 0 for empty string', () => {
    expect(estimateReadingTimeSeconds('')).toBe(0)
  })
})
