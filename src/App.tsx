import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import './App.css'
import FileUpload from './components/FileUpload'
import ChatInterface from './components/ChatInterface'
import Auth from './components/Auth'

function App() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!session) {
    return <Auth />
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Datasheet Guru</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            float: 'right',
            fontSize: '14px',
            padding: '8px 16px',
            backgroundColor: '#ff4d4d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Sign Out
        </button>
      </header>
      <main>
        <details className="upload-details">
          <summary>Upload New Datasheet</summary>
          <FileUpload />
        </details>
        <ChatInterface />
      </main>
    </div>
  )
}

export default App
