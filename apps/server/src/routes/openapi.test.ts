import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { createApp } from '../app.js'

process.env['AUTH_TOKEN'] = 'test'
process.env['AUTH_MODE'] = 'token'
process.env['DB_PATH'] = ':memory:'

describe('OpenAPI spec', () => {
  it('includes /items POST endpoint', async () => {
    const app = createApp()
    const res = await app.request('/openapi.json')
    const spec = await res.json()
    expect(spec.paths['/items']).toBeDefined()
    expect(spec.paths['/items']['post']).toBeDefined()
  })

  it('includes /sync/pull GET endpoint', async () => {
    const app = createApp()
    const res = await app.request('/openapi.json')
    const spec = await res.json()
    expect(spec.paths['/sync/pull']).toBeDefined()
  })

  it('includes /sync/push POST endpoint', async () => {
    const app = createApp()
    const res = await app.request('/openapi.json')
    const spec = await res.json()
    expect(spec.paths['/sync/push']).toBeDefined()
  })

  it('committed openapi.json matches live spec (staleness guard)', async () => {
    const app = createApp()
    const res = await app.request('/openapi.json')
    const live = await res.json()
    const committed = JSON.parse(readFileSync(new URL('../../openapi.json', import.meta.url), 'utf-8'))
    expect(live).toEqual(committed)
  })
})
