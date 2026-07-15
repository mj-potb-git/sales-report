import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Lightweight path-based routing (no react-router dependency):
//   /tv        → full-screen TV Sales Achievement board (kiosk, no login)
//   /tv/admin  → agent photo manager for the board
//   *          → the main operations dashboard (auth-gated)
const TvApp   = lazy(() => import('./tv/TvApp.jsx'))
const TvAdmin = lazy(() => import('./tv/TvAdmin.jsx'))

function Root() {
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path === '/tv/admin') {
    return <Suspense fallback={null}><TvAdmin /></Suspense>
  }
  if (path === '/tv') {
    return <Suspense fallback={null}><TvApp /></Suspense>
  }
  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
