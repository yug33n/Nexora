import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Editor } from '../types'

export function EditorDialog({ editor, close, save }: { editor: Editor; close: () => void; save: (data: FormData) => Promise<void> }) {
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
    {editor.kind === 'read' ? <>
      <p className="note-body">{editor.note.body}</p><button className="secondary wide" onClick={close}>Закрыть</button>
    </> : <form onSubmit={submit}>
      {editor.kind === 'note' && <p className="quiet">{editor.space.name}</p>}
      <label>{editor.kind === 'space' ? 'Название' : 'Заголовок'}<input name="title" required maxLength={editor.kind === 'space' ? 80 : 160} /></label>
      {editor.kind === 'note' && <label>Текст<textarea name="body" rows={5} required /></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="secondary" onClick={close} disabled={busy}>Отмена</button><button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
    </form>}
  </dialog>
}
