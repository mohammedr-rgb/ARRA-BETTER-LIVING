import { useState, useEffect, useMemo, useRef } from 'react'
import { parseMMDDDate } from '../lib/utils'
import { StatusPill } from './ui'

const SEARCH_FIELDS = [
  { key: 'PO Number', label: 'PO' },
  { key: 'City', label: 'City' },
  { key: 'GRN details', label: 'GRN' },
  { key: 'Tracking No', label: 'Tracking' },
  { key: 'Invoice No', label: 'Invoice' },
  { key: 'Appointment ID', label: 'Appt ID' },
  { key: 'Pincode', label: 'Pincode' },
  { key: 'Product', label: 'Product' },
]

const truncate = (v, n) => (v.length > n ? v.slice(0, n) + '…' : v)

export function UniversalSearch({ data, onSelect }) {
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 200)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const results = useMemo(() => {
    if (!dq) return []
    const ql = dq.toLowerCase()
    const byPO = new Map()
    for (const r of data) {
      const po = r['PO Number']
      if (!po) continue
      let hit = null
      for (const f of SEARCH_FIELDS) {
        const v = r[f.key]
        if (v && String(v).toLowerCase().includes(ql)) {
          hit = f
          break
        }
      }
      if (hit) {
        if (!byPO.has(po)) byPO.set(po, { row: r, hits: {} })
        const rec = byPO.get(po)
        rec.hits[hit.key] = r[hit.key]
      }
    }
    return Array.from(byPO.values()).sort((a, b) => {
      const da = parseMMDDDate(a.row['PO Released Date(MM-DD-YYYY)'])
      const db = parseMMDDDate(b.row['PO Released Date(MM-DD-YYYY)'])
      return (db || 0) - (da || 0)
    })
  }, [dq, data])

  const shown = results.slice(0, 15)
  const allCity = results.length > 0 && results.every(r => r.hits['City'])
  const cityName = allCity ? results[0].row['City'] : null

  const openFirst = () => {
    if (results.length && onSelect) {
      onSelect(results[0].row['PO Number'])
      setOpen(false)
    }
  }

  const pick = (po) => {
    if (onSelect) onSelect(po)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginBottom: 20 }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: '#64748b', pointerEvents: 'none' }}>🔍</span>
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); openFirst() }
            else if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Search PO number, city, GRN, tracking no, invoice no…"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            border: '1px solid #334155',
            borderRadius: 12,
            color: '#f1f5f9',
            padding: '13px 40px 13px 40px',
            fontSize: 14,
            outline: 'none',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.2)' }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.boxShadow = 'none' }}
        />
        {q && (
          <button
            onClick={() => { setQ(''); setDq(''); setOpen(false) }}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer', padding: 6 }}
            aria-label="Clear search"
          >✕</button>
        )}
      </div>

      {open && dq && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          zIndex: 60,
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          maxHeight: 420,
          overflowY: 'auto',
        }}>
          {results.length === 0 ? (
            <div style={{ padding: '18px 20px', fontSize: 13, color: '#64748b' }}>
              No matches found for “{dq}”
            </div>
          ) : (
            <>
              {cityName && (
                <div style={{ padding: '10px 16px 4px', fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>
                  📍 {cityName} • {results.length} PO{results.length === 1 ? '' : 's'}
                </div>
              )}
              {shown.map(({ row, hits }) => (
                <div
                  key={row['PO Number']}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => pick(row['PO Number'])}
                  style={{ padding: '10px 16px', borderBottom: '1px solid #1e293b', cursor: 'pointer', transition: 'background 0.12s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>{row['PO Number']}</span>
                    <StatusPill status={row['Status']} />
                    {row['City'] && <span style={{ fontSize: 12, color: '#94a3b8' }}>{row['City']}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, fontSize: 11.5, color: '#94a3b8', alignItems: 'center' }}>
                    {Object.entries(hits).slice(0, 3).map(([k, v]) => {
                      const f = SEARCH_FIELDS.find(x => x.key === k)
                      return (
                        <span key={k} style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 6, padding: '2px 8px', color: '#93c5fd' }}>
                          {f.label}: {String(v).length > 30 ? truncate(String(v), 30) : v}
                        </span>
                      )
                    })}
                    {row['Product'] && <span>📦 {truncate(row['Product'], 42)}</span>}
                  </div>
                </div>
              ))}
              {results.length > shown.length && (
                <div style={{ padding: '10px 16px', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                  …and {results.length - shown.length} more — keep typing to narrow
                </div>
              )}
              <div style={{ padding: '8px 16px', fontSize: 11, color: '#475569', borderTop: '1px solid #1e293b' }}>
                Enter opens the first result • results open in a new tab
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
