// packages/extension/entrypoints/popup/PopupApp.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { detectType, extractDomain, fetchHtmlMeta, StashBroClient } from '@stashbro/shared'
import type { Item, Status } from '@stashbro/shared'
import { saveWithRetry } from '../background.js'

function isValidURL(text: string): boolean {
  try {
    const u = new URL(text)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch { return false }
}

type Priority = 'low' | 'medium' | 'high'
type View = 'save' | 'list'
type ListFilter = 'unread' | 'read' | 'archived'

const EMPTY_COPY: Record<ListFilter, [string, string]> = {
  unread: ['Nothing unread', 'Save a link to get started'],
  read: ['No read items', 'Mark items read and they land here'],
  archived: ['Nothing archived', 'Archived items show up here'],
}

// ponytail: one-time read at module load; popup is a fresh page each open, no listener needed
const DARK = window.matchMedia('(prefers-color-scheme: dark)').matches

const TH = {
  bg:         DARK ? '#1A1B23' : '#FFFFFF',
  surface:    DARK ? '#24263A' : '#F5F5F7',
  text:       DARK ? '#E8E9F4' : '#12131C',
  secondary:  DARK ? '#6B6E87' : '#9EA1B4',
  border:     DARK ? 'rgba(255,255,255,.09)' : 'rgba(18,19,28,.12)',
  tagBg:      DARK ? '#2C2E42' : '#ECEDF4',
  tagFg:      DARK ? '#A0A3BE' : '#4A4D62',
  dropdownBg: DARK ? '#24263A' : '#FFFFFF',
  segBg:      DARK ? 'rgba(255,255,255,.06)' : 'rgba(18,19,28,.06)',
  segActive:  DARK ? '#2C2E42' : '#FFFFFF',
  copper:     '#C87A38',
}

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = DARK ? {
  video:   { bg: '#3B1A1A', fg: '#E57373' },
  post:    { bg: '#1A2540', fg: '#82A8E8' },
  article: { bg: '#1A3028', fg: '#5EC892' },
  other:   { bg: '#281D3B', fg: '#B08FD8' },
} : {
  video:   { bg: '#FCEAEA', fg: '#B53030' },
  post:    { bg: '#EAF0FD', fg: '#2A56A8' },
  article: { bg: '#E8F7EF', fg: '#1F7A47' },
  other:   { bg: '#F2EDF8', fg: '#6441A0' },
}

function relTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return `${Math.floor(d / 7)}w`
}

