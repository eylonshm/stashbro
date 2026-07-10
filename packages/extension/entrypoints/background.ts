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
