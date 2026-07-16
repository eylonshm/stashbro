// packages/extension/entrypoints/options/main.tsx
import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { validateOptions } from '../../src/validateOptions.js'

// ponytail: one-time read at module load; same pattern as popup TH token map
const DARK = window.matchMedia('(prefers-color-scheme: dark)').matches

const TH = {
  bg:       DARK ? '#1A1B23' : '#FFFFFF',
  surface:  DARK ? '#24263A' : '#F5F5F7',
  text:     DARK ? '#E8E9F4' : '#12131C',
  secondary:DARK ? '#6B6E87' : '#9EA1B4',
  border:   DARK ? 'rgba(255,255,255,.09)' : 'rgba(18,19,28,.12)',
  copper:   '#C87A38',
  success:  '#1F7A47',
  error:    '#B53030',
}

function OptionsApp() {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  const [serverMode, setServerMode] = useState<'token' | 'magic-link' | 'unknown'>('unknown')
  const [email, setEmail] = useState('')
  const [codeStep, setCodeStep] = useState(false)
  const [code, setCode] = useState('')

  useEffect(() => {
    browser.storage.local.get(['serverURL', 'serverToken']).then((s) => {
      if (s.serverURL) setUrl(s.serverURL as string)
      if (s.serverToken) setToken(s.serverToken as string)
    })
  }, [])

  const showStatus = (msg: string, ok: boolean, ms = 2500) => {
    setStatus({ msg, ok })
    setTimeout(() => setStatus(null), ms)
  }

  const detectMode = async (serverUrl: string): Promise<'token' | 'magic-link' | 'unknown'> => {
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/health`)
      if (!res.ok) return 'unknown'
      const data = await res.json() as { mode?: string }
      return data.mode === 'magic-link' ? 'magic-link' : 'token'
    } catch { return 'unknown' }
  }

  const save = async () => {
    if (!url) { showStatus('Server URL required', false, 3500); return }
    const base = url.replace(/\/$/, '')
    const mode = await detectMode(base)
    setServerMode(mode)
    if (mode === 'magic-link') {
      await browser.storage.local.set({ serverURL: base })
      showStatus('Magic-link mode detected. Sign in below.', true, 4000)
      return
    }
    const err = validateOptions(url, token)
    if (err) { showStatus(err, false, 3500); return }
    await browser.storage.local.set({ serverURL: base, serverToken: token.trim() })
    showStatus('Saved!', true)
  }

  const test = async () => {
    try {
      const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${token}` } })
      showStatus(res.ok ? 'Connected!' : `Error: ${res.status}`, res.ok, 3000)
    } catch {
      showStatus('Connection failed', false, 3000)
    }
  }

  const sendCode = async () => {
    if (!email.trim()) { showStatus('Email required', false); return }
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/auth/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) { showStatus('Failed to send code', false); return }
      setCodeStep(true)
      showStatus('Code sent! Check your email.', true, 5000)
    } catch { showStatus('Connection failed', false) }
  }

  const verifyCode = async () => {
    if (!code.trim()) { showStatus('Code required', false); return }
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      if (!res.ok) { showStatus('Invalid code', false); return }
      const data = await res.json() as { accessToken: string; refreshToken: string }
      await browser.storage.local.set({ serverToken: data.accessToken, refreshToken: data.refreshToken })
      setCodeStep(false)
      showStatus('Signed in!', true)
    } catch { showStatus('Verification failed', false) }
  }

  const input: React.CSSProperties = {
    display: 'block',
    width: '100%',
    margin: '6px 0 16px',
    padding: '8px 10px',
    borderRadius: 6,
    border: `1px solid ${TH.border}`,
    fontSize: 14,
    boxSizing: 'border-box',
    color: TH.text,
    background: TH.surface,
    outline: 'none',
  }

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: TH.secondary }

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 400, margin: '40px auto', padding: 24, background: TH.bg, minHeight: '100vh', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: TH.text, margin: 0 }}>Settings</h2>
      </div>

      <label style={label}>Server URL</label>
      <input
        value={url}
        onChange={e => setUrl(e.target.value)}
        style={input}
        placeholder="https://your-stashbro.fly.dev"
      />

      {serverMode !== 'magic-link' && (
        <>
          <label style={label}>Bearer Token</label>
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            type="password"
            style={input}
            placeholder="your-secret-token"
          />
        </>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={save}
          style={{ padding: '8px 16px', background: TH.copper, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          Save
        </button>
        {serverMode !== 'magic-link' && (
          <button
            onClick={test}
            style={{ padding: '8px 16px', background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 8, fontSize: 14, cursor: 'pointer', color: TH.text }}
          >
            Test Connection
          </button>
        )}
      </div>

      {serverMode === 'magic-link' && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: TH.secondary, marginBottom: 8 }}>Sign In (Hosted Mode)</div>
          {!codeStep ? (
            <>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                style={input}
                placeholder="you@example.com"
              />
              <button
                onClick={sendCode}
                style={{ padding: '8px 16px', background: TH.copper, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Send Code
              </button>
            </>
          ) : (
            <>
              <input
                value={code}
                onChange={e => setCode(e.target.value)}
                style={input}
                placeholder="6-digit code"
                maxLength={6}
              />
              <button
                onClick={verifyCode}
                style={{ padding: '8px 16px', background: TH.copper, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Verify
              </button>
            </>
          )}
        </div>
      )}

      {status && (
        <div style={{ marginTop: 12, fontSize: 13, fontWeight: 500, color: status.ok ? TH.success : TH.error }}>
          {status.msg}
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<OptionsApp />)
