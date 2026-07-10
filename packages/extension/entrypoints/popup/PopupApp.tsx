// packages/extension/entrypoints/popup/PopupApp.tsx
import React, { useState, useEffect } from 'react'
import { detectType, extractDomain } from '@stashbro/shared'
import { saveWithRetry } from '../background.js'

type Priority = 'low' | 'medium' | 'high'

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  video: { bg: '#FCEAEA', fg: '#B53030' }, post: { bg: '#EAF0FD', fg: '#2A56A8' },
  article: { bg: '#E8F7EF', fg: '#1F7A47' }, other: { bg: '#F2EDF8', fg: '#6441A0' },
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
  const [configured, setConfigured] = useState(true)

  useEffect(() => {
    // Get current tab URL
    browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.url) return
      setUrl(tab.url)
      setTitle(tab.title ?? tab.url)
      setDetectedType(detectType(tab.url))
    })

    // Load settings and existing tags
    browser.storage.local.get(['serverURL', 'serverToken']).then(async (s) => {
      if (!s['serverURL'] || !s['serverToken']) { setConfigured(false); return }
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

  if (!configured) {
    return (
      <div style={{ padding: 16, width: 280, fontFamily: 'system-ui' }}>
        <div style={{ fontSize: 14, color: '#5E6175' }}>
          Configure StashBro server URL and token in extension settings first.
        </div>
      </div>
    )
  }

  if (state === 'saved') {
    return (
      <div style={{ padding: 16, width: 280, fontFamily: 'system-ui' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(145deg,#1F7A47,#0F5A30)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16 }}>&#10003;</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#12131C' }}>Saved!</div>
            <div style={{ fontSize: 12, color: '#9EA1B4' }}>Syncing to your devices</div>
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#12131C', marginBottom: 4 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#9EA1B4' }}>{domain}</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: tc.bg, color: tc.fg }}>{detectedType.toUpperCase()}</span>
          {tags.map(t => <span key={t} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: '#ECEDF4', color: '#4A4D62' }}>#{t}</span>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11 }}>
          <span style={{ color: '#C87A38', cursor: 'pointer' }}>View in StashBro &rarr;</span>
          <span style={{ color: '#9EA1B4' }}>Closes in 2s</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 16, width: 280, fontFamily: 'system-ui', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(18,19,28,.09)', paddingBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: '#C87A38', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>S</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#12131C' }}>StashBro</div>
          <div style={{ fontSize: 11, color: '#9EA1B4' }}>Save current page</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: tc.bg, color: tc.fg }}>{detectedType.toUpperCase()}</div>
      </div>

      {/* Title */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#9EA1B4', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', marginTop: 4, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(18,19,28,.12)', fontSize: 13, boxSizing: 'border-box', outline: 'none', color: '#12131C' }} />
      </div>

      {/* Tags */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#9EA1B4', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tags</label>
        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(18,19,28,.12)', minHeight: 32 }}>
          {tags.map(t => (
            <span key={t} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 99, background: '#ECEDF4', color: '#4A4D62', display: 'flex', alignItems: 'center', gap: 3 }}>
              #{t} <span style={{ cursor: 'pointer', opacity: 0.5 }} onClick={() => setTags(prev => prev.filter(x => x !== t))}>&#215;</span>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) } }}
            placeholder={tags.length === 0 ? 'Add tags...' : ''}
            style={{ border: 'none', outline: 'none', fontSize: 12, flex: 1, minWidth: 60, color: '#12131C', background: 'transparent' }}
          />
        </div>
        {suggestions.length > 0 && (
          <div style={{ border: '1px solid rgba(18,19,28,.12)', borderRadius: 6, marginTop: 2, background: '#fff' }}>
            {suggestions.slice(0, 5).map(t => (
              <div key={t} style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', color: '#12131C' }} onClick={() => addTag(t)}>#{t}</div>
            ))}
          </div>
        )}
      </div>

      {/* Priority */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#9EA1B4', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Priority</label>
        <div style={{ marginTop: 4, display: 'flex', background: 'rgba(18,19,28,.06)', borderRadius: 8, padding: 2, gap: 1 }}>
          {(['low', 'medium', 'high'] as Priority[]).map(p => (
            <button key={p} onClick={() => setPriority(p)} style={{ flex: 1, padding: '4px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: priority === p ? '#fff' : 'transparent', color: priority === p ? '#12131C' : '#9EA1B4', boxShadow: priority === p ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
              {p === 'medium' ? 'Med' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Save button */}
      <button onClick={save} disabled={state === 'saving'} style={{ padding: '10px 0', borderRadius: 10, border: 'none', background: '#C87A38', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: state === 'saving' ? 0.7 : 1 }}>
        {state === 'saving' ? 'Saving...' : state === 'error' ? 'Retry' : 'Save'}
      </button>
    </div>
  )
}
