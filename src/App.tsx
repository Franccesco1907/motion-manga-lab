import './App.css'
import { useState } from 'react'
import { Reader } from './features/reader/Reader'
import { PrivateWorkspace } from './features/accounts/PrivateWorkspace'
import { GuestReading } from './features/sharing/GuestReading'

function App() {
  const [localProjects, setLocalProjects] = useState(false)
  const guestPath = window.location.pathname.startsWith('/read/')
  if (guestPath) return <GuestReading token={window.location.pathname.slice('/read/'.length)} />

  return <>
    <nav className="workspace-navigation" aria-label="Workspace">
      <button type="button" aria-pressed={!localProjects} onClick={() => setLocalProjects(false)}>Research reader</button>
      <button type="button" aria-pressed={localProjects} onClick={() => setLocalProjects(true)}>Local projects</button>
    </nav>
    {localProjects ? <PrivateWorkspace /> : <Reader />}
  </>
}

export default App
