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
