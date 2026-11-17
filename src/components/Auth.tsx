import { useState } from 'react'
import type { FormEvent } from 'react'

export function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [busy, setBusy] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      onSuccess()
    } finally {
      setBusy(false)
    }
  }
  return <main className="auth">
    <form className="auth-card" onSubmit={submit}>
      <div className="wordmark"><span className="brand-mark">N</span> Nexora</div>
      <header className="page-title"><h1>Вход</h1></header>
      <label>Почта<input name="email" type="email" /></label>
      <label>Пароль<input name="password" type="password" /></label>
      <button className="primary" disabled={busy}>{busy ? 'Подключение…' : 'Войти'}</button>
    </form>
  </main>
}
