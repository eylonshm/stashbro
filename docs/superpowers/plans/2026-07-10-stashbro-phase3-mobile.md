# StashBro Phase 3 - Mobile App (Expo/iOS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the iOS Expo app (full reading list with search/filter/swipe-archive), iOS share extension (quick-save card: type badge, tags, priority segmented control), settings + tag management screens, and EAS build configuration.

**Architecture:** Expo SDK (latest stable) with expo-sqlite for local SQLite. The app implements `LocalStore` from `packages/shared` over expo-sqlite. `@stashbro/shared` is consumed as a monorepo workspace package. Share extension uses `expo-share-extension` (MaxAst/expo-share-extension, last updated Feb 2026) config plugin, writing to the same App Group SQLite; the main app syncs on foreground.

**Tech Stack:** Expo SDK latest stable, expo-sqlite, expo-router, expo-share-extension, @stashbro/shared, @react-native-async-storage/async-storage, EAS Build, iOS 16+

## Global Constraints

- Expo SDK latest stable; expo-router for navigation
- expo-sqlite for local database (no raw SQLite bindings)
- `@stashbro/shared` imported as monorepo workspace package (`workspace:*`)
- `expo-share-extension` (MaxAst, v1.5+) for iOS share extension via config plugin
- iOS 16+ deployment target; App Group: `group.com.stashbro.mobile`
- EAS Build for distribution; `npx expo prebuild` generates native code locally
- `metro.config.js` must wrap with `withShareExtension` from `expo-share-extension/metro`
- Vitest for pure TS logic tests (no device); no Detox in this phase

---

### Task 1: Expo Project Scaffold

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/eas.json`
- Create: `apps/mobile/metro.config.js`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/vitest.config.ts`
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/index.tsx` (stub)

**Interfaces:**
- Consumes: `@stashbro/shared` from Phase 1
- Produces: runnable Expo skeleton; `@stashbro/shared` resolves via metro; `eas build` configured

- [ ] **Step 1: Create apps/mobile/package.json**

```json
{
  "name": "@stashbro/mobile",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "prebuild": "expo prebuild",
    "build:ios": "eas build --platform ios",
    "test": "vitest run"
  },
  "dependencies": {
    "@react-native-async-storage/async-storage": "2.1.0",
    "@stashbro/shared": "workspace:*",
    "expo": "~53.0.0",
    "expo-router": "~4.0.0",
    "expo-share-extension": "^1.5.0",
    "expo-sqlite": "~15.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.0",
    "react-native-gesture-handler": "~2.20.0",
    "react-native-reanimated": "~3.16.0",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.1.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "~18.3.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create app.json**

```json
{
  "expo": {
    "name": "StashBro",
    "slug": "stashbro",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "stashbro",
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.stashbro.mobile",
      "deploymentTarget": "16.0",
      "entitlements": {
        "com.apple.security.application-groups": ["group.com.stashbro.mobile"]
      }
    },
    "plugins": [
      "expo-router",
      "expo-sqlite",
      [
        "expo-share-extension",
        {
          "activationRules": {
            "NSExtensionActivationSupportsWebURLWithMaxCount": 1
          },
          "backgroundColor": "#ffffff",
          "height": 420,
          "rootComponent": "./share-extension/index"
        }
      ]
    ],
    "experiments": { "typedRoutes": true }
  }
}
```

- [ ] **Step 3: Create eas.json**

```json
{
  "cli": { "version": ">= 13.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "production": {
      "ios": { "simulator": false }
    }
  }
}
```

- [ ] **Step 4: Create metro.config.js**

```javascript
// apps/mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config')
const { withShareExtension } = require('expo-share-extension/metro')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = withShareExtension(config)
```

- [ ] **Step 5: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-native",
    "lib": ["ESNext"],
    "paths": { "@stashbro/shared": ["../../packages/shared/src/index.ts"] }
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

- [ ] **Step 6: Create vitest.config.ts**

```typescript
// apps/mobile/vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 7: Create app/_layout.tsx**

```tsx
// apps/mobile/app/_layout.tsx
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
```

- [ ] **Step 8: Create stub app/index.tsx**

```tsx
// apps/mobile/app/index.tsx
import { View, Text } from 'react-native'
export default function HomeScreen() {
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>StashBro</Text></View>
}
```

- [ ] **Step 9: Install and verify shared package resolves**

```bash
cd apps/mobile && pnpm install
node -e "require('../../packages/shared/dist/index.js'); console.log('shared OK')"
```

Expected: `shared OK`

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/
git commit -m "feat(mobile): Expo scaffold, expo-router, expo-share-extension, EAS config, metro monorepo"
```

---

### Task 2: Local Database Layer (expo-sqlite)

**Files:**
- Create: `apps/mobile/src/db/schema.ts`
- Create: `apps/mobile/src/db/database.ts`
- Test: `apps/mobile/src/db/schema.test.ts`

**Interfaces:**
- Consumes: expo-sqlite
- Produces:
  - `MIGRATIONS: string[]` - DDL strings for items/tags/item_tags tables
  - `openDatabase(name?: string): SQLiteDatabase` - opens SQLite, runs migrations, WAL mode
  - Schema: items (id, user_id, url, title, description, thumbnail_url, favicon_url, domain, type CHECK, status CHECK, priority CHECK, created_at, updated_at, deleted_at, change_seq), tags (id, user_id, name, UNIQUE(user_id,name)), item_tags (item_id, tag_id, PRIMARY KEY)

- [ ] **Step 1: Write failing test**

```typescript
// apps/mobile/src/db/schema.test.ts
import { describe, it, expect } from 'vitest'
import { MIGRATIONS } from './schema.js'

describe('MIGRATIONS', () => {
  it('items table has required columns', () => {
    const sql = MIGRATIONS.join('\n')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS items')
    expect(sql).toContain('change_seq')
    expect(sql).toContain('priority')
    expect(sql).toContain('deleted_at')
  })
  it('tags table has unique constraint', () => {
    const sql = MIGRATIONS.join('\n')
    expect(sql).toContain('UNIQUE(user_id, name)')
  })
  it('item_tags has composite primary key', () => {
    const sql = MIGRATIONS.join('\n')
    expect(sql).toContain('PRIMARY KEY')
    expect(sql).toContain('item_tags')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && pnpm test -- schema.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement schema.ts**

```typescript
// apps/mobile/src/db/schema.ts
export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    favicon_url TEXT,
    domain TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'article' CHECK(type IN ('video','post','article','other')),
    status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','archived')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    change_seq INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS items_user_seq ON items(user_id, change_seq)`,
  `CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(user_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS item_tags (
    item_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (item_id, tag_id)
  )`,
]
```

- [ ] **Step 4: Implement database.ts**

```typescript
// apps/mobile/src/db/database.ts
import * as SQLite from 'expo-sqlite'
import { MIGRATIONS } from './schema.js'

