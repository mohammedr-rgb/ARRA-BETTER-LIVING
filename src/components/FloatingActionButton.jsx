import { useState } from 'react'

export function FloatingActionButton({ onRefresh, onDownload, isRefreshing }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 280, zIndex: 50 }}>
      {expanded && (
        <div style={{
          position: 'absolute',
          bottom: 70,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          animation: 'fadeInUp 0.2s ease'
        }}>
          <button
            onClick={() => { onRefresh?.(); setExpanded(false) }}
            disabled={isRefreshing}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(59, 130, 246, 0.9)',
              border: 'none',
              color: '#fff',
              fontSize: 18,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isRefreshing ? 0.6 : 1
            }}
            title="Refresh Data"
          >
            ↻
          </button>
          <button
            onClick={() => { onDownload?.(); setExpanded(false) }}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.9)',
              border: 'none',
              color: '#fff',
              fontSize: 18,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Download Data"
          >
            ⬇
          </button>
        </div>
      )}
      <button
        className="fab"
        onClick={() => setExpanded(!expanded)}
        aria-label="Quick actions"
      >
        {expanded ? '✕' : '⚡'}
      </button>
    </div>
  )
}
