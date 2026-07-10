// packages/extension/entrypoints/popup/PopupApp.tsx
import React, { useState, useEffect } from 'react'
import { detectType, extractDomain } from '@stashbro/shared'
import { saveWithRetry } from '../background.js'

type Priority = 'low' | 'medium' | 'high'

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

export default function PopupApp() {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [detectedType, setDetectedType] = useState('article')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [priority, setPriority] = useState<Priority>('medium')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // null = loading (prevents configured/unconfigured flash on open)
  const [configured, setConfigured] = useState<boolean | null>(null)

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
    <div style={{ padding: 16, width: 280, fontFamily: 'system-ui', background: TH.bg, boxSizing: 'border-box' }}>
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
    <div style={{ padding: 16, width: 280, fontFamily: 'system-ui', background: TH.bg, display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${TH.border}`, paddingBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: TH.copper, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>S</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TH.text }}>StashBro</div>
          <div style={{ fontSize: 11, color: TH.secondary }}>Save current page</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: tc.bg, color: tc.fg }}>{detectedType.toUpperCase()}</div>
      </div>

      {/* Title */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: TH.secondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '6px 8px', borderRadius: 6, border: `1px solid ${TH.border}`, fontSize: 13, boxSizing: 'border-box', outline: 'none', color: TH.text, background: TH.surface }} />
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
  )
}
