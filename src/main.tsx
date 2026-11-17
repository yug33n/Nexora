import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth } from './components/Auth'

function App() {
  const [signedIn, setSignedIn] = useState(false)
  return signedIn
    ? <main className="app-shell"><h1>Nexora</h1><p>Экраны в разработке.</p></main>
    : <Auth onSuccess={() => setSignedIn(true)} />
}

createRoot(document.getElementById('root')!).render(<App />)
