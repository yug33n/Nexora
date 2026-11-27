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
  return queueSave(() => saveItems(kind, [item] as NotesData[K]))
}

const MAX_IMPORT_BYTES = 64 * 1024 * 1024

async function readNotesArchive(file: File): Promise<NotesData> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('ZIP-архив больше 64 МБ.')
  const { unzipSync } = await import('fflate')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let entry: Uint8Array | undefined
  let found = false
  let tooLarge = false
  let duplicate = false
  try {
    entry = unzipSync(bytes, { filter: ({ name, originalSize }) => {
      if (name !== 'nexora.json') return false
      if (found) {
        duplicate = true
        return false
      }
      found = true
      tooLarge = originalSize > MAX_IMPORT_BYTES
      return !tooLarge
    } })['nexora.json']
  } catch {
    throw new Error('Не удалось прочитать ZIP-архив.')
  }
  if (tooLarge) throw new Error('Данные заметок в архиве больше 64 МБ.')
  if (!entry || duplicate) throw new Error('Выберите ZIP-архив, экспортированный из Nexora.')

  try {
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(entry)) as NotesData
    const spaceIds = new Set<string>()
    const noteIds = new Set<string>()
    const validId = (value: unknown): value is string =>
      typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value)
    if (!Array.isArray(data.spaces) || !Array.isArray(data.notes)) throw new Error()
    const spaces = data.spaces.map(({ id, name }) => {
      if (!validId(id) || spaceIds.has(id) || typeof name !== 'string') throw new Error()
      spaceIds.add(id)
      return { id, name }
    })
    const notes = data.notes.map(({ id, spaceId, title, body }) => {
      if (!validId(id) || noteIds.has(id) || !spaceIds.has(spaceId)
        || typeof title !== 'string' || typeof body !== 'string') throw new Error()
      noteIds.add(id)
      return { id, spaceId, title, body }
    })
    return { spaces, notes }
  } catch {
    throw new Error('В архиве повреждены данные заметок или пространств.')
  }
}

export async function importNotesZip(file: File): Promise<{ spaces: number; notes: number }> {
  const data = await readNotesArchive(file)
  return queueSave(async () => {
    const current = currentData()
    const spaceIds = new Set(current.spaces.map(({ id }) => id))
    const noteIds = new Set(current.notes.map(({ id }) => id))
    const spaces = data.spaces.filter(({ id }) => !spaceIds.has(id))
    const notes = data.notes.filter(({ id }) => !noteIds.has(id))
    if (usesNotesFolder) {
      for (const space of spaces) await saveItems('spaces', [space])
      for (const note of notes) await saveItems('notes', [note])
    } else {
      if (spaces.length) await saveItems('spaces', spaces)
      if (notes.length) await saveItems('notes', notes)
    }
    return { spaces: spaces.length, notes: notes.length }
  })
}

function queueSave<T>(save: () => Promise<T>): Promise<T> {
  const operation = pendingSave.then(save)
  pendingSave = operation.catch(() => {})
  return operation
}

async function saveItems<K extends keyof NotesData>(kind: K, added: NotesData[K]): Promise<NotesData[K]> {
  const current = currentData()
  const items = [...current[kind], ...added] as NotesData[K]
  try {
    if (usesNotesFolder) {
      for (const item of added) await notesFolder.save({ kind, item: JSON.stringify(item) })
      folderData = { ...current, [kind]: items }
    } else {
      localStorage.setItem(kind === 'spaces' ? LS_SPACES : LS_NOTES, JSON.stringify(items))
    }
  } catch {
    throw new Error('Не удалось сохранить данные. Проверьте доступ к хранилищу и повторите попытку.')
  }
  return items
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
