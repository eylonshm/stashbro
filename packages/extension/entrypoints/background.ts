// packages/extension/entrypoints/background.ts
import { StashBroClient, detectType } from '@stashbro/shared'
import type { CreateItemInput } from '@stashbro/shared'

interface QueuedItem extends CreateItemInput {
  queuedAt: number
}

type StorageConfig = { serverURL?: string; serverToken?: string }

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
  if (!settings.serverURL || !settings.serverToken) {
    await enqueueOffline(item)
    return false
  }
  const client = new StashBroClient({ baseUrl: settings.serverURL, token: settings.serverToken })
  try {
    await client.createItem({ type: detectType(item.url), ...item })
    return true
  } catch {
    await enqueueOffline(item)
    return false
  }
}

async function enqueueOffline(item: CreateItemInput) {
  const { offlineQueue = [] } = await browser.storage.local.get('offlineQueue')
  const queued: QueuedItem = { ...item, queuedAt: Date.now() }
  offlineQueue.push(queued)
  await browser.storage.local.set({ offlineQueue })
}