export default function PopupApp() {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [ogLoading, setOgLoading] = useState(false)
  const [ogLoaded, setOgLoaded] = useState(false)
  const [detectedType, setDetectedType] = useState('article')
  const [tagInput, setTagInput] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLoadedRef = useRef('')       // raw URL already fetched (dedupe)
  const reqIdRef = useRef(0)             // newest load wins (race guard)
  const titleTouchedRef = useRef(false)  // don't clobber a title the user edited
  const [tags, setTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [priority, setPriority] = useState<Priority>('medium')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // null = loading (prevents configured/unconfigured flash on open)
  const [configured, setConfigured] = useState<boolean | null>(null)

  const [view, setView] = useState<View>('save')
  const [listFilter, setListFilter] = useState<ListFilter>('unread')
  const [listItems, setListItems] = useState<Item[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.url) return
      setUrl(tab.url)
      setTitle(tab.title ?? tab.url)
      setDetectedType(detectType(tab.url))
    })

    browser.storage.local.get(['serverURL', 'serverToken']).then(async (s) => {
      if (!s['serverURL'] || !s['serverToken']) { setConfigured(false); return }
      setConfigured(true)
      try {
        const res = await fetch(`${s['serverURL']}/tags`, {
          headers: { Authorization: `Bearer ${s['serverToken']}` },
        })
        if (res.ok) setAllTags((await res.json() as Array<{ name: string }>).map(t => t.name))
      } catch { /* offline */ }
    })
  }, [])

  const loadPreview = useCallback(async (trimmed: string) => {
    if (trimmed === lastLoadedRef.current) return  // already fetched this URL
    lastLoadedRef.current = trimmed
    setOgLoading(true)
    const reqId = ++reqIdRef.current
    const meta = await fetchHtmlMeta(trimmed)
    if (reqId !== reqIdRef.current) return  // superseded by a newer load
    setTitle(prev => (titleTouchedRef.current ? prev : (meta.title || prev || trimmed)))
    setDescription(meta.description ?? '')
    setThumbnailUrl(meta.image ?? null)
    setOgLoading(false)
    setOgLoaded(true)
  }, [])

  // Debounced auto-load preview whenever the URL changes (tab prefill, typing,
  // or paste). Silent on partial input, dedupes, reloads on a new valid URL.
  useEffect(() => {
    const trimmed = url.trim()
    setDetectedType(trimmed ? detectType(trimmed) : 'article')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!isValidURL(trimmed) || trimmed === lastLoadedRef.current) return
    debounceRef.current = setTimeout(() => loadPreview(trimmed), 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [url, loadPreview])

  const fetchItems = useCallback(async (filter: ListFilter) => {
    setListLoading(true)
    try {
      const s = await browser.storage.local.get(['serverURL', 'serverToken']) as { serverURL?: string; serverToken?: string }
      if (!s.serverURL || !s.serverToken) return
      const res = await fetch(`${s.serverURL}/items?status=${filter}&limit=50`, {
        headers: { Authorization: `Bearer ${s.serverToken}` },
      })
      if (res.ok) setListItems(((await res.json()) as { items: Item[] }).items)
    } catch { /* offline */ } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'list' && configured) fetchItems(listFilter)
  }, [view, listFilter, configured, fetchItems])

  const copyLink = async (id: string, link: string) => {
    try { await navigator.clipboard.writeText(link) } catch { /* clipboard blocked */ }
    setCopiedId(id)
    setTimeout(() => setCopiedId(c => (c === id ? null : c)), 1500)
  }

  const updateStatus = async (id: string, status: Status) => {
    const s = await browser.storage.local.get(['serverURL', 'serverToken']) as { serverURL?: string; serverToken?: string }
    if (!s.serverURL || !s.serverToken) return
    const client = new StashBroClient({ baseUrl: s.serverURL, token: s.serverToken })
    try {
      await client.updateItem(id, { status })
      // remove from current filter - it no longer belongs in this tab
      setListItems(prev => prev.filter(it => it.id !== id))
    } catch { /* offline - no retry here, user can refresh */ }
  }

  const save = async () => {
    setState('saving')
    const ok = await saveWithRetry({ url, title, tag_names: tags, priority })
    setState(ok ? 'saved' : 'error')
    if (ok) setTimeout(() => window.close(), 2000)
  }

  const addTag = (name: string) => {
    const trimmed = name.trim().replace(/^#/, '')
    if (trimmed && !tags.includes(trimmed)) setTags(prev => [...prev, trimmed])
    setTagInput('')
  }

  const tc = TYPE_COLORS[detectedType] ?? TYPE_COLORS['article']!
  const domain = extractDomain(url)
  const suggestions = tagInput ? allTags.filter(t => t.includes(tagInput) && !tags.includes(t)) : []

  const wrap = (children: React.ReactNode) => (
    <div style={{ padding: 16, width: 320, fontFamily: 'system-ui', background: TH.bg, boxSizing: 'border-box' }}>
      {children}
    </div>
  )

  if (configured === null) return wrap(<div style={{ height: 40 }} />)

  if (!configured) return wrap(
    <div style={{ fontSize: 14, color: TH.secondary }}>
      Configure StashBro server URL and token in extension settings first.
    </div>
  )

  if (state === 'saved') return wrap(<>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(145deg,#1F7A47,#0F5A30)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16 }}>&#10003;</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: TH.text }}>Saved!</div>
        <div style={{ fontSize: 12, color: TH.secondary }}>Syncing to your devices</div>
      </div>
    </div>
    <div style={{ fontSize: 13, fontWeight: 500, color: TH.text, marginBottom: 4 }}>{title}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: TH.secondary }}>{domain}</span>
      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: tc.bg, color: tc.fg }}>{detectedType.toUpperCase()}</span>
      {tags.map(t => <span key={t} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: TH.tagBg, color: TH.tagFg }}>#{t}</span>)}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11 }}>
      <span style={{ color: TH.copper, cursor: 'pointer' }}>View in StashBro &rarr;</span>
      <span style={{ color: TH.secondary }}>Closes in 2s</span>
    </div>
  </>)

  return (
    <div style={{ width: 320, fontFamily: 'system-ui', background: TH.bg, boxSizing: 'border-box' }}>
      <style>{'@keyframes sb-spin{to{transform:rotate(360deg)}}'}</style>
      {/* Top nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${TH.border}` }}>
        <img src="/icon/128.png" width={28} height={28} style={{ borderRadius: 7 }} alt="StashBro" />
        <div style={{ fontSize: 13, fontWeight: 700, color: TH.text }}>StashBro</div>
        <div style={{ marginLeft: 'auto', display: 'flex', background: TH.segBg, borderRadius: 8, padding: 2, gap: 1 }}>
          {(['save', 'list'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: '3px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: view === v ? TH.segActive : 'transparent', color: view === v ? TH.text : TH.secondary, boxShadow: view === v ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
              {v === 'save' ? 'Save' : 'List'}
            </button>
          ))}
        </div>
      </div>

      {view === 'save' ? (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Type badge */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: tc.bg, color: tc.fg }}>{detectedType.toUpperCase()}</div>
          </div>

          {/* URL */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TH.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              spellCheck={false}
              autoCapitalize="none"
              style={{ width: '100%', marginTop: 4, padding: '6px 8px', borderRadius: 6, border: `1px solid ${TH.border}`, fontSize: 13, boxSizing: 'border-box', outline: 'none', color: TH.text, background: TH.surface }}
            />
          </div>

          {/* Preview card */}
          <div style={{ borderRadius: 8, border: `1px solid ${TH.border}`, padding: 10, background: TH.surface, minHeight: 44 }}>
            {ogLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: TH.secondary, fontSize: 12 }}>
                <span style={{ width: 13, height: 13, border: `2px solid ${TH.border}`, borderTopColor: TH.copper, borderRadius: '50%', display: 'inline-block', animation: 'sb-spin 0.7s linear infinite' }} />
                Fetching preview...
              </div>
            ) : ogLoaded ? (
              <div style={{ display: 'flex', gap: 8 }}>
                {thumbnailUrl ? (
                  <img src={thumbnailUrl} width={44} height={44} style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 6, flexShrink: 0, background: tc.bg, color: tc.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>{detectedType[0]?.toUpperCase()}</div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TH.text, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{title || url}</div>
                  {description ? <div style={{ fontSize: 11, color: TH.secondary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{description}</div> : null}
                  <div style={{ fontSize: 10, color: TH.secondary, marginTop: 2 }}>{domain}</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: TH.secondary, textAlign: 'center' }}>Enter a URL above to preview</div>
            )}
          </div>

          {/* Title */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TH.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Title</label>
            <input value={title} onChange={e => { titleTouchedRef.current = true; setTitle(e.target.value) }} style={{ width: '100%', marginTop: 4, padding: '6px 8px', borderRadius: 6, border: `1px solid ${TH.border}`, fontSize: 13, boxSizing: 'border-box', outline: 'none', color: TH.text, background: TH.surface }} />
          </div>

          {/* Tags */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TH.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tags</label>
            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: '4px 8px', borderRadius: 6, border: `1px solid ${TH.border}`, minHeight: 32, background: TH.surface }}>
              {tags.map(t => (
                <span key={t} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: TH.tagBg, color: TH.tagFg, display: 'flex', alignItems: 'center', gap: 3 }}>
                  #{t} <span style={{ cursor: 'pointer', opacity: 0.5 }} onClick={() => setTags(prev => prev.filter(x => x !== t))}>&#215;</span>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) } }}
                placeholder={tags.length === 0 ? 'Add tags...' : ''}
                style={{ border: 'none', outline: 'none', fontSize: 12, flex: 1, minWidth: 60, color: TH.text, background: 'transparent' }}
              />
            </div>
            {suggestions.length > 0 && (
              <div style={{ border: `1px solid ${TH.border}`, borderRadius: 6, marginTop: 2, background: TH.dropdownBg }}>
                {suggestions.slice(0, 5).map(t => (
                  <div key={t} style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', color: TH.text }} onClick={() => addTag(t)}>#{t}</div>
                ))}
              </div>
            )}
          </div>

          {/* Priority */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TH.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Priority</label>
            <div style={{ marginTop: 4, display: 'flex', background: TH.segBg, borderRadius: 8, padding: 2, gap: 1 }}>
              {(['low', 'medium', 'high'] as Priority[]).map(p => (
                <button key={p} onClick={() => setPriority(p)} style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: priority === p ? TH.segActive : 'transparent', color: priority === p ? TH.text : TH.secondary, boxShadow: priority === p ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
                  {p === 'medium' ? 'Med' : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Save button */}
          <button onClick={save} disabled={state === 'saving'} style={{ padding: '10px 0', borderRadius: 10, border: 'none', background: TH.copper, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: state === 'saving' ? 0.7 : 1 }}>
            {state === 'saving' ? 'Saving...' : state === 'error' ? 'Saved offline - will retry' : 'Save'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Status filter tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${TH.border}` }}>
            {(['unread', 'read', 'archived'] as ListFilter[]).map(f => (
              <button key={f} onClick={() => setListFilter(f)} style={{ flex: 1, padding: '8px 0', border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: listFilter === f ? TH.copper : TH.secondary, borderBottom: listFilter === f ? `2px solid ${TH.copper}` : '2px solid transparent', marginBottom: -1 }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Items list */}
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {listLoading ? (
              <div style={{ padding: 16, fontSize: 12, color: TH.secondary, textAlign: 'center' }}>Loading...</div>
            ) : listItems.length === 0 ? (
              <div style={{ padding: '36px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                <img src="/icon/128.png" width={48} height={48} style={{ borderRadius: 12, opacity: 0.9 }} alt="StashBro" />
                <div style={{ fontSize: 13, fontWeight: 600, color: TH.text }}>{EMPTY_COPY[listFilter][0]}</div>
                <div style={{ fontSize: 11.5, color: TH.secondary }}>{EMPTY_COPY[listFilter][1]}</div>
              </div>
            ) : listItems.map(item => (
              <div
                key={item.id}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: `1px solid ${TH.border}`, position: 'relative' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: TH.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: TH.secondary }}>{item.domain}</span>
                    <span style={{ fontSize: 11, color: TH.secondary }}>{relTime(item.created_at)}</span>
                  </div>
                </div>
                {/* hover actions - revealed on row hover only */}
                {hoveredId === item.id && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      title={copiedId === item.id ? 'Copied!' : 'Copy link'}
                      onClick={() => copyLink(item.id, item.url)}
                      style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${TH.border}`, background: TH.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: copiedId === item.id ? TH.copper : TH.text }}
                    >{copiedId === item.id ? '✓' : '⧉'}</button>
                    {listFilter !== 'read' && (
                      <button
                        title="Mark as read"
                        onClick={() => updateStatus(item.id, 'read')}
                        style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${TH.border}`, background: TH.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: TH.text }}
                      >&#10003;</button>
                    )}
                    {listFilter !== 'archived' && (
                      <button
                        title="Archive"
                        onClick={() => updateStatus(item.id, 'archived')}
                        style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${TH.border}`, background: TH.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: TH.text }}
                      >&#9744;</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
