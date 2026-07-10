// packages/extension/entrypoints/popup/main.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import PopupApp from './PopupApp.js'

const root = document.getElementById('root')!
createRoot(root).render(<PopupApp />)
