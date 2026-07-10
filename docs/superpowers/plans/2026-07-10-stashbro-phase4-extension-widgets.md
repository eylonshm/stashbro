# StashBro Phase 4 - Browser Extension + Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the WXT Manifest V3 browser extension (Chrome/Arc + Safari), Mac WidgetKit widget (small/medium), and iOS WidgetKit widget (small/medium).

**Architecture:** Extension lives in `packages/extension/` using WXT + `@stashbro/shared` API client for direct server POST (no local sync store - just offline retry queue in extension storage). Safari extension is produced by running `xcrun safari-web-extension-converter` on the WXT output. Mac and iOS widgets are Swift WidgetKit targets added to the existing XcodeGen project, reading from App Group SQLite (populated by their respective main apps).

**Tech Stack:** WXT (Manifest V3), @stashbro/shared, WidgetKit (Swift), GRDB (widget reads app-group store)

## Global Constraints

- WXT for extension scaffold (Manifest V3); Chrome/Arc and Safari targets
- Extension uses `@stashbro/shared` `StashBroClient` directly (no local SQLite in extension)
- Offline retry queue stored in `chrome.storage.local` (not IndexedDB)
- Safari extension: `xcrun safari-web-extension-converter --app-name StashBro <wxt-output-dir>` produces Xcode project; integrated into `apps/mac/` as a separate target
- WidgetKit widget targets added to `apps/mac/project.yml`; reads from `AppDatabase.makeShared()`
- iOS widget added to `apps/mobile/`'s Expo prebuild as a Swift WidgetKit extension target
- All widget data comes from App Group SQLite - no network calls in widgets

---

### Task 1: Extension Package Scaffold (WXT)

**Files:**
- Create: `packages/extension/package.json`
- Create: `packages/extension/wxt.config.ts`
- Create: `packages/extension/tsconfig.json`
- Create: `packages/extension/entrypoints/background.ts`
- Create: `packages/extension/entrypoints/popup/index.html`

**Interfaces:**
- Consumes: `@stashbro/shared` from Phase 1
- Produces: `pnpm dev` starts WXT dev server; `pnpm build` emits `packages/extension/.output/chrome-mv3/` and `packages/extension/.output/safari-mv3/`

- [ ] **Step 1: Create packages/extension/package.json**

```json
{
  "name": "@stashbro/extension",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "build:safari": "wxt build -b safari",
    "zip": "wxt zip",
    "test": "vitest run"
  },
  "dependencies": {
    "@stashbro/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.279",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@wxt-dev/module-react": "^1.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "wxt": "^0.19.0"
  }
}
```

- [ ] **Step 2: Create wxt.config.ts**

```typescript
// packages/extension/wxt.config.ts
import { defineConfig } from 'wxt'

export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'StashBro',
    description: 'Save links to your StashBro reading list',
    version: '1.0.0',
    permissions: ['storage', 'activeTab', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    action: {
      default_popup: 'popup/index.html',
      default_icon: { '16': 'icon/16.png', '32': 'icon/32.png', '48': 'icon/48.png', '128': 'icon/128.png' },
    },
  },
  vite: () => ({
    resolve: {
      alias: { '@stashbro/shared': '../../packages/shared/src/index.ts' },
    },
  }),
})
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ESNext", "DOM"],
    "moduleResolution": "Bundler"
  },
  "include": ["entrypoints/**/*", "public/**/*", "*.ts"]
}
```

- [ ] **Step 4: Create background.ts (context menu setup)**

