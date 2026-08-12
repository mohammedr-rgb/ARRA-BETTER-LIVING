import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './enhancements.css'
import App from './App.jsx'
import AuthGate from './components/AuthGate'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)
