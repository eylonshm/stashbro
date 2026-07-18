import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { fetchOgMeta, fetchOEmbed, enrichMetadataAsync } from './metadata.js'
import { getDb, clearDbCache } from '../db/index.js'
import { items } from '../db/schema.js'

process.env['DB_PATH'] = ':memory:'

// I3: mock DNS - no real network in any test
vi.mock('dns/promises', () => ({
  lookup: vi.fn((host: string) => {
    // localhost resolves to loopback (matches real DNS), everything else gets a public IP
    const ip = host === 'localhost' ? '127.0.0.1' : '93.184.216.34'
    return Promise.resolve([{ address: ip, family: 4 }])
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function htmlResponse(html: string) {
  return { ok: true, text: async () => html, headers: { get: () => 'text/html' } }
}

function redirectResponse(location: string, status = 301) {
  return { ok: false, status, headers: { get: (h: string) => h === 'location' ? location : null } }
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
    // I1: fixed - fetch called with (url, options) so use expect.anything() for second arg
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('youtube.com/oembed'), expect.anything())
  })

  it('returns null for non-oEmbed URLs', async () => {
    const result = await fetchOEmbed('https://stratechery.com/article')
    expect(result).toBeNull()
  })
})

describe('fetchOgMeta SSRF guard', () => {
  beforeEach(() => mockFetch.mockReset())

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

  it('C1: blocks redirect to private IP (169.254.x cloud metadata)', async () => {
    mockFetch.mockResolvedValueOnce(redirectResponse('http://169.254.169.254/latest/meta-data/'))
    const result = await fetchOgMeta('https://example.com/evil')
    expect(result).toEqual({})
  })

  it('C1: follows redirect to public URL and parses response', async () => {
    mockFetch.mockResolvedValueOnce(redirectResponse('https://example.com/final'))
    mockFetch.mockResolvedValueOnce(htmlResponse('<html><head><meta property="og:title" content="Redirected Title"></head></html>'))
    const result = await fetchOgMeta('https://example.com/start')
    expect(result.title).toBe('Redirected Title')
  })

  it('C1: gives up after >3 redirect hops', async () => {
    // 4 redirect responses trigger the cap (hops 0-3 each see a redirect, hops=3 >= MAX_REDIRECTS=3)
    for (let i = 0; i < 4; i++) {
      mockFetch.mockResolvedValueOnce(redirectResponse('https://example.com/loop'))
    }
    const result = await fetchOgMeta('https://example.com/start')
    expect(result).toEqual({})
  })
})

describe('enrichMetadataAsync - LWW guards and sync visibility', () => {
  const URL = 'https://example.com/article'

  beforeEach(() => { clearDbCache(); mockFetch.mockReset() })

  function insertItem(overrides: { title?: string; thumbnail_url?: string | null; type?: 'article' | 'video'; reading_time_seconds?: number | null } = {}) {
    const db = getDb()
    db.insert(items).values({
      id: 'item-1',
      user_id: 'user-1',
      url: URL,
      title: overrides.title ?? URL, // default fallback = url
      domain: 'example.com',
      type: overrides.type ?? 'article',
      status: 'unread',
      priority: 'medium',
      change_seq: 1,
      thumbnail_url: overrides.thumbnail_url ?? null,
      reading_time_seconds: overrides.reading_time_seconds ?? null,
    }).run()
    return db
  }

  it('(a) change_seq advances after enrichment - item visible in next sync pull', async () => {
    const db = insertItem()
    mockFetch.mockResolvedValueOnce(htmlResponse('<html><head><meta property="og:title" content="Enriched Title"></head></html>'))
    await enrichMetadataAsync(db, 'item-1', URL)
    const item = db.select().from(items).where(eq(items.id, 'item-1')).all()[0]!
    expect(item.change_seq).toBeGreaterThan(1)
    expect(item.title).toBe('Enriched Title')
  })

  it('(b) user-edited title (title != url) is not overwritten by enrichment', async () => {
    const db = insertItem({ title: 'My Custom Title' })
    mockFetch.mockResolvedValueOnce(htmlResponse('<html><head><meta property="og:title" content="OG Title"></head></html>'))
    await enrichMetadataAsync(db, 'item-1', URL)
    const item = db.select().from(items).where(eq(items.id, 'item-1')).all()[0]!
    expect(item.title).toBe('My Custom Title')
  })

  it('(c) empty thumbnail gets filled; existing thumbnail is untouched', async () => {
    // item-1: no thumbnail - should be filled
    const db = insertItem()
    mockFetch.mockResolvedValueOnce(htmlResponse('<html><head><meta property="og:image" content="https://example.com/img.jpg"></head></html>'))
    await enrichMetadataAsync(db, 'item-1', URL)
    const item1 = db.select().from(items).where(eq(items.id, 'item-1')).all()[0]!
    expect(item1.thumbnail_url).toBe('https://example.com/img.jpg')

    // item-2: already has thumbnail - should not be overwritten
    db.insert(items).values({
      id: 'item-2', user_id: 'user-1', url: URL, title: URL,
      domain: 'example.com', type: 'article', status: 'unread',
      priority: 'medium', change_seq: 5, thumbnail_url: 'https://existing.com/thumb.jpg',
    }).run()
    mockFetch.mockResolvedValueOnce(htmlResponse('<html><head><meta property="og:image" content="https://new.com/img.jpg"></head></html>'))
    await enrichMetadataAsync(db, 'item-2', URL)
    const item2 = db.select().from(items).where(eq(items.id, 'item-2')).all()[0]!
    expect(item2.thumbnail_url).toBe('https://existing.com/thumb.jpg')
  })

  it('(d) reading_time_seconds is computed from HTML body when null', async () => {
    const db = insertItem()
    const body = `word `.repeat(200)
    mockFetch.mockResolvedValueOnce(htmlResponse(`<html><body><article><p>${body}</p></article></body></html>`))
    await enrichMetadataAsync(db, 'item-1', URL)
    const item = db.select().from(items).where(eq(items.id, 'item-1')).all()[0]!
    expect(item.reading_time_seconds).toBeGreaterThan(0)
  })

  it('(e) existing reading_time_seconds is not overwritten', async () => {
    const db = insertItem({ reading_time_seconds: 120 })
    mockFetch.mockResolvedValueOnce(htmlResponse(`<html><body><p>${`word `.repeat(238)}</p></body></html>`))
    await enrichMetadataAsync(db, 'item-1', URL)
    const item = db.select().from(items).where(eq(items.id, 'item-1')).all()[0]!
    expect(item.reading_time_seconds).toBe(120)
  })

  it('(f) video-type items do not get a reading_time_seconds estimate', async () => {
    const db = insertItem({ type: 'video' })
    mockFetch.mockResolvedValueOnce(htmlResponse(`<html><body><p>${`word `.repeat(238)}</p></body></html>`))
    await enrichMetadataAsync(db, 'item-1', URL)
    const item = db.select().from(items).where(eq(items.id, 'item-1')).all()[0]!
    expect(item.reading_time_seconds).toBeNull()
  })
})
