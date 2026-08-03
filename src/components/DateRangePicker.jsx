import { useState } from 'react'

export function DateRangePicker({ onChange, value }) {
  const [isOpen, setIsOpen] = useState(false)
  const [startDate, setStartDate] = useState(value?.start || '')
  const [endDate, setEndDate] = useState(value?.end || '')

  const presets = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
    { label: 'This month', days: 'month' },
    { label: 'This year', days: 'year' },
  ]

  const applyPreset = (days) => {
    const end = new Date()
    const start = new Date()
    
    if (days === 'month') {
      start.setDate(1)
    } else if (days === 'year') {
      start.setMonth(0, 1)
    } else {
      start.setDate(end.getDate() - days)
    }

    const formatDate = (d) => d.toISOString().split('T')[0]
    setStartDate(formatDate(start))
    setEndDate(formatDate(end))
    onChange?.({ start: formatDate(start), end: formatDate(end) })
    setIsOpen(false)
  }

  const handleApply = () => {
    onChange?.({ start: startDate, end: endDate })
    setIsOpen(false)
  }

  const handleClear = () => {
    setStartDate('')
    setEndDate('')
    onChange?.({ start: '', end: '' })
    setIsOpen(false)
  }

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return 'Select'
    return new Date(dateStr).toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short' 
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 8,
          color: '#f1f5f9',
          fontSize: 13,
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
      >
        <span>📅</span>
        <span>
          {startDate && endDate 
            ? `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`
            : 'Date Range'
          }
        </span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 8,
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 12,
          padding: 16,
          minWidth: 280,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          zIndex: 100,
          animation: 'scaleIn 0.15s ease'
        }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>
              Quick Select
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset.days)}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    borderRadius: 6,
                    color: '#3b82f6',
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #334155', paddingTop: 16 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>
              Custom Range
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>From</div>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    color: '#f1f5f9',
                    fontSize: 12
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>To</div>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    color: '#f1f5f9',
                    fontSize: 12
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={handleClear}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#94a3b8',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
            <button
              onClick={handleApply}
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
