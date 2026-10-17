import './App.css'
import { useState } from 'react'
import { Reader } from './features/reader/Reader'
import { PrivateWorkspace } from './features/accounts/PrivateWorkspace'
import { GuestReading } from './features/sharing/GuestReading'

function App() {
  const [localProjects, setLocalProjects] = useState(true)
  const guestPath = window.location.pathname.startsWith('/read/')
  if (guestPath) return <GuestReading token={window.location.pathname.slice('/read/'.length)} />

  return <>
    <header className="application-header">
      <span className="application-brand">Motion Manga Lab</span>
      <nav className="workspace-navigation" aria-label="Workspace">
        <button type="button" aria-pressed={localProjects} onClick={() => setLocalProjects(true)}>Creator workspace</button>
        <button type="button" aria-pressed={!localProjects} onClick={() => setLocalProjects(false)}>Research reader</button>
      </nav>
    </header>
    {localProjects ? <PrivateWorkspace /> : <Reader />}
  </>
}

export default App
