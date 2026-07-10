import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { fetchOgMeta, fetchOEmbed, enrichMetadataAsync } from './metadata.js'
import { getDb, clearDbCache } from '../db/index.js'
import { items } from '../db/schema.js'

process.env['DB_PATH'] = ':memory:'

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

describe('enrichMetadataAsync - LWW guards and sync visibility', () => {
  const URL = 'https://example.com/article'

  beforeEach(() => { clearDbCache(); mockFetch.mockReset() })

  function insertItem(overrides: { title?: string; thumbnail_url?: string | null } = {}) {
    const db = getDb()
    db.insert(items).values({
      id: 'item-1',
      user_id: 'user-1',
      url: URL,
      title: overrides.title ?? URL, // default fallback = url
      domain: 'example.com',
      type: 'article',
      status: 'unread',
      priority: 'medium',
      change_seq: 1,
      thumbnail_url: overrides.thumbnail_url ?? null,
    }).run()
    return db
  }

  it('(a) change_seq advances after enrichment - item visible in next sync pull', async () => {
    const db = insertItem()
    mockFetch.mockResolvedValueOnce(htmlResponse('<html><head><meta property="og:title" content="Enriched Title"></head></html>'))
    await enrichMetadataAsync(db, 'item-1', URL)
    const [item] = db.select().from(items).where(eq(items.id, 'item-1')).all()
    expect(item.change_seq).toBeGreaterThan(1)
    expect(item.title).toBe('Enriched Title')
  })

  it('(b) user-edited title (title != url) is not overwritten by enrichment', async () => {
    const db = insertItem({ title: 'My Custom Title' })
    mockFetch.mockResolvedValueOnce(htmlResponse('<html><head><meta property="og:title" content="OG Title"></head></html>'))
    await enrichMetadataAsync(db, 'item-1', URL)
    const [item] = db.select().from(items).where(eq(items.id, 'item-1')).all()
    expect(item.title).toBe('My Custom Title')
  })

  it('(c) empty thumbnail gets filled; existing thumbnail is untouched', async () => {
    // item-1: no thumbnail - should be filled
    const db = insertItem()
    mockFetch.mockResolvedValueOnce(htmlResponse('<html><head><meta property="og:image" content="https://example.com/img.jpg"></head></html>'))
    await enrichMetadataAsync(db, 'item-1', URL)
    const [item1] = db.select().from(items).where(eq(items.id, 'item-1')).all()
    expect(item1.thumbnail_url).toBe('https://example.com/img.jpg')

    // item-2: already has thumbnail - should not be overwritten
    db.insert(items).values({
      id: 'item-2', user_id: 'user-1', url: URL, title: URL,
      domain: 'example.com', type: 'article', status: 'unread',
      priority: 'medium', change_seq: 5, thumbnail_url: 'https://existing.com/thumb.jpg',
    }).run()
    mockFetch.mockResolvedValueOnce(htmlResponse('<html><head><meta property="og:image" content="https://new.com/img.jpg"></head></html>'))
    await enrichMetadataAsync(db, 'item-2', URL)
    const [item2] = db.select().from(items).where(eq(items.id, 'item-2')).all()
    expect(item2.thumbnail_url).toBe('https://existing.com/thumb.jpg')
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
