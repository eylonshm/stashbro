import { describe, it, expect } from 'vitest'
import { parseHtmlMeta } from './html-meta.js'

describe('parseHtmlMeta', () => {
  it('prefers og:title over <title>', () => {
    const html = `<html><head><title>Plain Title</title><meta property="og:title" content="OG Title"/></head></html>`
    expect(parseHtmlMeta(html).title).toBe('OG Title')
  })

  it('falls back to <title> when no og:title', () => {
    const html = `<html><head><title>  Hello World  </title></head></html>`
    expect(parseHtmlMeta(html).title).toBe('Hello World')
  })

  it('prefers og:description over meta description', () => {
    const html = `<html><head><meta property="og:description" content="OG Desc"/><meta name="description" content="Meta Desc"/></head></html>`
    expect(parseHtmlMeta(html).description).toBe('OG Desc')
  })

  it('falls back to meta name=description', () => {
    const html = `<html><head><meta name="description" content="Fallback Desc"/></head></html>`
    expect(parseHtmlMeta(html).description).toBe('Fallback Desc')
  })

  it('handles reversed attribute order (content before property)', () => {
    const html = `<html><head><meta content="Rev OG" property="og:title"/></head></html>`
    expect(parseHtmlMeta(html).title).toBe('Rev OG')
  })

  it('returns empty object for empty html', () => {
    expect(parseHtmlMeta('')).toEqual({})
  })

  it('handles missing title or description gracefully', () => {
    const html = `<html><body>No meta here</body></html>`
    const result = parseHtmlMeta(html)
    expect(result.title).toBeUndefined()
    expect(result.description).toBeUndefined()
  })

  it('uses twitter:title as fallback when og:title missing', () => {
    const html = `<html><head><meta name="twitter:title" content="Twitter Title"/></head></html>`
    expect(parseHtmlMeta(html).title).toBe('Twitter Title')
  })

  it('uses twitter:description as fallback', () => {
    const html = `<html><head><meta name="twitter:description" content="Twitter Desc"/></head></html>`
    expect(parseHtmlMeta(html).description).toBe('Twitter Desc')
  })

  it('extracts og:image and resolves it against baseUrl', () => {
    const html = `<meta property="og:image" content="/assets/pic.png"/>`
    expect(parseHtmlMeta(html, 'https://example.com/page').image).toBe('https://example.com/assets/pic.png')
  })

  it('keeps an absolute og:image as-is', () => {
    const html = `<meta property="og:image" content="https://cdn.example.com/i.png"/>`
    expect(parseHtmlMeta(html, 'https://example.com').image).toBe('https://cdn.example.com/i.png')
  })

  it('decodes HTML entities in fields', () => {
    const html = `<meta property="og:title" content="Tom &amp; Jerry"/>`
    expect(parseHtmlMeta(html).title).toBe('Tom & Jerry')
  })

  it('includes reading_time_seconds estimate', () => {
    const html = '<html><body>' + '<p>word </p>'.repeat(200) + '</body></html>'
    expect(parseHtmlMeta(html).reading_time_seconds).toBe(60)
  })
})
