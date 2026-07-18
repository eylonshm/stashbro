import { describe, it, expect } from 'vitest'
import { estimateReadingTimeSeconds, extractTextFromHtml } from './reading-time.js'

describe('extractTextFromHtml', () => {
  it('strips HTML tags', () => {
    expect(extractTextFromHtml('<p>Hello <b>world</b></p>')).toBe('Hello world')
  })

  it('strips script and style blocks', () => {
    expect(extractTextFromHtml('<style>.x{}</style><script>alert(1)</script><p>content</p>')).toBe('content')
  })

  it('strips nav, header, footer, aside noise', () => {
    const html = '<nav>menu items</nav><article><p>real content</p></article><footer>links</footer>'
    expect(extractTextFromHtml(html)).toBe('real content')
  })

  it('prefers article content over full page', () => {
    const html = '<div>noise</div><article><p>article text here</p></article><div>more noise</div>'
    expect(extractTextFromHtml(html)).toBe('article text here')
  })

  it('prefers main content when no article', () => {
    const html = '<div>noise</div><main><p>main content</p></main><div>noise</div>'
    expect(extractTextFromHtml(html)).toBe('main content')
  })

  it('collapses whitespace', () => {
    expect(extractTextFromHtml('<p>a</p>  <p>b</p>\n\n<p>c</p>')).toBe('a b c')
  })

  it('returns empty string for empty input', () => {
    expect(extractTextFromHtml('')).toBe('')
  })
})

describe('estimateReadingTimeSeconds', () => {
  it('estimates ~60s for 200 words (reading-time default WPM)', () => {
    const text = 'word '.repeat(200).trim()
    expect(estimateReadingTimeSeconds(text)).toBe(60)
  })

  it('returns minimum 1 second for very short text', () => {
    expect(estimateReadingTimeSeconds('hi')).toBeGreaterThanOrEqual(1)
  })

  it('handles HTML input by stripping tags first', () => {
    const html = '<article><p>' + 'word '.repeat(400) + '</p></article>'
    expect(estimateReadingTimeSeconds(html)).toBe(120)
  })

  it('returns 0 for empty string', () => {
    expect(estimateReadingTimeSeconds('')).toBe(0)
  })

  it('caps at 2700s (45 min)', () => {
    const html = '<article><p>' + 'word '.repeat(20000) + '</p></article>'
    expect(estimateReadingTimeSeconds(html)).toBe(2700)
  })

  it('returns 0 for high word count without content container', () => {
    const html = '<div>' + 'word '.repeat(5000) + '</div>'
    expect(estimateReadingTimeSeconds(html)).toBe(0)
  })
})
