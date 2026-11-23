import type { Note, Space } from './types'

const LS_SPACES = 'nexora_spaces'
const LS_NOTES = 'nexora_notes'

export function loadItems(kind: 'spaces' | 'notes', id?: string): Space[] | Note[] | null {
  try {
    const all: Array<Space | Note> = kind === 'spaces'
      ? JSON.parse(localStorage.getItem(LS_SPACES) ?? '[]')
      : JSON.parse(localStorage.getItem(LS_NOTES) ?? '[]')
    if (!Array.isArray(all)) return null
    return id
      ? (kind === 'notes'
          ? all.filter((item) => 'spaceId' in item && item.spaceId === id)
          : all.filter((item) => item.id === id)) as Space[] | Note[]
      : (all as Space[] | Note[])
  } catch {
    return null
  }
}

export function saveItems(kind: 'spaces' | 'notes', items: Array<Space | Note>): void {
  localStorage.setItem(kind === 'spaces' ? LS_SPACES : LS_NOTES, JSON.stringify(items))
}

export function pushItem(kind: 'spaces' | 'notes', item: Space | Note): void {
  const items = (loadItems(kind) ?? []) as Array<Space | Note>
  items.push(item)
  saveItems(kind, items)
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export async function request(
  path: string,
  token: string,
  options?: { data?: { name?: string; title?: string; body?: string }; signal?: AbortSignal }
): Promise<Space[] | Note[]> {
  const { data } = options ?? {}
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 200)
    if (options?.signal) options.signal.addEventListener('abort', () => { clearTimeout(timeout); reject() })
  })
  if (path === '/spaces' && data) {
    const items = (loadItems('spaces') ?? []) as Space[]
    items.push({ id: uid(), name: String(data.name ?? '').trim() })
    saveItems('spaces', items)
    return items
  }
  if (path.endsWith('/notes') && data) {
    const spaceId = path.slice('/spaces/'.length, path.indexOf('/notes'))
    const items = (loadItems('notes') ?? []) as Note[]
    items.push({ id: uid(), spaceId, title: String(data.title ?? '').trim() || 'Без названия', body: String(data.body ?? '').trim() })
    saveItems('notes', items)
    return items
  }
  if (path === '/spaces') return (loadItems('spaces') ?? []) as Space[]
  if (path.includes('/search?') || path.endsWith('/search')) {
    const spaceId = path.slice('/spaces/'.length, path.indexOf('/search'))
    const query = new URLSearchParams(path.split('?')[1] ?? '').get('q') ?? ''
    const notes = (loadItems('notes', spaceId) ?? []) as Note[]
    const wanted = new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    return notes.filter((note) => {
      const words = new Set((note.title + ' ' + note.body).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
      return [...wanted].some((word) => words.has(word))
    })
  }
  if (path.endsWith('/notes')) {
    const spaceId = path.replace('/spaces/', '').replace('/notes', '')
    return (loadItems('notes', spaceId) ?? []) as Note[]
  }
  throw new Error('not_found')
}
