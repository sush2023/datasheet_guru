import './App.css'
import FileUpload from './components/FileUpload'
import ChatInterface from './components/ChatInterface'

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Datasheet Guru</h1>
      </header>
      <details className="upload-details">
        <summary>Upload New Datasheet</summary>
        <FileUpload />
      </details>
      <ChatInterface />
    </div>
  )
}

export default App
