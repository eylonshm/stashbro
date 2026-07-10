// Pure SQL query builder for items list - no expo deps, headless-testable
// ponytail: separate file so tests can import without pulling in expo-sqlite

export interface Filters {
  type?: string; priority?: string; tag?: string
  search?: string; status?: string
}

export function buildItemsQuery(filters: Filters): { sql: string; params: (string | number)[] } {
  let sql = `SELECT i.*, GROUP_CONCAT(t.name, ',') as tag_list
    FROM items i
    LEFT JOIN item_tags it ON it.item_id = i.id
    LEFT JOIN tags t ON t.id = it.tag_id
    WHERE i.deleted_at IS NULL AND i.status = ?`
  const params: (string | number)[] = [filters.status ?? 'unread']
  if (filters.type && filters.type !== 'all') { sql += ' AND i.type = ?'; params.push(filters.type) }
  if (filters.priority && filters.priority !== 'all') { sql += ' AND i.priority = ?'; params.push(filters.priority) }
  if (filters.search) {
    sql += ' AND (i.title LIKE ? OR i.url LIKE ?)'
    params.push(`%${filters.search}%`, `%${filters.search}%`)
  }
  if (filters.tag) {
    sql += ' AND i.id IN (SELECT it2.item_id FROM item_tags it2 JOIN tags t2 ON t2.id = it2.tag_id WHERE t2.name = ?)'
    params.push(filters.tag)
  }
  sql += ' GROUP BY i.id ORDER BY i.change_seq DESC LIMIT 100'
  return { sql, params }
}