```typescript
// packages/extension/entrypoints/background.ts
export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'stashbro-save',
      title: 'Save to StashBro',
      contexts: ['link', 'page'],
    })
  })

  browser.contextMenus.onClicked.addListener(async (info) => {
    const url = info.linkUrl ?? info.pageUrl
    if (!url) return
    const settings = await browser.storage.local.get(['serverURL', 'serverToken'])
    if (!settings.serverURL || !settings.serverToken) return
    await saveWithRetry({ url, title: url })
  })
})

export async function saveWithRetry(item: { url: string; title?: string; tag_names?: string[]; priority?: string }): Promise<boolean> {
  const settings = await browser.storage.local.get(['serverURL', 'serverToken'])
  if (!settings.serverURL || !settings.serverToken) {
    await enqueueOffline(item)
    return false
  }
  try {
    const res = await fetch(`${settings.serverURL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.serverToken}` },
      body: JSON.stringify(item),
    })
    if (!res.ok) { await enqueueOffline(item); return false }
    return true
  } catch {
    await enqueueOffline(item)
    return false
  }
}

async function enqueueOffline(item: object) {
  const { offlineQueue = [] } = await browser.storage.local.get('offlineQueue')
  offlineQueue.push({ ...item, queuedAt: Date.now() })
  await browser.storage.local.set({ offlineQueue })
}
```

- [ ] **Step 5: Create popup placeholder**

```html
<!-- packages/extension/entrypoints/popup/index.html -->
<!doctype html>
<html>
<head><meta charset="utf-8"><title>StashBro</title></head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 6: Install and verify build**

```bash
cd packages/extension && pnpm install
pnpm build 2>&1 | tail -10
```

Expected: `.output/chrome-mv3/` created, no errors

- [ ] **Step 7: Commit**

```bash
git add packages/extension/
git commit -m "feat(extension): WXT Manifest V3 scaffold, context menu save, offline retry queue"
```

---

### Task 2: Extension Popup UI

**Files:**
- Create: `packages/extension/entrypoints/popup/main.tsx`
- Create: `packages/extension/entrypoints/popup/PopupApp.tsx`
- Create: `packages/extension/entrypoints/popup/OfflineRetryQueue.ts`
- Test: `packages/extension/src/OfflineRetryQueue.test.ts`

**Interfaces:**
- Consumes: `detectType`, `extractDomain` from `@stashbro/shared`; `saveWithRetry` from `background.ts`; `browser.storage.local` for settings + offline queue
- Produces:
  - Popup UI (280px wide): StashBro logo header; editable title field (auto-filled from active tab); type badge (auto-detected); tag autocomplete input (shows existing tags from server GET /tags); priority segmented control (Low/Med/High, default Med); Save button; saved state (checkmark + "Saved!" + "Closes in 2s")
  - `OfflineRetryQueue` class: `enqueue(item)`, `flush(settings)`, `getQueue()` backed by `chrome.storage.local`

- [ ] **Step 1: Write failing test for OfflineRetryQueue**

```typescript
// packages/extension/src/OfflineRetryQueue.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OfflineRetryQueue } from './OfflineRetryQueue.js'

// Mock chrome.storage.local
const store: Record<string, unknown> = {}
const mockStorage = {
  get: vi.fn(async (key: string) => ({ [key]: store[key] })),
  set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
}