let _db: SQLite.SQLiteDatabase | null = null

export function openDatabase(name = 'stashbro.db'): SQLite.SQLiteDatabase {
  if (_db) return _db
  _db = SQLite.openDatabaseSync(name)
  _db.execSync('PRAGMA journal_mode = WAL')
  _db.execSync('PRAGMA foreign_keys = ON')
  for (const sql of MIGRATIONS) { _db.execSync(sql) }
  return _db
}

export function resetDatabase(): void { _db = null }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/mobile && pnpm test -- schema.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/db/
git commit -m "feat(mobile): expo-sqlite schema DDL (items/tags/item_tags), WAL migration runner"
```

---

### Task 3: SQLiteLocalStore - Sync Engine Integration

**Files:**
- Create: `apps/mobile/src/sync/SQLiteLocalStore.ts`
- Test: `apps/mobile/src/sync/SQLiteLocalStore.test.ts`

**Interfaces:**
- Consumes: `LocalStore`, `SyncChange` from `@stashbro/shared` (Phase 1 Task 4); `openDatabase()` from Task 2
- Produces:
  - `shouldApplyChange(change: SyncChange, existingUpdatedAt: string | null): boolean` - LWW helper (exported for testing)
  - `cursorFromChanges(changes: SyncChange[]): number` - max change_seq (exported for testing)
  - `SQLiteLocalStore` class implementing `LocalStore`: `getChangesSince`, `applyChanges`, `getCursor`, `setCursor` using AsyncStorage for cursor

- [ ] **Step 1: Write failing test**

```typescript
// apps/mobile/src/sync/SQLiteLocalStore.test.ts
import { describe, it, expect } from 'vitest'
import type { SyncChange } from '@stashbro/shared'
import { shouldApplyChange, cursorFromChanges } from './SQLiteLocalStore.js'

function makeChange(overrides: Partial<SyncChange> = {}): SyncChange {
  return {
    id: 'item-1', change_seq: 1,
    updated_at: '2026-01-02T00:00:00.000Z', deleted_at: null,
    url: 'https://example.com', title: 'Test', description: null,
    thumbnail_url: null, favicon_url: null, domain: 'example.com',
    type: 'article', status: 'unread', priority: 'medium', tag_names: [],
    ...overrides,
  }
}

