import { Title } from './ui'

export function Profile({ email, showSpaces }: { email: string; showSpaces: () => void }) {
  return <>
    <Title>Профиль</Title>
    <section className="profile-card" aria-label="Аккаунт Nexora">
      <span className="profile-avatar" aria-hidden="true">{email[0]?.toUpperCase() || 'N'}</span>
      <h2>{email || 'Аккаунт Nexora'}</h2>
      <p className="quiet">Личный аккаунт Nexora</p>
    </section>
    <h2 className="profile-heading">Настройки и данные</h2>
    <dl className="rows profile-details">
      <div className="row"><dt>Хранилище</dt><dd>Локально (localStorage)</dd></div>
      <div className="row"><dt>Оформление</dt><dd>Тёмная тема</dd></div>
      <div className="row"><dt>Поиск</dt><dd>По словам</dd></div>
      <div className="row"><dt>Модель ИИ</dt><dd>Не подключена</dd></div>
      <div className="row"><dt>Экспорт</dt><dd>В разработке</dd></div>
    </dl>
    <button className="secondary wide" onClick={showSpaces}>Мои пространства</button>
  </>
}
