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
