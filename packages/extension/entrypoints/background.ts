// packages/extension/entrypoints/background.ts
import { StashBroClient, detectType } from '@stashbro/shared'
import type { CreateItemInput } from '@stashbro/shared'
import { OfflineRetryQueue } from '../src/OfflineRetryQueue.js'

type StorageConfig = { serverURL?: string; serverToken?: string }

// ponytail: module-level instance; chrome is always available in extension contexts
const offlineQueue = new OfflineRetryQueue(chrome.storage.local)

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
    const config = await browser.storage.local.get(['serverURL', 'serverToken']) as StorageConfig
    // ponytail: title falls back to url; context menu lacks tab title; upgrade: browser.tabs.query active tab
    await saveWithRetry({ url, title: url }, config)
  })
})

export async function saveWithRetry(item: CreateItemInput, config?: StorageConfig): Promise<boolean> {
  const settings = config ?? (await browser.storage.local.get(['serverURL', 'serverToken']) as StorageConfig)
  console.log('[StashBro] saveWithRetry settings:', settings.serverURL ? 'url set' : 'NO URL', settings.serverToken ? 'token set' : 'NO TOKEN')
  if (!settings.serverURL || !settings.serverToken) {
    await offlineQueue.enqueue(item)
    return false
  }
  const client = new StashBroClient({ baseUrl: settings.serverURL, token: settings.serverToken })
  try {
    await client.createItem({ type: detectType(item.url), ...item })
    return true
  } catch (err) {
    console.error('[StashBro] createItem failed:', err)
    await offlineQueue.enqueue(item)
    return false
  }
}
