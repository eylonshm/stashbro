const WPM = 238
// ponytail: 45 min cap - longest legit articles (longform journalism) rarely exceed this
const MAX_SECONDS = 2700

const NOISE_RE = /(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>|<aside[\s\S]*?<\/aside>|<form[\s\S]*?<\/form>|<svg[\s\S]*?<\/svg>|<noscript[\s\S]*?<\/noscript>|<iframe[\s\S]*?<\/iframe>|<template[\s\S]*?<\/template>)/gi

function toText(html: string): string {
  return html
    .replace(NOISE_RE, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findContent(html: string): string | null {
  // Try semantic content containers in order of specificity
  return html.match(/<article[^>]*>([\s\S]+)<\/article>/i)?.[1]
    ?? html.match(/<main[^>]*>([\s\S]+)<\/main>/i)?.[1]
    ?? html.match(/<[^>]+role=["']main["'][^>]*>([\s\S]+?)<\/div>/i)?.[1]
    ?? null
}

export function extractTextFromHtml(html: string): string {
  const content = findContent(html)
  return toText(content ?? html)
}

export function estimateReadingTimeSeconds(textOrHtml: string): number {
  const content = findContent(textOrHtml)
  const text = toText(content ?? textOrHtml)
  if (!text) return 0
  const words = text.split(/\s+/).length
  // No content container found and word count suspiciously high -> unreliable estimate
  if (!content && words > 3000) return 0
  return Math.min(MAX_SECONDS, Math.max(1, Math.ceil(words / WPM * 60)))
}
