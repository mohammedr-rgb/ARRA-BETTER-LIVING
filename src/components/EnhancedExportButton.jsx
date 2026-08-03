import { useState } from 'react'

export function EnhancedExportButton({ data, filename = 'export' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const exportCSV = () => {
    if (!data?.length) return
    
    setExporting(true)
    const headers = Object.keys(data[0])
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h] || ''
        return val.toString().includes(',') ? `"${val}"` : val
      }).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${filename}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    
    setTimeout(() => setExporting(false), 1000)
    setIsOpen(false)
  }

  const exportJSON = () => {
    if (!data?.length) return
    
    setExporting(true)
    const jsonContent = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${filename}.json`
    link.click()
    URL.revokeObjectURL(link.href)
    
    setTimeout(() => setExporting(false), 1000)
    setIsOpen(false)
  }

  const printData = () => {
    window.print()
    setIsOpen(false)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={exporting}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: 8,
          color: '#22c55e',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          opacity: exporting ? 0.6 : 1
        }}
      >
        <span>{exporting ? '⏳' : '⬇'}</span>
        <span>{exporting ? 'Exporting...' : 'Export'}</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 8,
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 10,
          padding: 8,
          minWidth: 160,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          zIndex: 100,
          animation: 'scaleIn 0.15s ease'
        }}>
          <button
            onClick={exportCSV}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              color: '#f1f5f9',
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={e => e.target.style.background = 'rgba(59, 130, 246, 0.1)'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
          >
            <span>📊</span>
            <span>Export as CSV</span>
          </button>
          <button
            onClick={exportJSON}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              color: '#f1f5f9',
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={e => e.target.style.background = 'rgba(59, 130, 246, 0.1)'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
          >
            <span>{ }</span>
            <span>Export as JSON</span>
          </button>
          <div style={{ borderTop: '1px solid #334155', margin: '4px 0' }} />
          <button
            onClick={printData}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              color: '#f1f5f9',
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={e => e.target.style.background = 'rgba(59, 130, 246, 0.1)'}
            onMouseLeave={e => e.target.style.background = 'transparent'}
          >
            <span>🖨</span>
            <span>Print</span>
          </button>
        </div>
      )}
    </div>
  )
}
