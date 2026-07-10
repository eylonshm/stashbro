import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchOgMeta, fetchOEmbed } from './metadata.js'

// mock fetch globally for this test file
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function htmlResponse(html: string) {
  return { ok: true, text: async () => html, headers: { get: () => 'text/html' } }
}

describe('fetchOgMeta', () => {
  beforeEach(() => mockFetch.mockReset())

  it('extracts og:title and og:image', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(`
      <html><head>
        <meta property="og:title" content="Test Title">
        <meta property="og:description" content="Test Desc">
        <meta property="og:image" content="https://example.com/img.jpg">
        <link rel="icon" href="/favicon.ico">
      </head></html>
    `))
    const result = await fetchOgMeta('https://example.com')
    expect(result.title).toBe('Test Title')
    expect(result.description).toBe('Test Desc')
    expect(result.image).toBe('https://example.com/img.jpg')
  })

  it('returns empty object on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'))
    const result = await fetchOgMeta('https://example.com')
    expect(result).toEqual({})
  })
})

describe('fetchOEmbed', () => {
  beforeEach(() => mockFetch.mockReset())

  it('fetches YouTube oEmbed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: 'YT Video', thumbnail_url: 'https://i.ytimg.com/vi/abc/hq.jpg' }),
    })
    const result = await fetchOEmbed('https://youtube.com/watch?v=abc')
    expect(result?.title).toBe('YT Video')
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('youtube.com/oembed'))
  })

  it('returns null for non-oEmbed URLs', async () => {
    const result = await fetchOEmbed('https://stratechery.com/article')
    expect(result).toBeNull()
  })
})

describe('fetchOgMeta SSRF guard', () => {
  it('returns {} for localhost URL (SSRF block)', async () => {
    const result = await fetchOgMeta('http://localhost/admin')
    expect(result).toEqual({})
  })

  it('returns {} for 192.168.x private IP', async () => {
    const result = await fetchOgMeta('http://192.168.1.1/secret')
    expect(result).toEqual({})
  })

  it('returns {} for 10.x private IP', async () => {
    const result = await fetchOgMeta('http://10.0.0.1/internal')
    expect(result).toEqual({})
  })
})
