import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth } from './components/Auth'
import { request } from './storage'
import type { Editor, Note, Space } from './types'
import { tabs } from './types'
import './styles.css'

function Icon({ path }: { path: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
}

function Title({ children, description }: { children: ReactNode; description?: string }) {
  return <header className="page-title"><h1>{children}</h1>{description && <p>{description}</p>}</header>
}

function App() {
  const [signedIn, setSignedIn] = useState(false)
  return signedIn
    ? <Workspace />
    : <Auth onSuccess={() => setSignedIn(true)} />
}

function Workspace() {
  const [section, setSection] = useState<'home' | 'notes'>('notes')
  const [spaces, setSpaces] = useState<Space[] | null>(null)
  const [space, setSpace] = useState<Space | null>(null)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [recentSpaceId, setRecentSpaceId] = useState('')
  const [recent, setRecent] = useState<Note[]>([])
  const recentSpace = spaces?.find((item) => item.id === recentSpaceId) ?? spaces?.[0]

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    request('/spaces', '', { signal: controller.signal })
      .then((items) => { if (!controller.signal.aborted) setSpaces(items as Space[]) })
      .catch(() => { if (!controller.signal.aborted) setError('Не удалось загрузить пространства.') })
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    if (!space) return
    const controller = new AbortController()
    const path = `/spaces/${space.id}/${query.trim() ? `search?q=${encodeURIComponent(query.trim())}` : 'notes'}`
    setNotes(null)
    setError('')
    request(path, '', { signal: controller.signal })
      .then((items) => { if (!controller.signal.aborted) setNotes(items as Note[]) })
      .catch(() => { if (!controller.signal.aborted) setError('Не удалось загрузить заметки.') })
    return () => controller.abort()
  }, [space?.id, query, refresh])

  useEffect(() => {
    if (section !== 'home' || !recentSpace) return
    const controller = new AbortController()
    request(`/spaces/${recentSpace.id}/notes`, '', { signal: controller.signal })
      .then((items) => { if (!controller.signal.aborted) setRecent((items as Note[]).slice(-3).reverse()) })
      .catch(() => {})
    return () => controller.abort()
  }, [section, recentSpace?.id, refresh])

  const openSpace = (selected: Space) => {
    setRecentSpaceId(selected.id)
    setSpace(selected)
    setSection('notes')
    setQuery('')
    window.scrollTo(0, 0)
  }

  const save = async (data: FormData) => {
    if (editor?.kind === 'space') {
      const name = String(data.get('title')).trim()
      if (!name) throw new Error('Введите название пространства.')
      const items = await request('/spaces', '', { data: { name } })
      const created = items[items.length - 1] as Space
      setSpaces(items as Space[])
      openSpace(created)
    }
    if (editor?.kind === 'note') {
      const title = String(data.get('title')).trim()
      const body = String(data.get('body')).trim()
      if (!title || !body) throw new Error('Введите заголовок и текст заметки.')
      await request(`/spaces/${editor.space.id}/notes`, '', { data: { title, body } })
      setQuery('')
      setRefresh((value) => value + 1)
    }
    setEditor(null)
  }

  const retry = <div className="empty"><p role="alert">{error}</p><button className="secondary" onClick={() => setRefresh((value) => value + 1)}>Повторить</button></div>
  return <main className="app-shell">
    <header className="topbar"><div className="wordmark"><span className="brand-mark">N</span> Nexora</div></header>
    <section className="view">
      {section === 'home' && <>
        <Title description="Личное место для записей.">Главная</Title>
        <div className="section-head"><h2>Недавнее{recentSpace ? ` · ${recentSpace.name}` : ''}</h2><button className="text-button" onClick={() => setSection('notes')}>Все заметки</button></div>
        {recent.length
          ? <div className="rows">{recent.map((note) => <button className="row note" key={note.id} onClick={() => setEditor({ kind: 'read', note })}><strong>{note.title}</strong><span>{note.body}</span></button>)}</div>
          : <div className="empty"><p>Здесь появятся последние заметки открытого пространства.</p></div>}
      </>}

      {section === 'notes' && !space && <>
        <Title description="Заметки сгруппированы по пространствам.">Пространства</Title>
        {error ? retry : spaces === null ? <p className="quiet" role="status">Загрузка пространств…</p> : spaces.length
          ? <div className="rows">{spaces.map((item) => <button className="row" key={item.id} onClick={() => openSpace(item)}><span className="tile"><Icon path={tabs[1].path} /></span><strong>{item.name}</strong><span aria-hidden="true">›</span></button>)}</div>
          : <div className="empty"><h2>Здесь пока пусто</h2><p>Создайте пространство для учёбы, проекта или личных записей.</p></div>}
        {spaces !== null && <button className="primary wide" onClick={() => setEditor({ kind: 'space' })}>＋ Новое пространство</button>}
      </>}

      {section === 'notes' && space && <>
        <button className="text-button back" onClick={() => { setSpace(null); setQuery('') }}>‹ Пространства</button>
        <Title>{space.name}</Title>
        <div className="tools">
          <input aria-label="Поиск по заметкам" type="search" value={query} placeholder="Поиск по заметкам" onChange={(event) => setQuery(event.target.value)} />
          <button className="primary" onClick={() => setEditor({ kind: 'note', space })}>＋ Заметка</button>
        </div>
        {error ? retry : notes === null ? <p className="quiet" role="status">Загрузка заметок…</p> : notes.length
          ? <div className="rows">{notes.map((note) => <button className="row note" key={note.id} onClick={() => setEditor({ kind: 'read', note })}><strong>{note.title}</strong><span>{note.body}</span></button>)}</div>
          : <div className="empty"><h2>{query.trim() ? 'Ничего не найдено' : 'Пока нет заметок'}</h2><p>{query.trim() ? 'Попробуйте другой запрос.' : 'Добавьте первую запись в это пространство.'}</p></div>}
      </>}
    </section>
    <nav className="bottom-nav" aria-label="Разделы приложения">
      <button aria-current={section === 'home' ? 'page' : undefined} onClick={() => setSection('home')}><span><Icon path={tabs[0].path} /></span>Главная</button>
      <button aria-current={section === 'notes' ? 'page' : undefined} onClick={() => { setSection('notes'); setSpace(null); setQuery('') }}><span><Icon path={tabs[1].path} /></span>Заметки</button>
    </nav>
    {editor && <EditorDialog editor={editor} close={() => setEditor(null)} save={save} />}
  </main>
}

function EditorDialog({ editor, close, save }: { editor: Editor; close: () => void; save: (data: FormData) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { ref.current?.showModal() }, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try { await save(new FormData(event.currentTarget)) }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить.')
      setBusy(false)
    }
  }
  return <dialog ref={ref} aria-labelledby="editor-title" onCancel={(event) => { event.preventDefault(); if (!busy) close() }}>
    <h2 id="editor-title">{editor.kind === 'read' ? editor.note.title : editor.kind === 'space' ? 'Новое пространство' : 'Новая заметка'}</h2>
    {editor.kind === 'read' ? <><p className="note-body">{editor.note.body}</p><button className="secondary wide" onClick={close}>Закрыть</button></> : <form onSubmit={submit}>
      {editor.kind === 'note' && <p className="quiet">{editor.space.name}</p>}
      <label>{editor.kind === 'space' ? 'Название' : 'Заголовок'}<input name="title" required maxLength={editor.kind === 'space' ? 80 : 160} /></label>
      {editor.kind === 'note' && <label>Текст<textarea name="body" rows={5} required /></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="secondary" onClick={close} disabled={busy}>Отмена</button><button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
    </form>}
  </dialog>
}

createRoot(document.getElementById('root')!).render(<App />)
