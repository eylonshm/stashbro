import { useState, useEffect, useCallback } from 'react'
import { openDatabase } from '../db/database'
import { buildItemsQuery } from './buildItemsQuery'

export type { Filters } from './buildItemsQuery'
export { buildItemsQuery } from './buildItemsQuery'

export interface LocalItem {
  id: string; url: string; title: string; description: string | null
  thumbnail_url: string | null; favicon_url: string | null
  domain: string; type: string; status: string; priority: string
  created_at: string; updated_at: string; deleted_at: string | null
  change_seq: number; tag_names: string[]
}

export function useItems(filters: Parameters<typeof buildItemsQuery>[0] = {}) {
  const [items, setItems] = useState<LocalItem[]>([])

  const refresh = useCallback(() => {
    const db = openDatabase()
    const { sql, params } = buildItemsQuery(filters)
    const rows = db.getAllSync<LocalItem & { tag_list: string | null }>(sql, params)
    setItems(rows.map(r => ({ ...r, tag_names: r.tag_list ? r.tag_list.split(',') : [] })))
  }, [filters.type, filters.priority, filters.tag, filters.search, filters.status])

  useEffect(() => { refresh() }, [refresh])
  return { items, refresh }
}