describe('OfflineRetryQueue', () => {
  beforeEach(() => { Object.keys(store).forEach(k => delete store[k]); vi.clearAllMocks() })

  it('enqueues item to storage', async () => {
    const q = new OfflineRetryQueue(mockStorage as any)
    await q.enqueue({ url: 'https://example.com', title: 'Test' })
    expect(mockStorage.set).toHaveBeenCalled()
    const queue = await q.getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]!.url).toBe('https://example.com')
  })

  it('flush calls save for each item and clears on success', async () => {
    const q = new OfflineRetryQueue(mockStorage as any)
    await q.enqueue({ url: 'https://example.com', title: 'Test' })
    const mockSave = vi.fn(async () => true)
    await q.flush(mockSave)
    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(await q.getQueue()).toHaveLength(0)
  })

  it('keeps items in queue if flush fails', async () => {
    const q = new OfflineRetryQueue(mockStorage as any)
    await q.enqueue({ url: 'https://example.com', title: 'Test' })
    const mockSave = vi.fn(async () => false)
    await q.flush(mockSave)
    expect(await q.getQueue()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/extension && pnpm test -- OfflineRetryQueue.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement OfflineRetryQueue.ts**

```typescript
// packages/extension/src/OfflineRetryQueue.ts
type SaveFn = (item: QueueItem) => Promise<boolean>

interface QueueItem {
  url: string
  title?: string
  tag_names?: string[]
  priority?: string
  queuedAt: number
}

type StorageArea = typeof chrome.storage.local

export class OfflineRetryQueue {
  private storage: StorageArea
  private readonly key = 'stashbro:offlineQueue'

  constructor(storage: StorageArea = chrome.storage.local) {
    this.storage = storage
  }

  async enqueue(item: Omit<QueueItem, 'queuedAt'>): Promise<void> {
    const queue = await this.getQueue()
    queue.push({ ...item, queuedAt: Date.now() })
    await this.storage.set({ [this.key]: queue })
  }

  async getQueue(): Promise<QueueItem[]> {
    const result = await this.storage.get(this.key)
    return (result[this.key] as QueueItem[]) ?? []
  }

  async flush(save: SaveFn): Promise<void> {
    const queue = await this.getQueue()
    const remaining: QueueItem[] = []
    for (const item of queue) {
      const ok = await save(item)
      if (!ok) remaining.push(item)
    }
    await this.storage.set({ [this.key]: remaining })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/extension && pnpm test -- OfflineRetryQueue.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Implement PopupApp.tsx**

```tsx
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
      if (!s.serverURL || !s.serverToken) { setConfigured(false); return }
      try {
        const res = await fetch(`${s.serverURL}/tags`, {
          headers: { Authorization: `Bearer ${s.serverToken}` },
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
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(145deg,#1F7A47,#0F5A30)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16 }}>✓</div>
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
          <span style={{ color: '#C87A38', cursor: 'pointer' }}>View in StashBro →</span>
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
              #{t} <span style={{ cursor: 'pointer', opacity: 0.5 }} onClick={() => setTags(prev => prev.filter(x => x !== t))}>×</span>
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
```

- [ ] **Step 6: Create popup main.tsx entry**

```tsx
// packages/extension/entrypoints/popup/main.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import PopupApp from './PopupApp.js'

const root = document.getElementById('root')!
createRoot(root).render(<PopupApp />)
```

- [ ] **Step 6a: Install dependencies**

```bash
cd packages/extension && pnpm install
```

Expected: `react`, `react-dom`, `@wxt-dev/module-react` resolved from `package.json` devDependencies (already declared in Task 1 Step 1)

- [ ] **Step 7: Build and verify popup**

```bash
cd packages/extension && pnpm build 2>&1 | tail -10
```

Expected: `BUILD SUCCEEDED`; popup HTML present in `.output/chrome-mv3/popup/`

- [ ] **Step 8: Commit**

```bash
git add packages/extension/
git commit -m "feat(extension): popup UI (title, type badge, tag autocomplete, priority segmented, offline retry)"
```

---

### Task 3: Extension Settings Page + Safari Conversion

**Files:**
- Create: `packages/extension/entrypoints/options/index.html`
- Create: `packages/extension/entrypoints/options/main.tsx`

**Interfaces:**
- Consumes: `browser.storage.local` for serverURL + serverToken; WXT build output
- Produces:
  - Options page: server URL field, token field, "Save" button, "Test Connection" button (GET /health)
  - Safari extension: `xcrun safari-web-extension-converter --app-name StashBro --bundle-identifier com.stashbro.app.extension .output/safari-mv3/` produces `StashBroExtension/` Xcode project; integrate as target in `apps/mac/project.yml`

- [ ] **Step 1: Implement options page**

```tsx
// packages/extension/entrypoints/options/main.tsx
import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

function OptionsApp() {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    browser.storage.local.get(['serverURL', 'serverToken']).then((s) => {
      if (s.serverURL) setUrl(s.serverURL as string)
      if (s.serverToken) setToken(s.serverToken as string)
    })
  }, [])

  const save = async () => {
    await browser.storage.local.set({ serverURL: url, serverToken: token })
    setStatus('Saved!')
    setTimeout(() => setStatus(''), 2000)
  }

  const test = async () => {
    try {
      const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${token}` } })
      setStatus(res.ok ? 'Connected!' : `Error: ${res.status}`)
    } catch { setStatus('Connection failed') }
    setTimeout(() => setStatus(''), 3000)
  }

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 400, margin: '40px auto', padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>StashBro Settings</h2>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Server URL</label>
      <input value={url} onChange={e => setUrl(e.target.value)} style={{ display: 'block', width: '100%', margin: '6px 0 16px', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} placeholder="https://your-stashbro.fly.dev" />
      <label style={{ fontSize: 12, fontWeight: 600, color: '#666' }}>Bearer Token</label>
      <input value={token} onChange={e => setToken(e.target.value)} type="password" style={{ display: 'block', width: '100%', margin: '6px 0 16px', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} placeholder="your-secret-token" />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} style={{ padding: '8px 16px', background: '#C87A38', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Save</button>
        <button onClick={test} style={{ padding: '8px 16px', background: '#f0f0f0', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>Test Connection</button>
      </div>
      {status && <div style={{ marginTop: 12, fontSize: 13, color: '#1F7A47' }}>{status}</div>}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<OptionsApp />)
```

```html
<!-- packages/extension/entrypoints/options/index.html -->
<!doctype html><html><head><meta charset="utf-8"><title>StashBro Settings</title></head>
<body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>
```

Update `wxt.config.ts` to add `options_ui`:

```typescript
manifest: {
  // ... existing ...
  options_ui: { page: 'options/index.html', open_in_tab: true },
},
```

- [ ] **Step 2: Build Safari extension variant**

```bash
cd packages/extension && pnpm build:safari 2>&1 | tail -5
```

Expected: `.output/safari-mv3/` created

- [ ] **Step 3: Convert to Safari Xcode project**

```bash
cd packages/extension
xcrun safari-web-extension-converter \
  --app-name StashBro \
  --bundle-identifier com.stashbro.app.extension \
  --swift \
  --force \
  .output/safari-mv3/
```

Expected: `StashBroExtension/` directory created with Xcode project. Move to `apps/mac/`:

```bash
mv StashBroExtension ../../../apps/mac/StashBroSafariExtension
```

- [ ] **Step 4: Add Safari extension target to project.yml**

In `apps/mac/project.yml`, add:

```yaml
targets:
  StashBroSafariExtension:
    type: app-extension
    platform: macOS
    sources:
      - path: StashBroSafariExtension/StashBro Extension
    info:
      path: StashBroSafariExtension/StashBro Extension/Info.plist
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.stashbro.app.extension
        MACOSX_DEPLOYMENT_TARGET: "14.0"
```

Then regenerate:

```bash
cd apps/mac && xcodegen generate
```

- [ ] **Step 5: Commit**

```bash
git add packages/extension/ apps/mac/StashBroSafariExtension/ apps/mac/project.yml
git commit -m "feat(extension): options page, Safari extension via xcrun converter, integrated into mac project"
```

---

### Task 4: Mac WidgetKit Widget

**Files:**
- Create: `apps/mac/StashBroWidget/StashBroWidget.swift`
- Create: `apps/mac/StashBroWidget/StashBroWidgetBundle.swift`
- Modify: `apps/mac/project.yml` (add widget extension target)

**Interfaces:**
- Consumes: `AppDatabase.makeShared()`, `StashItem`, `Tag`, `ItemTag`, `ItemType`, `ItemPriority` from Phase 2 Tasks 2-3
- Produces:
  - Mac WidgetKit widget extension target: `com.stashbro.app.widget`
  - `StashBroWidgetEntry: TimelineEntry`: `unreadCount: Int`, `recentItems: [(title: String, type: ItemType, isHighPriority: Bool)]`
  - Small widget: unread count number
  - Medium widget (329x141pt): unread count + 3 most-recent items with type dot + priority dot (high only)
  - Timeline refreshes every 15 minutes via `TimelineReloadPolicy.after(date)`
  - Data read from App Group SQLite via `AppDatabase.makeShared()`

- [ ] **Step 1: Update project.yml with widget target**

```yaml
# Append to targets: in apps/mac/project.yml
  StashBroWidget:
    type: app-extension
    platform: macOS
    sources:
      - path: StashBroWidget
      - path: StashBro/DB/AppDatabase.swift
      - path: StashBro/DB/StashItem+DB.swift
      - path: StashBro/DB/Tag+DB.swift
    info:
      path: StashBroWidget/Info.plist
      properties:
        CFBundleIdentifier: com.stashbro.app.widget
        NSExtension:
          NSExtensionPointIdentifier: com.apple.widgetkit-extension
        com.apple.security.application-groups:
          - group.com.stashbro.app
    dependencies:
      - package: GRDB
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.stashbro.app.widget
        MACOSX_DEPLOYMENT_TARGET: "14.0"
```

Regenerate: `cd apps/mac && xcodegen generate`

- [ ] **Step 2: Implement StashBroWidgetBundle.swift**

```swift
// apps/mac/StashBroWidget/StashBroWidgetBundle.swift
import WidgetKit
import SwiftUI

@main
struct StashBroWidgetBundle: WidgetBundle {
    var body: some Widget { StashBroWidget() }
}
```

- [ ] **Step 3: Implement StashBroWidget.swift**

```swift
// apps/mac/StashBroWidget/StashBroWidget.swift
import WidgetKit
import SwiftUI
import GRDB

struct WidgetItem {
    let title: String
    let type: ItemType
    let isHighPriority: Bool
}

struct StashBroEntry: TimelineEntry {
    let date: Date
    let unreadCount: Int
    let recentItems: [WidgetItem]
}

struct StashBroProvider: TimelineProvider {
    func placeholder(in context: Context) -> StashBroEntry {
        StashBroEntry(date: Date(), unreadCount: 7, recentItems: [
            WidgetItem(title: "Karpathy - Intro to LLMs", type: .video, isHighPriority: true),
            WidgetItem(title: "The Unbundling of Search", type: .article, isHighPriority: false),
            WidgetItem(title: "@levelsio on $1M ARR", type: .post, isHighPriority: false),
        ])
    }

    func getSnapshot(in context: Context, completion: @escaping (StashBroEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StashBroEntry>) -> Void) {
        let entry = loadEntry()
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func loadEntry() -> StashBroEntry {
        let db = AppDatabase.makeShared()
        do {
            let (count, items) = try db.dbWriter.read { dbConn -> (Int, [WidgetItem]) in
                let count = try StashItem
                    .filter(Column("status") == "unread" && Column("deleted_at") == nil)
                    .fetchCount(dbConn)
                let recent = try StashItem
                    .filter(Column("status") == "unread" && Column("deleted_at") == nil)
                    .order(Column("change_seq").desc)
                    .limit(3)
                    .fetchAll(dbConn)
                let widgetItems = recent.map { item in
                    WidgetItem(title: item.title, type: item.type, isHighPriority: item.priority == .high)
                }
                return (count, widgetItems)
            }
            return StashBroEntry(date: Date(), unreadCount: count, recentItems: items)
        } catch {
            return StashBroEntry(date: Date(), unreadCount: 0, recentItems: [])
        }
    }
}

struct StashBroWidget: Widget {
    let kind = "StashBroWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StashBroProvider()) { entry in
            StashBroWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("StashBro")
        .description("Reading queue at a glance")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct StashBroWidgetView: View {
    let entry: StashBroEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall: smallView
        default: mediumView
        }
    }

    private var smallView: some View {
        VStack(alignment: .leading) {
            Text("\(entry.unreadCount)")
                .font(.system(size: 48, weight: .black, design: .rounded))
                .foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
            Text("Unread")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.tertiary)
                .textCase(.uppercase)
                .tracking(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(14)
    }

    private var mediumView: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 1) {
                Text("\(entry.unreadCount)")
                    .font(.system(size: 48, weight: .black, design: .rounded))
                    .foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
                Text("Unread")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.tertiary)
                    .textCase(.uppercase)
                    .tracking(1)
            }
            .frame(width: 80)

            Divider()

            VStack(alignment: .leading, spacing: 7) {
                ForEach(entry.recentItems.prefix(3), id: \.title) { item in
                    HStack(spacing: 6) {
                        Circle().fill(typeColor(item.type)).frame(width: 7, height: 7)
                        if item.isHighPriority {
                            Circle().fill(Color(red: 0.851, green: 0.353, blue: 0.157)).frame(width: 5, height: 5)
                        }
                        Text(item.title)
                            .font(.system(size: 11.5, weight: .medium))
                            .lineLimit(1)
                            .foregroundStyle(.primary)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
    }

    private func typeColor(_ type: ItemType) -> Color {
        switch type {
        case .video: return Color(red: 0.710, green: 0.188, blue: 0.188)
        case .post: return Color(red: 0.165, green: 0.337, blue: 0.659)
        case .article: return Color(red: 0.122, green: 0.478, blue: 0.278)
        case .other: return Color(red: 0.392, green: 0.255, blue: 0.627)
        }
    }
}
```

- [ ] **Step 4: Build widget target**

```bash
cd apps/mac && xcodebuild -scheme StashBroWidget -configuration Debug build 2>&1 | tail -5
```

Expected: `BUILD SUCCEEDED`

- [ ] **Step 5: Commit**

```bash
git add apps/mac/StashBroWidget/ apps/mac/project.yml
git commit -m "feat(mac): WidgetKit widget (small: count, medium: count + 3 items with type/priority dots)"
```

---

### Task 5: iOS WidgetKit Widget

**Files:**
- Create: `apps/mobile/ios-widgets/StashBroIOSWidget.swift`
- Create: `apps/mobile/ios-widgets/StashBroIOSWidgetBundle.swift`
- Modify: `apps/mobile/app.json` (add widget plugin/config)

**Interfaces:**
- Consumes: expo-sqlite DB at App Group path (`group.com.stashbro.mobile`); same WidgetItem/entry types as Mac widget (duplicated in Swift - no sharing across platforms)
- Produces:
  - iOS WidgetKit extension target (added via Expo config plugin or manual Xcode target)
  - Same small/medium layouts as Mac widget reading from `FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.stashbro.mobile")`
  - Uses SQLite directly (no GRDB; simpler: `sqlite3` C API or import SQLite.swift for widget only)

- [ ] **Step 1: Create iOS widget files**

```swift
// apps/mobile/ios-widgets/StashBroIOSWidgetBundle.swift
import WidgetKit
import SwiftUI

@main
struct StashBroIOSWidgetBundle: WidgetBundle {
    var body: some Widget { StashBroIOSWidget() }
}
```

```swift
// apps/mobile/ios-widgets/StashBroIOSWidget.swift
import WidgetKit
import SwiftUI
import SQLite3

struct IOSWidgetEntry: TimelineEntry {
    let date: Date
    let unreadCount: Int
    let recentItems: [(title: String, typeStr: String, isHighPriority: Bool)]
}

struct IOSWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> IOSWidgetEntry {
        IOSWidgetEntry(date: Date(), unreadCount: 7, recentItems: [
            ("Karpathy - Intro to LLMs", "video", true),
            ("The Unbundling of Search", "article", true),
            ("@levelsio on $1M ARR", "post", false),
        ])
    }

    func getSnapshot(in context: Context, completion: @escaping (IOSWidgetEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<IOSWidgetEntry>) -> Void) {
        let entry = loadEntry()
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func loadEntry() -> IOSWidgetEntry {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.stashbro.mobile"
        ) else { return IOSWidgetEntry(date: Date(), unreadCount: 0, recentItems: []) }

        let dbPath = containerURL.appendingPathComponent("stashbro.db").path
        var db: OpaquePointer?
        guard sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else {
            return IOSWidgetEntry(date: Date(), unreadCount: 0, recentItems: [])
        }
        defer { sqlite3_close(db) }

        var count = 0
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM items WHERE status='unread' AND deleted_at IS NULL", -1, &stmt, nil) == SQLITE_OK {
            if sqlite3_step(stmt) == SQLITE_ROW { count = Int(sqlite3_column_int(stmt, 0)) }
            sqlite3_finalize(stmt)
        }

        var items: [(String, String, Bool)] = []
        if sqlite3_prepare_v2(db, "SELECT title, type, priority FROM items WHERE status='unread' AND deleted_at IS NULL ORDER BY change_seq DESC LIMIT 3", -1, &stmt, nil) == SQLITE_OK {
            while sqlite3_step(stmt) == SQLITE_ROW {
                let title = String(cString: sqlite3_column_text(stmt, 0))
                let type_ = String(cString: sqlite3_column_text(stmt, 1))
                let priority = String(cString: sqlite3_column_text(stmt, 2))
                items.append((title, type_, priority == "high"))
            }
            sqlite3_finalize(stmt)
        }

        return IOSWidgetEntry(date: Date(), unreadCount: count, recentItems: items)
    }
}

struct StashBroIOSWidget: Widget {
    let kind = "StashBroIOSWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: IOSWidgetProvider()) { entry in
            IOSWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("StashBro")
        .description("Reading queue at a glance")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct IOSWidgetView: View {
    let entry: IOSWidgetEntry
    @Environment(\.widgetFamily) var family

    private func dotColor(_ type: String) -> Color {
        switch type {
        case "video": return Color(red: 0.710, green: 0.188, blue: 0.188)
        case "post": return Color(red: 0.165, green: 0.337, blue: 0.659)
        case "article": return Color(red: 0.122, green: 0.478, blue: 0.278)
        default: return Color(red: 0.392, green: 0.255, blue: 0.627)
        }
    }

    var body: some View {
        if family == .systemSmall {
            VStack(alignment: .leading) {
                Text("\(entry.unreadCount)").font(.system(size: 48, weight: .black)).foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
                Text("Unread").font(.system(size: 11, weight: .medium)).foregroundStyle(.tertiary).textCase(.uppercase).tracking(1)
            }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading).padding(14)
        } else {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(entry.unreadCount)").font(.system(size: 48, weight: .black)).foregroundStyle(Color(red: 0.784, green: 0.478, blue: 0.220))
                    Text("Unread").font(.system(size: 11, weight: .medium)).foregroundStyle(.tertiary).textCase(.uppercase).tracking(1)
                }.frame(width: 80)
                Divider()
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(entry.recentItems.prefix(3), id: \.0) { item in
                        HStack(spacing: 6) {
                            Circle().fill(dotColor(item.1)).frame(width: 7, height: 7)
                            if item.2 { Circle().fill(Color(red: 0.851, green: 0.353, blue: 0.157)).frame(width: 5, height: 5) }
                            Text(item.0).font(.system(size: 11.5, weight: .medium)).lineLimit(1)
                        }
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.padding(14)
        }
    }
}
```

- [ ] **Step 2: Add widget extension to Expo project via app.json plugin**

```json
{
  "plugins": [
    [
      "expo-build-properties",
      {
        "ios": {
          "extraPods": []
        }
      }
    ]
  ]
}
```

For the iOS widget target, use the `@bacons/apple-targets` config plugin (install: `pnpm add -D @bacons/apple-targets`). Add to `app.json`:

```json
[
  "@bacons/apple-targets",
  {
    "targets": [
      {
        "name": "StashBroWidget",
        "type": "widget",
        "sources": ["ios-widgets"]
      }
    ]
  }
]
```

- [ ] **Step 3: Prebuild to generate iOS project with widget**

```bash
cd apps/mobile && npx expo prebuild --platform ios 2>&1 | tail -10
```

Expected: `ios/` directory contains `StashBroWidget` target

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/ios-widgets/ apps/mobile/app.json
git commit -m "feat(mobile): iOS WidgetKit widget (small/medium, reads app-group SQLite via C API)"
```
