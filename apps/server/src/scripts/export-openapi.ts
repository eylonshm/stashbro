import { createApp } from '../app.js'
import { writeFileSync } from 'fs'

const app = createApp()
const res = await app.request('/openapi.json')
const spec = await res.json()
writeFileSync('openapi.json', JSON.stringify(spec, null, 2) + '\n')
console.log('Exported openapi.json')
