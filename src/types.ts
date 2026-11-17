export type Space = { id: string; name: string }
export type Note = { id: string; title: string; body: string }
export type Tab = 'home' | 'notes' | 'people' | 'map' | 'profile'
export type Editor =
  | { kind: 'space' }
  | { kind: 'note'; space: Space }
  | { kind: 'read'; note: Note }

export const tabs: { id: Tab; label: string; path: string }[] = [
  { id: 'home', label: 'Главная', path: 'M3 10l9-7 9 7v10h-6v-6H9v6H3z' },
  { id: 'notes', label: 'Заметки', path: 'M3 6h7l2 2h9v12H3z' },
  { id: 'people', label: 'Люди', path: 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m14-6a4 4 0 0 1 4 4v2M13 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zm3-3a3.5 3.5 0 0 1 0 7' },
  { id: 'map', label: 'Карта', path: 'M6 7l12 3M7 9l4 9m6-6-4 6M7 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm-7 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z' },
  { id: 'profile', label: 'Профиль', path: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z' },
]
