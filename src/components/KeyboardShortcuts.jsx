import { useState, useEffect } from 'react'

export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + K = Toggle search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="search" i], input[placeholder*="PO" i]')
        if (searchInput) searchInput.focus()
      }
      // Ctrl/Cmd + R = Refresh
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault()
        document.querySelector('button[title="Refresh Data"]')?.click()
      }
      // ? = Show shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const activeElement = document.activeElement
        if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
          setShowHelp(prev => !prev)
        }
      }
      // Escape = Close help
      if (e.key === 'Escape') {
        setShowHelp(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!showHelp) return null

  const shortcuts = [
    { keys: ['Ctrl', 'K'], description: 'Focus search' },
    { keys: ['Ctrl', 'R'], description: 'Refresh data' },
    { keys: ['?'], description: 'Toggle this help' },
    { keys: ['Esc'], description: 'Close dialogs' },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.15s ease'
      }}
      onClick={() => setShowHelp(false)}
    >
      <div
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 16,
          padding: 24,
          minWidth: 320,
          animation: 'scaleIn 0.15s ease'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#f1f5f9' }}>
          ⌨️ Keyboard Shortcuts
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shortcuts.map((shortcut, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: 14 }}>{shortcut.description}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {shortcut.keys.map((key, j) => (
                  <span key={j} className="kbd">{key}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #334155', textAlign: 'center' }}>
          <span style={{ color: '#64748b', fontSize: 12 }}>Press <span className="kbd">?</span> to toggle</span>
        </div>
      </div>
    </div>
  )
}
