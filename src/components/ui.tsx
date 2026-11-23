import type { ReactNode } from 'react'

export function Icon({ path }: { path: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
}

export function Title({ children, description }: { children: ReactNode; description?: string }) {
  return <header className="page-title"><h1>{children}</h1>{description && <p>{description}</p>}</header>
}
