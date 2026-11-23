import { useEffect, useState } from 'react'
import type { Editor, Note, Space, Tab } from '../types'
import { tabs } from '../types'
import { request } from '../storage'
import { Icon, Title } from './ui'
import { EditorDialog } from './EditorDialog'
import { SpaceMap } from './SpaceMap'

export function Workspace() {
  const [tab, setTab] = useState<Tab>('home')
  const [spaces, setSpaces] = useState<Space[] | null>(null)
  const [space, setSpace] = useState<Space | null>(null)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [editor, setEditor] = useState<Editor | null>(null)
  const spaceId = space?.id
  const [recentSpaceId, setRecentSpaceId] = useState('')
  const [recent, setRecent] = useState<Note[]>([])
  const recentSpace = spaces?.find((item) => item.id === recentSpaceId) ?? spaces?.[0]

  useEffect(() => {
    if (tab !== 'home' || !recentSpace) return
    const controller = new AbortController()
    setRecent([])
    request(`/spaces/${recentSpace.id}/notes`, '', { signal: controller.signal })
      .then((items) => { if (!controller.signal.aborted) setRecent(items.slice(0, 3) as Note[]) })
      .catch(() => {})
    return () => controller.abort()
  }, [tab, recentSpace?.id])

  useEffect(() => {
    const controller = new AbortController()
    const path = spaceId ? `/spaces/${spaceId}/${query.trim() ? `search?q=${encodeURIComponent(query.trim())}` : 'notes'}` : '/spaces'
    setError('')
    request(path, '', { signal: controller.signal }).then((items) => {
      if (controller.signal.aborted) return
      if (spaceId) setNotes(items as Note[])
      else setSpaces(items as Space[])
    }).catch(() => {
      if (controller.signal.aborted) return
      setError(spaceId ? 'Не удалось загрузить заметки.' : 'Не удалось загрузить пространства.')
    })
    return () => controller.abort()
  }, [spaceId, query, refresh])

  const navigate = (next: Tab, selected: Space | null = null) => {
    setTab(next)
    if (space?.id !== selected?.id || query) setNotes(null)
    setSpace(selected)
    setQuery('')
    window.scrollTo(0, 0)
  }
  const openSpace = (selected: Space) => {
    setRecentSpaceId(selected.id)
    navigate('notes', selected)
  }
  const save = async (data: FormData) => {
    if (editor?.kind === 'space') {
      const name = String(data.get('title')).trim()
      if (!name) throw new Error('Введите название пространства.')
      const items = await request('/spaces', '', { data: { name } })
      const created = items[items.length - 1] as Space
      setSpaces((previous) => previous ? [...previous, created] : null)
      openSpace(created)
    }
    if (editor?.kind === 'note') {
      const title = String(data.get('title')).trim()
      const body = String(data.get('body')).trim()
      if (!title || !body) throw new Error('Введите заголовок и текст заметки.')
      await request(`/spaces/${editor.space.id}/notes`, '', { data: { title, body } })
      setQuery('')
      setNotes(null)
      setRefresh((previous) => previous + 1)
    }
    setEditor(null)
  }
  const retry = <div className="empty"><p role="alert">{error}</p><button className="secondary" onClick={() => setRefresh((value) => value + 1)}>Повторить</button></div>
  return <main className="app-shell">
    <header className="topbar"><div className="wordmark"><span className="brand-mark">N</span> Nexora</div></header>
    <section className="view" key={spaceId ?? tab}>
      {(tab === 'home' || (tab === 'notes' && !space)) && <>
        <Title description={tab === 'home' ? 'Личное место для записей.' : 'Заметки сгруппированы по пространствам.'}>{tab === 'home' ? 'Главная' : 'Пространства'}</Title>
        {tab === 'home' && <div className="section-head"><h2>Пространства</h2><button className="text-button" onClick={() => navigate('notes')}>Все</button></div>}
        {error ? retry : spaces === null ? <p className="quiet" role="status">Загрузка пространств…</p> : spaces.length
          ? <div className="rows">{(tab === 'home' ? spaces.slice(0, 3) : spaces).map((item) => <button className="row" key={item.id} onClick={() => openSpace(item)}><span className="tile"><Icon path={tabs[1].path} /></span><strong>{item.name}</strong><span aria-hidden="true">›</span></button>)}</div>
          : <div className="empty"><h2>Здесь пока пусто</h2><p>Создайте пространство для учёбы, проекта или личных записей.</p></div>}
        {spaces !== null && <button className="primary wide" onClick={() => setEditor({ kind: 'space' })}>＋ Новое пространство</button>}
        {tab === 'home' && recentSpace && <section className="recent">
          <div className="section-head"><h2>Недавнее · {recentSpace.name}</h2><button className="text-button" onClick={() => openSpace(recentSpace)}>Все</button></div>
          {recent.length > 0 && <div className="rows">{recent.map((note) => <button className="row note" key={note.id} onClick={() => setEditor({ kind: 'read', note })}><strong>{note.title}</strong><span>{note.body}</span></button>)}</div>}
        </section>}
      </>}
      {tab === 'notes' && space && <>
        <button className="text-button back" onClick={() => navigate('notes')}>‹ Пространства</button>
        <Title>{space.name}</Title>
        <div className="tools">
          <input aria-label="Поиск по заметкам" type="search" value={query} placeholder="Поиск по заметкам" onChange={(event) => { setQuery(event.target.value); setNotes(null) }} />
          <button className="primary" onClick={() => setEditor({ kind: 'note', space })}>＋ Заметка</button>
        </div>
        {error ? retry : notes === null ? <p className="quiet" role="status">Загрузка заметок…</p> : notes.length
          ? <div className="rows">{notes.map((note) => <button className="row note" key={note.id} onClick={() => setEditor({ kind: 'read', note })}><strong>{note.title}</strong><span>{note.body}</span></button>)}</div>
          : <div className="empty"><h2>{query.trim() ? 'Ничего не найдено' : 'Пока нет заметок'}</h2><p>{query.trim() ? 'Попробуйте другой запрос.' : 'Добавьте первую запись в это пространство.'}</p></div>}
      </>}
      {tab === 'people' && <><Title description="Факты, важные даты и идеи подарков.">Люди</Title><div className="empty"><h2>Раздел в разработке</h2><p>Здесь появятся карточки близких.</p></div></>}
      {tab === 'map' && <><Title description="Нажмите на узел, чтобы открыть заметки.">Карта пространств</Title>
        {error ? retry : spaces === null ? <p className="quiet" role="status">Загрузка пространств…</p>
          : spaces.length ? <SpaceMap spaces={spaces} openSpace={openSpace} />
          : <div className="empty"><p>Создайте первое пространство, чтобы увидеть его на карте.</p><button className="secondary" onClick={() => setEditor({ kind: 'space' })}>Новое пространство</button></div>}
      </>}
      {tab === 'profile' && <><Title>Профиль</Title><div className="empty"><h2>Раздел в разработке</h2><p>Появится в задаче 10.</p></div></>}
    </section>
    <nav className="bottom-nav" aria-label="Разделы приложения">
      {tabs.map((item) => <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
        <span><Icon path={item.path} /></span>{item.label}
      </button>)}
    </nav>
    {editor && <EditorDialog editor={editor} close={() => setEditor(null)} save={save} />}
  </main>
}
