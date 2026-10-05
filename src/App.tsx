import './App.css'
import { useState } from 'react'
import { Reader } from './features/reader/Reader'
import { LocalProjects } from './features/local-projects/LocalProjects'

function App() {
  const [localProjects, setLocalProjects] = useState(false)

  return <>
    <nav className="workspace-navigation" aria-label="Workspace">
      <button type="button" aria-pressed={!localProjects} onClick={() => setLocalProjects(false)}>Research reader</button>
      <button type="button" aria-pressed={localProjects} onClick={() => setLocalProjects(true)}>Local projects</button>
    </nav>
    {localProjects ? <LocalProjects /> : <Reader />}
  </>
}

export default App
