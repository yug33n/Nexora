import { useRef, useState } from 'react'
import { exportNotesZip, importNotesZip, moveNotesFolder, usesNotesFolder } from '../storage'
import { Title } from './ui'

export function Profile({ email, showSpaces, onImport }: { email: string; showSpaces: () => void; onImport: () => void }) {
  const [storageOpen, setStorageOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const [archiveStatus, setArchiveStatus] = useState('')
  const [archiveError, setArchiveError] = useState('')

  const exportNotes = async () => {
    setExporting(true)
    setArchiveStatus('')
    setArchiveError('')
    try {
      const result = await exportNotesZip()
      if (result === 'saved') setArchiveStatus('ZIP-архив сохранён.')
      if (result === 'download') setArchiveStatus('Скачивание ZIP-архива запущено.')
    } catch {
      setArchiveError('Не удалось экспортировать заметки. Повторите попытку.')
    } finally {
      setExporting(false)
    }
  }

  const importNotes = async (file: File) => {
    setImporting(true)
    setArchiveStatus('')
    setArchiveError('')
    try {
      const { spaces, notes } = await importNotesZip(file)
      setArchiveStatus(spaces || notes
        ? `Добавлено пространств: ${spaces}. Добавлено заметок: ${notes}.`
        : 'В архиве нет новых заметок или пространств.')
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Не удалось импортировать заметки.')
    } finally {
      onImport()
      setImporting(false)
    }
  }

  if (storageOpen) return <StorageSettings back={() => setStorageOpen(false)} />

  return <>
    <Title>Профиль</Title>
    <section className="profile-card" aria-label="Аккаунт Nexora">
      <span className="profile-avatar" aria-hidden="true">{email[0]?.toUpperCase() || 'N'}</span>
      <h2>{email || 'Аккаунт Nexora'}</h2>
      <p className="quiet">Личный аккаунт Nexora</p>
    </section>
    <h2 className="profile-heading">Настройки и данные</h2>
    <div className="rows">
      <button type="button" className="row profile-storage" onClick={() => setStorageOpen(true)}>
        <span>Хранилище</span>
        <span>{usesNotesFolder ? 'Папка на телефоне' : 'В браузере'} <span aria-hidden="true">›</span></span>
      </button>
      <dl className="profile-details">
        <div className="row"><dt>Оформление</dt><dd>Тёмная тема</dd></div>
        <div className="row"><dt>Поиск</dt><dd>По словам</dd></div>
        <div className="row"><dt>Модель ИИ</dt><dd>Не подключена</dd></div>
      </dl>
      <button type="button" className="row profile-storage" onClick={exportNotes} disabled={exporting || importing}>
        <span>{exporting ? 'Экспортируем заметки…' : 'Экспортировать заметки'}</span>
        <span>.zip</span>
      </button>
      <button type="button" className="row profile-storage" onClick={() => importInput.current?.click()} disabled={exporting || importing}>
        <span>{importing ? 'Импортируем заметки…' : 'Импортировать заметки'}</span>
        <span>.zip</span>
      </button>
      <input ref={importInput} type="file" accept=".zip,application/zip" hidden onChange={(event) => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void importNotes(file)
      }} />
    </div>
    {archiveStatus && <p role="status">{archiveStatus}</p>}
    {archiveError && <p className="error" role="alert">{archiveError}</p>}
    <button className="secondary wide" onClick={showSpaces}>Мои пространства</button>
  </>
}

function StorageSettings({ back }: { back: () => void }) {
  const [moving, setMoving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const changeFolder = async () => {
    setMoving(true)
    setStatus('')
    setError('')
    try {
      if (await moveNotesFolder()) setStatus('Папка изменена. Заметки и пространства перенесены.')
    } catch (cause) {
      const code = (cause as { code?: string } | undefined)?.code
      setError(code === 'FOLDER_CONFLICT'
        ? 'В этой папке уже есть другие данные Nexora. Выберите другую папку.'
        : 'Не удалось перенести данные. Проверьте доступ к папкам и повторите попытку.')
    } finally {
      setMoving(false)
    }
  }

  return <>
    <button type="button" className="text-button back" onClick={back} autoFocus>‹ Профиль</button>
    <Title>Хранилище</Title>
    <section className="storage-settings" aria-labelledby="local-storage-title">
      <h2 id="local-storage-title">Локальное хранилище</h2>
      {usesNotesFolder ? <>
        <p className="quiet">При смене папки Nexora перенесёт заметки и пространства. В прежней папке останется копия.</p>
        <button type="button" className="secondary" onClick={changeFolder} disabled={moving}>
          {moving ? 'Меняем папку…' : 'Сменить папку хранения'}
        </button>
      </> : <p className="quiet">Заметки и пространства хранятся в браузере.</p>}
      {status && <p role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    <section className="storage-settings" aria-labelledby="cloud-storage-title">
      <h2 id="cloud-storage-title">Облачное хранилище</h2>
      <p id="cloud-storage-status" className="quiet">Подключение через аккаунт Nexora будет доступно позже.</p>
      <button type="button" className="secondary" aria-describedby="cloud-storage-status" disabled>Подключить облачное хранилище</button>
    </section>
  </>
}