describe('shouldApplyChange', () => {
  it('applies change when no existing item', () => {
    expect(shouldApplyChange(makeChange(), null)).toBe(true)
  })
  it('applies when incoming is newer', () => {
    expect(shouldApplyChange(makeChange({ updated_at: '2026-01-02T00:00:00.000Z' }), '2026-01-01T00:00:00.000Z')).toBe(true)
  })
  it('skips when existing is newer', () => {
    expect(shouldApplyChange(makeChange({ updated_at: '2026-01-01T00:00:00.000Z' }), '2026-01-03T00:00:00.000Z')).toBe(false)
  })
})

describe('cursorFromChanges', () => {
  it('returns max change_seq', () => {
    const changes = [makeChange({ change_seq: 3 }), makeChange({ change_seq: 7 }), makeChange({ change_seq: 2 })]
    expect(cursorFromChanges(changes)).toBe(7)
  })
  it('returns 0 for empty', () => {
    expect(cursorFromChanges([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/mobile && pnpm test -- SQLiteLocalStore.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement SQLiteLocalStore.ts**

```typescript
// apps/mobile/src/sync/SQLiteLocalStore.ts
import type { LocalStore, SyncChange } from '@stashbro/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SQLiteDatabase } from 'expo-sqlite'

export function shouldApplyChange(change: SyncChange, existingUpdatedAt: string | null): boolean {
  if (!existingUpdatedAt) return true
  return change.updated_at > existingUpdatedAt
}

export function cursorFromChanges(changes: SyncChange[]): number {
  return changes.reduce((max, c) => Math.max(max, c.change_seq), 0)
}

const CURSOR_KEY = 'stashbro:sync:cursor'

export class SQLiteLocalStore implements LocalStore {
  private db: SQLiteDatabase
  private userId: string

  constructor(db: SQLiteDatabase, userId = 'default') {
    this.db = db
    this.userId = userId
  }

  async getChangesSince(cursor: number): Promise<SyncChange[]> {
    const rows = this.db.getAllSync<{
      id: string; change_seq: number; updated_at: string; deleted_at: string | null
      url: string; title: string; description: string | null; thumbnail_url: string | null
      favicon_url: string | null; domain: string; type: string; status: string; priority: string
    }>('SELECT * FROM items WHERE user_id = ? AND change_seq > ? ORDER BY change_seq ASC', [this.userId, cursor])

    return rows.map(row => {
      const tagRows = this.db.getAllSync<{ name: string }>(
        'SELECT t.name FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ?', [row.id]
      )
      return {
        id: row.id, change_seq: row.change_seq, updated_at: row.updated_at,
        deleted_at: row.deleted_at, url: row.url, title: row.title,
        description: row.description, thumbnail_url: row.thumbnail_url,
        favicon_url: row.favicon_url, domain: row.domain,
        type: row.type as SyncChange['type'],
        status: row.status as SyncChange['status'],
        priority: row.priority as SyncChange['priority'],
        tag_names: tagRows.map(t => t.name),
      }
    })
  }

  async applyChanges(changes: SyncChange[]): Promise<void> {
    for (const change of changes) {
      const existing = this.db.getFirstSync<{ updated_at: string }>(
        'SELECT updated_at FROM items WHERE id = ?', [change.id]
      )
      if (!shouldApplyChange(change, existing?.updated_at ?? null)) continue

      const nextSeq = ((this.db.getFirstSync<{ seq: number }>(
        'SELECT MAX(change_seq) as seq FROM items WHERE user_id = ?', [this.userId]
      )?.seq) ?? 0) + 1

      if (existing) {
        this.db.runSync(
          'UPDATE items SET url=?,title=?,description=?,thumbnail_url=?,favicon_url=?,domain=?,type=?,status=?,priority=?,updated_at=?,deleted_at=?,change_seq=? WHERE id=?',
          [change.url, change.title, change.description, change.thumbnail_url, change.favicon_url,
           change.domain, change.type, change.status, change.priority, change.updated_at,
           change.deleted_at, nextSeq, change.id]
        )
      } else {
        const now = new Date().toISOString()
        this.db.runSync(
          'INSERT INTO items(id,user_id,url,title,description,thumbnail_url,favicon_url,domain,type,status,priority,created_at,updated_at,deleted_at,change_seq) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [change.id, this.userId, change.url, change.title, change.description, change.thumbnail_url,
           change.favicon_url, change.domain, change.type, change.status, change.priority, now,
           change.updated_at, change.deleted_at, nextSeq]
        )
      }

      this.db.runSync('DELETE FROM item_tags WHERE item_id = ?', [change.id])
      for (const name of change.tag_names) {
        let tag = this.db.getFirstSync<{ id: string }>(
          'SELECT id FROM tags WHERE user_id = ? AND name = ?', [this.userId, name]
        )
        if (!tag) {
          const tagId = crypto.randomUUID()
          this.db.runSync('INSERT INTO tags(id,user_id,name) VALUES(?,?,?)', [tagId, this.userId, name])
          tag = { id: tagId }
        }
        this.db.runSync('INSERT OR IGNORE INTO item_tags(item_id,tag_id) VALUES(?,?)', [change.id, tag.id])
      }
    }
  }

  async getCursor(): Promise<number> {
    const val = await AsyncStorage.getItem(CURSOR_KEY)
    return val ? parseInt(val, 10) : 0
  }

  async setCursor(cursor: number): Promise<void> {
    await AsyncStorage.setItem(CURSOR_KEY, String(cursor))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/mobile && pnpm test -- SQLiteLocalStore.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/sync/
git commit -m "feat(mobile): SQLiteLocalStore implements LocalStore (LWW, tag upsert, AsyncStorage cursor)"
```

---

### Task 4: Main List Screen

**Files:**
- Modify: `apps/mobile/app/index.tsx`
- Create: `apps/mobile/src/components/ItemRow.tsx`
- Create: `apps/mobile/src/components/FilterChips.tsx`
- Create: `apps/mobile/src/hooks/useItems.ts`
- Create: `apps/mobile/src/hooks/useSyncEngine.ts`

**Interfaces:**
- Consumes: `openDatabase()` from Task 2; `SQLiteLocalStore` from Task 3; `SyncEngine`, `StashBroClient` from `@stashbro/shared`
- Produces:
  - Main screen: wordmark header + settings icon; search bar; type filter chips (All/Video/Post/Article); priority chips (Priority: All/High/Low); FlatList of ItemRow; pull-to-refresh triggers sync
  - `ItemRow`: left priority bar (3px, High=#D95A28, Low=#9EA1B4, Medium=none), gradient thumbnail, title 2-line clamp, domain, type badge, tag chips
  - `FilterChips<T>`: horizontal ScrollView of pill chips with active state
  - `useItems(filters)`: queries expo-sqlite, returns `{ items, refresh }`
  - `useSyncEngine()`: wires `StashBroClient` + `SQLiteLocalStore` + `SyncEngine`, syncs on AppState active

- [ ] **Step 1: Implement useItems.ts**

```typescript
// apps/mobile/src/hooks/useItems.ts
import { useState, useEffect, useCallback } from 'react'
import { openDatabase } from '../db/database.js'

export interface LocalItem {
  id: string; url: string; title: string; description: string | null
  thumbnail_url: string | null; favicon_url: string | null
  domain: string; type: string; status: string; priority: string
  created_at: string; updated_at: string; deleted_at: string | null
  change_seq: number; tag_names: string[]
}

interface Filters {
  type?: string; priority?: string; tag?: string
  search?: string; status?: string
}

export function useItems(filters: Filters = {}) {
  const [items, setItems] = useState<LocalItem[]>([])

  const refresh = useCallback(() => {
    const db = openDatabase()
    let sql = `SELECT i.*, GROUP_CONCAT(t.name, ',') as tag_list
      FROM items i
      LEFT JOIN item_tags it ON it.item_id = i.id
      LEFT JOIN tags t ON t.id = it.tag_id
      WHERE i.deleted_at IS NULL AND i.status = ?`
    const params: (string | number)[] = [filters.status ?? 'unread']
    if (filters.type && filters.type !== 'all') { sql += ' AND i.type = ?'; params.push(filters.type) }
    if (filters.priority && filters.priority !== 'all') { sql += ' AND i.priority = ?'; params.push(filters.priority) }
    if (filters.search) {
      sql += ' AND (i.title LIKE ? OR i.url LIKE ?)'
      params.push(`%${filters.search}%`, `%${filters.search}%`)
    }
    if (filters.tag) {
      sql += ' AND i.id IN (SELECT it2.item_id FROM item_tags it2 JOIN tags t2 ON t2.id = it2.tag_id WHERE t2.name = ?)'
      params.push(filters.tag)
    }
    sql += ' GROUP BY i.id ORDER BY i.change_seq DESC LIMIT 100'
    const rows = db.getAllSync<LocalItem & { tag_list: string | null }>(sql, params)
    setItems(rows.map(r => ({ ...r, tag_names: r.tag_list ? r.tag_list.split(',') : [] })))
  }, [filters.type, filters.priority, filters.tag, filters.search, filters.status])

  useEffect(() => { refresh() }, [refresh])
  return { items, refresh }
}
```

- [ ] **Step 2: Implement useSyncEngine.ts**

```typescript
// apps/mobile/src/hooks/useSyncEngine.ts
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SyncEngine, StashBroClient } from '@stashbro/shared'
import { openDatabase } from '../db/database.js'
import { SQLiteLocalStore } from '../sync/SQLiteLocalStore.js'

export function useSyncEngine() {
  const engineRef = useRef<SyncEngine | null>(null)

  useEffect(() => {
    async function init() {
      const [url, token] = await Promise.all([
        AsyncStorage.getItem('stashbro:serverURL'),
        AsyncStorage.getItem('stashbro:serverToken'),
      ])
      if (!url || !token) return
      const db = openDatabase()
      const store = new SQLiteLocalStore(db)
      const client = new StashBroClient({ baseUrl: url, token })
      engineRef.current = new SyncEngine({ client, store })
      void engineRef.current.sync()
    }
    void init()

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void engineRef.current?.sync()
    })
    return () => sub.remove()
  }, [])

  return engineRef.current
}
```

- [ ] **Step 3: Implement FilterChips.tsx**

```tsx
// apps/mobile/src/components/FilterChips.tsx
import React from 'react'
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native'

interface Props<T extends string> {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}

export function FilterChips<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.chip, value === opt.value && styles.active]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={[styles.text, value === opt.value && styles.activeText]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 6, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(18,19,28,.09)' },
  active: { backgroundColor: '#C87A38', borderColor: '#C87A38' },
  text: { fontSize: 12, fontWeight: '500', color: '#5E6175' },
  activeText: { color: '#fff' },
})
```

- [ ] **Step 4: Implement ItemRow.tsx**

```tsx
// apps/mobile/src/components/ItemRow.tsx
import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import type { LocalItem } from '../hooks/useItems.js'

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  video: { bg: '#FCEAEA', fg: '#B53030' }, post: { bg: '#EAF0FD', fg: '#2A56A8' },
  article: { bg: '#E8F7EF', fg: '#1F7A47' }, other: { bg: '#F2EDF8', fg: '#6441A0' },
}
const THUMB_BG: Record<string, string> = {
  video: '#CC0000', post: '#1C1C1C', article: '#3A3A5C', other: '#5A2A8C',
}

export function ItemRow({ item, onArchive }: { item: LocalItem; onArchive: (id: string) => void }) {
  const typeColor = TYPE_COLORS[item.type] ?? TYPE_COLORS['article']!
  const priorityBarColor = item.priority === 'high' ? '#D95A28' : item.priority === 'low' ? '#9EA1B4' : null

  return (
    <TouchableOpacity style={styles.row} onPress={() => Linking.openURL(item.url)} activeOpacity={0.7}>
      {priorityBarColor && <View style={[styles.bar, { backgroundColor: priorityBarColor }]} />}
      <View style={[styles.thumb, { backgroundColor: THUMB_BG[item.type] ?? '#888' }]} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <View style={styles.meta}>
          <Text style={styles.domain}>{item.domain}</Text>
          <View style={[styles.badge, { backgroundColor: typeColor.bg }]}>
            <Text style={[styles.badgeText, { color: typeColor.fg }]}>{item.type.toUpperCase()}</Text>
          </View>
          {item.tag_names.slice(0, 2).map(tag => (
            <View key={tag} style={styles.tag}><Text style={styles.tagText}>#{tag}</Text></View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, gap: 10 },
  bar: { width: 3, borderRadius: 2, alignSelf: 'stretch', marginVertical: 4 },
  thumb: { width: 40, height: 40, borderRadius: 8 },
  info: { flex: 1 },
  title: { fontSize: 14, fontWeight: '500', color: '#12131C', lineHeight: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  domain: { fontSize: 11, color: '#9EA1B4' },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
  tag: { backgroundColor: '#ECEDF4', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 99 },
  tagText: { fontSize: 10, fontWeight: '500', color: '#4A4D62' },
})
```

- [ ] **Step 5: Implement main app/index.tsx**

```tsx
// apps/mobile/app/index.tsx
import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, RefreshControl, SafeAreaView } from 'react-native'
import { router } from 'expo-router'
import { useSyncEngine } from '../src/hooks/useSyncEngine.js'
import { useItems } from '../src/hooks/useItems.js'
import { ItemRow } from '../src/components/ItemRow.js'
import { FilterChips } from '../src/components/FilterChips.js'
import { openDatabase } from '../src/db/database.js'

type TypeFilter = 'all' | 'video' | 'post' | 'article' | 'other'
type PriorityFilter = 'all' | 'high' | 'low'

export default function HomeScreen() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const engine = useSyncEngine()

  const { items, refresh } = useItems({
    type: typeFilter === 'all' ? undefined : typeFilter,
    priority: priorityFilter === 'all' ? undefined : priorityFilter,
    search: search || undefined,
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await engine?.sync()
    refresh()
    setRefreshing(false)
  }, [engine, refresh])

  const archive = useCallback((id: string) => {
    const db = openDatabase()
    db.runSync('UPDATE items SET status=?, updated_at=? WHERE id=?', ['archived', new Date().toISOString(), id])
    refresh()
    void engine?.sync()
  }, [engine, refresh])

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Stash<Text style={styles.accent}>Bro</Text></Text>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Text style={styles.gear}>⚙</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.searchBar}>
        <Text>🔍</Text>
        <TextInput style={styles.searchInput} placeholder="Search your stash…" value={search} onChangeText={setSearch} clearButtonMode="while-editing" />
      </View>
      <FilterChips options={[{label:'All',value:'all'},{label:'Video',value:'video'},{label:'Post',value:'post'},{label:'Article',value:'article'}]} value={typeFilter} onChange={setTypeFilter} />
      <View style={styles.priorityRow}>
        <Text style={styles.priorityLabel}>Priority:</Text>
        <FilterChips options={[{label:'All',value:'all'},{label:'High',value:'high'},{label:'Low',value:'low'}]} value={priorityFilter} onChange={setPriorityFilter} />
      </View>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        renderItem={({ item }) => <ItemRow item={item} onArchive={archive} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECEDF2' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 8 },
  wordmark: { fontSize: 24, fontWeight: '700', color: '#12131C', letterSpacing: -0.5 },
  accent: { color: '#C87A38' },
  gear: { fontSize: 22 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 12, marginTop: 0, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(18,19,28,.09)', gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#12131C' },
  priorityRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  priorityLabel: { fontSize: 12, fontWeight: '500', color: '#9EA1B4', marginRight: 4 },
  sep: { height: 1, backgroundColor: 'rgba(18,19,28,.06)', marginHorizontal: 16 },
})
```

- [ ] **Step 6: Export check**

```bash
cd apps/mobile && npx expo export --platform ios --output-dir /tmp/stashbro-mobile-export 2>&1 | tail -5
```

Expected: bundle export succeeds, no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/index.tsx apps/mobile/src/
git commit -m "feat(mobile): main list screen (search, type/priority filters, ItemRow, swipe-archive, sync engine hook)"
```

---

### Task 5: Settings + Tag Management Screens

**Files:**
- Create: `apps/mobile/app/settings.tsx`
- Create: `apps/mobile/app/tags.tsx`

**Interfaces:**
- Consumes: `AsyncStorage`; `openDatabase()` from Task 2
- Produces:
  - `SettingsScreen`: server URL + token text fields, "Save & Sync" button, "Manage Tags" link
  - `TagsScreen`: list all tags with item count, delete button (removes tag + item_tags rows)

- [ ] **Step 1: Implement settings.tsx**

```tsx
// apps/mobile/app/settings.tsx
import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'

export default function SettingsScreen() {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([AsyncStorage.getItem('stashbro:serverURL'), AsyncStorage.getItem('stashbro:serverToken')]).then(([u, t]) => {
      if (u) setUrl(u)
      if (t) setToken(t)
    })
  }, [])

  const save = async () => {
    if (!url.startsWith('http')) { Alert.alert('Invalid URL', 'Must start with http(s)://'); return }
    await Promise.all([AsyncStorage.setItem('stashbro:serverURL', url), AsyncStorage.setItem('stashbro:serverToken', token)])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#ECEDF2' }} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 16 }}>
        <Text style={{ color: '#C87A38', fontSize: 16 }}>Back</Text>
      </TouchableOpacity>
      <Text style={styles.heading}>Settings</Text>
      <Text style={styles.label}>Server URL</Text>
      <TextInput style={styles.input} value={url} onChangeText={setUrl} placeholder="https://your-server.fly.dev" keyboardType="url" autoCapitalize="none" autoCorrect={false} />
      <Text style={styles.label}>Bearer Token</Text>
      <TextInput style={styles.input} value={token} onChangeText={setToken} placeholder="your-secret-token" secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <TouchableOpacity style={styles.btn} onPress={save}>
        <Text style={styles.btnText}>{saved ? 'Saved!' : 'Save & Sync'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ marginTop: 24, alignItems: 'center' }} onPress={() => router.push('/tags')}>
        <Text style={{ color: '#C87A38', fontSize: 15 }}>Manage Tags →</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  heading: { fontSize: 24, fontWeight: '700', color: '#12131C', marginBottom: 24 },
  label: { fontSize: 11, fontWeight: '600', color: '#9EA1B4', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(18,19,28,.09)', marginBottom: 4, fontSize: 14, color: '#12131C' },
  btn: { backgroundColor: '#C87A38', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
})
```

- [ ] **Step 2: Implement tags.tsx**

```tsx
// apps/mobile/app/tags.tsx
import React, { useState, useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { openDatabase } from '../src/db/database.js'
import { router } from 'expo-router'

interface Tag { id: string; name: string; count: number }

export default function TagsScreen() {
  const [tags, setTags] = useState<Tag[]>([])

  const load = () => {
    const db = openDatabase()
    setTags(db.getAllSync<Tag>('SELECT t.id, t.name, COUNT(it.item_id) as count FROM tags t LEFT JOIN item_tags it ON it.tag_id = t.id GROUP BY t.id ORDER BY t.name'))
  }

  useEffect(() => { load() }, [])

  const deleteTag = (tag: Tag) => {
    Alert.alert('Delete Tag', `Remove "#${tag.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        const db = openDatabase()
        db.runSync('DELETE FROM item_tags WHERE tag_id = ?', [tag.id])
        db.runSync('DELETE FROM tags WHERE id = ?', [tag.id])
        load()
      }},
    ])
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#ECEDF2' }}>
      <View style={{ padding: 20, paddingTop: 60, gap: 8 }}>
        <TouchableOpacity onPress={() => router.back()}><Text style={{ color: '#C87A38', fontSize: 16 }}>Back</Text></TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#12131C' }}>Tags</Text>
      </View>
      <FlatList
        data={tags}
        keyExtractor={t => t.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.name}>#{item.name}</Text>
              <Text style={styles.count}>{item.count} items</Text>
            </View>
            <TouchableOpacity onPress={() => deleteTag(item)}>
              <Text style={{ color: '#B53030', fontSize: 14 }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: 'rgba(18,19,28,.06)' }} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, marginBottom: 1 },
  name: { fontSize: 15, fontWeight: '500', color: '#12131C' },
  count: { fontSize: 12, color: '#9EA1B4', marginTop: 2 },
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/settings.tsx apps/mobile/app/tags.tsx
git commit -m "feat(mobile): settings (server URL/token) and tag management screens"
```

---

### Task 6: iOS Share Extension

**Files:**
- Create: `apps/mobile/share-extension/index.tsx`

**Interfaces:**
- Consumes: `expo-share-extension` (`getShareData`, `close`); `openDatabase()` from Task 2; `detectType`, `extractDomain` from `@stashbro/shared`
- Produces:
  - Share extension root: title field (auto-filled from share data), type badge (auto-detected), tag multi-select (from DB), priority segmented control (Low/Med/High, default Med), "Save to StashBro" button
  - On save: writes item to local SQLite DB; calls `close()` to dismiss

- [ ] **Step 1: Implement share-extension/index.tsx**

```tsx
// apps/mobile/share-extension/index.tsx
import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { getShareData, close } from 'expo-share-extension'
import { detectType, extractDomain } from '@stashbro/shared'
import { openDatabase } from '../src/db/database.js'

type Priority = 'low' | 'medium' | 'high'

export default function ShareExtension() {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [detectedType, setDetectedType] = useState('article')
  const [domain, setDomain] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const data = getShareData()
    const sharedUrl = data?.url ?? ''
    setUrl(sharedUrl)
    setTitle(data?.title ?? sharedUrl)
    setDetectedType(detectType(sharedUrl))
    setDomain(extractDomain(sharedUrl))
    try {
      const db = openDatabase()
      setAvailableTags(db.getAllSync<{ name: string }>('SELECT name FROM tags ORDER BY name').map(t => t.name))
    } catch { /* first-launch: no DB yet */ }
  }, [])

  const save = () => {
    try {
      const db = openDatabase()
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      db.runSync(
        'INSERT OR IGNORE INTO items(id,user_id,url,title,domain,type,status,priority,created_at,updated_at,change_seq) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        [id, 'default', url, title || url, domain, detectedType, 'unread', priority, now, now, 0]
      )
      for (const name of selectedTags) {
        let tag = db.getFirstSync<{ id: string }>('SELECT id FROM tags WHERE user_id=? AND name=?', ['default', name])
        if (!tag) {
          const tid = crypto.randomUUID()
          db.runSync('INSERT INTO tags(id,user_id,name) VALUES(?,?,?)', [tid, 'default', name])
          tag = { id: tid }
        }
        db.runSync('INSERT OR IGNORE INTO item_tags(item_id,tag_id) VALUES(?,?)', [id, tag.id])
      }
      setSaved(true)
      setTimeout(close, 1200)
    } catch (e) { console.error('ShareExtension save error:', e) }
  }

  const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
    video: { bg: '#FCEAEA', fg: '#B53030' }, post: { bg: '#EAF0FD', fg: '#2A56A8' },
    article: { bg: '#E8F7EF', fg: '#1F7A47' }, other: { bg: '#F2EDF8', fg: '#6441A0' },
  }
  const tc = TYPE_COLORS[detectedType] ?? TYPE_COLORS['article']!

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.icon}><Text style={styles.iconText}>S</Text></View>
        <View>
          <Text style={styles.appName}>StashBro</Text>
          <Text style={styles.sub}>{saved ? 'Saved!' : 'Quick save'}</Text>
        </View>
      </View>

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.titleInput} value={title} onChangeText={setTitle} multiline />

      <Text style={styles.label}>Type & Tags</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <View style={[styles.badge, { backgroundColor: tc.bg }]}><Text style={[styles.badgeText, { color: tc.fg }]}>{detectedType.toUpperCase()}</Text></View>
        <Text style={{ fontSize: 12, color: '#9EA1B4' }}>{domain}</Text>
      </View>
      <View style={styles.tagsRow}>
        {availableTags.map(name => (
          <TouchableOpacity key={name} style={[styles.tagChip, selectedTags.includes(name) && styles.tagActive]} onPress={() => setSelectedTags(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name])}>
            <Text style={[styles.tagText, selectedTags.includes(name) && styles.tagTextActive]}>#{name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Priority</Text>
      <View style={styles.seg}>
        {(['low', 'medium', 'high'] as Priority[]).map(p => (
          <TouchableOpacity key={p} style={[styles.segBtn, priority === p && styles.segBtnActive]} onPress={() => setPriority(p)}>
            <Text style={[styles.segText, priority === p && styles.segTextActive]}>{p === 'medium' ? 'Med' : p.charAt(0).toUpperCase() + p.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[styles.saveBtn, saved && { backgroundColor: '#1F7A47' }]} onPress={save} disabled={saved}>
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>{saved ? 'Saved!' : 'Save to StashBro'}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  icon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#C87A38', justifyContent: 'center', alignItems: 'center' },
  iconText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  appName: { fontSize: 15, fontWeight: '600', color: '#12131C' },
  sub: { fontSize: 12, color: '#9EA1B4' },
  label: { fontSize: 11, fontWeight: '600', color: '#9EA1B4', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  titleInput: { backgroundColor: '#fff', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(18,19,28,.09)', fontSize: 14, minHeight: 44 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tagChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: '#ECEDF4' },
  tagActive: { backgroundColor: '#C87A38' },
  tagText: { fontSize: 12, color: '#4A4D62' },
  tagTextActive: { color: '#fff' },
  seg: { flexDirection: 'row', backgroundColor: '#ECEDF2', borderRadius: 8, padding: 2, gap: 1, marginTop: 4 },
  segBtn: { flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
  segBtnActive: { backgroundColor: '#fff' },
  segText: { fontSize: 12, fontWeight: '600', color: '#9EA1B4' },
  segTextActive: { color: '#12131C' },
  saveBtn: { backgroundColor: '#C87A38', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
})
```

- [ ] **Step 2: Test via expo prebuild**

```bash
cd apps/mobile && npx expo prebuild --platform ios --clean 2>&1 | tail -10
```

Expected: `ios/` directory generated; `StashBroShareExtension` target present in Xcode project

- [ ] **Step 3: Commit all mobile work**

```bash
git add apps/mobile/
git commit -m "feat(mobile): iOS share extension quick-save card (type badge, tag picker, priority segmented)"
```
