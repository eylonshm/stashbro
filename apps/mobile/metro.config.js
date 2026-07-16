// apps/mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
// ponytail: pnpm strict symlinks need this; drop if switching to npm/yarn
config.resolver.disableHierarchicalLookup = true

config.resolver.unstable_enablePackageExports = true
// ponytail: @babel/runtime v8 dropped the /regenerator subpath; react-devtools-core still imports it
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@babel/runtime/regenerator') {
    return context.resolveRequest(context, 'regenerator-runtime/runtime', platform)
  }
  if (moduleName.endsWith('.js')) {
    const base = moduleName.slice(0, -3)
    for (const ext of ['.ts', '.tsx', '']) {
      try {
        return context.resolveRequest(context, base + ext, platform)
      } catch {}
    }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
