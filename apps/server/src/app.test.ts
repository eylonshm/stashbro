import { describe, it, expect } from 'vitest'
import { createApp } from './app.js'

describe('app bootstrap', () => {
  it('GET /health returns ok', async () => {
    const app = createApp()
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true })
    expect(typeof body.mode).toBe('string')
  })

  it('GET /openapi.json returns valid spec', async () => {
    const app = createApp()
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(200)
    const spec = await res.json()
    expect(spec.openapi).toMatch(/^3/)
    expect(spec.info.title).toBe('StashBro API')
  })
})
