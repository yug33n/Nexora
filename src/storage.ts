import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Note, Space } from './types'

const LS_SPACES = 'nexora_spaces'
const LS_NOTES = 'nexora_notes'

type NotesData = { spaces: Space[]; notes: Note[] }
type FolderResult = { data?: string }
interface NotesFolderPlugin {
  open(): Promise<FolderResult>
  pick(options: { initialData: string }): Promise<FolderResult>
  move(): Promise<FolderResult>
  exportZip(options: { entries: string }): Promise<{ saved: boolean }>
  save(options: { kind: keyof NotesData; item: string }): Promise<void>
}

const notesFolder = registerPlugin<NotesFolderPlugin>('NotesFolder')
export const usesNotesFolder = Capacitor.getPlatform() === 'android'

let folderData: NotesData | undefined
let pendingSave: Promise<unknown> = Promise.resolve()

function readLegacyItems<T>(key: string): T[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

function legacyData(): NotesData {
  return { spaces: readLegacyItems<Space>(LS_SPACES), notes: readLegacyItems<Note>(LS_NOTES) }
}

function loadFolder(result: FolderResult | undefined): boolean {
  if (!result?.data) return false
  folderData = JSON.parse(result.data) as NotesData
  return true
}

export async function openNotesFolder(): Promise<boolean> {
  return loadFolder(await notesFolder.open())
}

export async function pickNotesFolder(): Promise<boolean> {
  return loadFolder(await notesFolder.pick({ initialData: JSON.stringify(legacyData()) }))
}

export function moveNotesFolder(): Promise<boolean> {
  const operation = pendingSave.then(async () => loadFolder(await notesFolder.move()))
  pendingSave = operation.catch(() => {})
  return operation
}

function currentData(): NotesData {
  if (!usesNotesFolder) return legacyData()
  if (!folderData) throw new Error('Сначала выберите папку для заметок.')
  return folderData
}

function archiveName(name: string, fallback: string): string {
  const safe = name.replace(/[\p{Cc}/\\:*?"<>|]/gu, '_').trim()
  return Array.from(safe).slice(0, 55).join('').replace(/[. ]+$/u, '') || fallback
}

function notesArchiveEntries(data: NotesData): { path: string; content: string }[] {
  const spaces = new Map(data.spaces.map((space, index) => [
    space.id, `${index + 1} - ${archiveName(space.name, 'Пространство')}`,
  ]))
  const entries = [{ path: 'nexora.json', content: JSON.stringify(data, null, 2) }]
  data.notes.forEach((note, index) => {
    const folder = spaces.get(note.spaceId) ?? 'Без пространства'
    const filename = archiveName(note.title, 'Без названия')
    const title = note.title.replace(/[\r\n]+/g, ' ')
    entries.push({
      path: `notes/${folder}/${index + 1} - ${filename}.md`,
      content: `# ${title}\n\n${note.body}`,
    })
  })
  return entries
}

export async function exportNotesZip(): Promise<'saved' | 'download' | 'cancelled'> {
  await pendingSave
  const data = currentData()
  const entries = notesArchiveEntries(data)
  if (usesNotesFolder) {
    const result = await notesFolder.exportZip({ entries: JSON.stringify(entries) })
    return result.saved ? 'saved' : 'cancelled'
  }

  const { strToU8, zipSync } = await import('fflate')
  const archive = zipSync(Object.fromEntries(entries.map(({ path, content }) => [path, strToU8(content)])))
  const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'nexora-notes.zip'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'download'
}

function appendItem<K extends keyof NotesData>(kind: K, item: NotesData[K][number]): Promise<NotesData[K]> {
  const operation = pendingSave.then(async () => {
    const current = currentData()
    const items = [...current[kind], item] as NotesData[K]
    const next = { ...current, [kind]: items }
    try {
      if (usesNotesFolder) {
        await notesFolder.save({ kind, item: JSON.stringify(item) })
        folderData = next
      } else {
        localStorage.setItem(kind === 'spaces' ? LS_SPACES : LS_NOTES, JSON.stringify(items))
      }
    } catch {
      throw new Error('Не удалось сохранить данные. Проверьте доступ к хранилищу и повторите попытку.')
    }
    return items
  })
  pendingSave = operation.catch(() => {})
  return operation
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export async function request(
  path: string,
  _token: string,
  options?: { data?: { name?: string; title?: string; body?: string }; signal?: AbortSignal }
): Promise<Space[] | Note[]> {
  const { data, signal } = options ?? {}
  if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')

  if (path === '/spaces' && data) {
    return appendItem('spaces', { id: uid(), name: String(data.name ?? '').trim() })
  }
  if (path.endsWith('/notes') && data) {
    const spaceId = path.slice('/spaces/'.length, path.indexOf('/notes'))
    return appendItem('notes', {
      id: uid(),
      spaceId,
      title: String(data.title ?? '').trim() || 'Без названия',
      body: String(data.body ?? '').trim(),
    })
  }

  const { spaces, notes } = currentData()
  if (path === '/spaces') return spaces
  if (path.includes('/search?') || path.endsWith('/search')) {
    const spaceId = path.slice('/spaces/'.length, path.indexOf('/search'))
    const query = new URLSearchParams(path.split('?')[1] ?? '').get('q') ?? ''
    const wanted = new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    return notes.filter((note) => {
      if (note.spaceId !== spaceId) return false
      const words = new Set((note.title + ' ' + note.body).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
      return [...wanted].some((word) => words.has(word))
    })
  }
  if (path.endsWith('/notes')) {
    const spaceId = path.replace('/spaces/', '').replace('/notes', '')
    return notes.filter((note) => note.spaceId === spaceId)
  }
  throw new Error('not_found')
}
