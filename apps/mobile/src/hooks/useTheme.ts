import { useColorScheme } from 'react-native'

// ponytail: single-source theme; shared across ItemRow/FilterChips/index via import
const LIGHT = {
  bg: '#FFFFFF', surface: '#ECEDF2',
  text: '#12131C', secondary: '#5E6175', meta: '#9EA1B4',
  border: 'rgba(18,19,28,.09)', sep: 'rgba(18,19,28,.06)',
  tagBg: '#ECEDF4', tagText: '#4A4D62',
  typeBadge: {
    video:   { bg: '#FCEAEA', fg: '#B53030' },
    post:    { bg: '#EAF0FD', fg: '#2A56A8' },
    article: { bg: '#E8F7EF', fg: '#1F7A47' },
    other:   { bg: '#F2EDF8', fg: '#6441A0' },
  },
}
const DARK = {
  bg: '#1C1C1E', surface: '#111113',
  text: '#F0F0F5', secondary: '#A0A3B4', meta: '#6B6E82',
  border: 'rgba(255,255,255,.10)', sep: 'rgba(255,255,255,.06)',
  tagBg: '#2C2C35', tagText: '#A0A3B4',
  typeBadge: {
    video:   { bg: '#3A1212', fg: '#E87070' },
    post:    { bg: '#0D1F3A', fg: '#6B8FD4' },
    article: { bg: '#0D2A1A', fg: '#4DB87A' },
    other:   { bg: '#1E0D33', fg: '#9B6DCC' },
  },
}

export type Theme = typeof LIGHT

export function useTheme(): Theme & { isDark: boolean } {
  const isDark = useColorScheme() === 'dark'
  return { ...(isDark ? DARK : LIGHT), isDark }
}
