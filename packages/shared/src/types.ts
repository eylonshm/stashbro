export type ItemType = 'video' | 'post' | 'article' | 'other'
export type Priority = 'low' | 'medium' | 'high'
export type Status = 'unread' | 'archived'

export interface Tag {
  id: string
  user_id: string
  name: string
}

export interface Item {
  id: string           // uuidv7
  user_id: string
  url: string
  title: string
  description: string | null
  thumbnail_url: string | null
  favicon_url: string | null
  domain: string
  type: ItemType
  status: Status
  priority: Priority
  created_at: string   // ISO 8601
  updated_at: string   // ISO 8601
  deleted_at: string | null
  change_seq: number
  tags: Tag[]
}

export interface SyncChange {
  id: string
  change_seq: number
  created_at: string   // ISO 8601
  updated_at: string
  deleted_at: string | null
  url: string
  title: string
  description: string | null
  thumbnail_url: string | null
  favicon_url: string | null
  domain: string
  type: ItemType
  status: Status
  priority: Priority
  tag_names: string[]
}

export interface CreateItemInput {
  url: string
  title?: string
  type?: ItemType
  priority?: Priority
  tag_names?: string[]
}

export interface UpdateItemInput {
  title?: string
  type?: ItemType
  status?: Status
  priority?: Priority
  deleted_at?: string | null
  tag_names?: string[]
}

// Domain -> type map. Checked by substring match on hostname.
export const DOMAIN_TYPE_MAP: Record<string, ItemType> = {
  'youtube.com': 'video',
  'youtu.be': 'video',
  'vimeo.com': 'video',
  'x.com': 'post',
  'twitter.com': 'post',
  'reddit.com': 'post',
  'threads.net': 'post',
}

export function detectType(url: string): ItemType {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    for (const [domain, type] of Object.entries(DOMAIN_TYPE_MAP)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return type
    }
  } catch {
    // invalid URL - fall through
  }
  return 'article'
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
