import { useState, useEffect, useMemo } from 'react'
import { num, parseCSV, csvEscape } from '../lib/utils'
import { ProfileSection, CSVButton } from '../components/ui'

const STOCK_URL = 'https://docs.google.com/spreadsheets/d/1nvIkYrNZejV4UG6VcL3h0wlQkgGRio2zbqdXkVO2gPw/export?format=csv&gid=1000733943'

const STATUS_STYLE = {
  'In Stock': { color: '#22c55e', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' },
  'Out of Stock': { color: '#ef4444', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' },
  'Low Stock': { color: '#eab308', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)' },
}

function StockStatusPill({ status }) {
  const s = STATUS_STYLE[status] || { color: '#eab308', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)' }
  return (
    <span style={{ ...s, display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {status || 'N/A'}
    </span>
  )
}

export default function StockTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState('All')

  const load = () => {
    setIsRefreshing(true)
    setError(null)
    fetch(STOCK_URL)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`)
        return r.text()
      })
      .then(text => {
        const body = text.split('\n').slice(1).join('\n').replace(/\n ?\(MM-DD-YYYY\)/g, '(MM-DD-YYYY)')
        setRows(parseCSV(body))
        setLoading(false)
        setIsRefreshing(false)
      })
      .catch(e => {
        setLoading(false)
        setIsRefreshing(false)
        setError(e.message || 'Failed to load stock data')
      })
  }

  useEffect(() => { load() }, [])

  const statuses = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r['Stock Status']).filter(Boolean)))], [rows])

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return rows
    return rows.filter(r => r['Stock Status'] === statusFilter)
  }, [rows, statusFilter])

  const sorted = useMemo(() => [...filtered].sort((a, b) => String(a['Product'] || '').localeCompare(String(b['Product'] || ''))), [filtered])

  const stats = useMemo(() => {
    const inStock = rows.filter(r => r['Stock Status'] === 'In Stock').length
    const lowStock = rows.filter(r => (r['Stock Status'] || '').toLowerCase().includes('low')).length
    const totalValue = Math.round(rows.reduce((s, r) => s + num(r['Total Value']), 0))
    return { total: rows.length, inStock, outOfStock: rows.length - inStock - lowStock, lowStock, totalValue }
  }, [rows])

  const csvRows = () => {
    const line = row => ['Box Type', 'Product', 'MRP', 'MFG Date (MM-DD-YYYY)', 'EXP Date (MM-DD-YYYY)', 'Days to Expiry', 'Opening Box Count', 'Box In', 'Box Out', 'Closing Box Count', 'Reorder Level', 'Stock Status', 'Total Value', 'Remarks'].map(h => csvEscape(row[h] ?? '')).join(',')
    return ['Stock Inventory', '', ['Box Type', 'Product', 'MRP', 'MFG Date', 'EXP Date', 'Days to Expiry', 'Opening Box Count', 'Box In', 'Box Out', 'Closing Box Count', 'Reorder Level', 'Stock Status', 'Total Value', 'Remarks'].join(','), ...sorted.map(line)]
  }

  const summary = [
    { label: 'Total Products', icon: '📦', color: '#3b82f6', value: stats.total },
    { label: 'In Stock', icon: '✅', color: '#22c55e', value: stats.inStock },
    { label: 'Low Stock', icon: '⚠️', color: '#eab308', value: stats.lowStock },
    { label: 'Out of Stock', icon: '❌', color: '#ef4444', value: stats.outOfStock },
    { label: 'Total Value', icon: '💰', color: '#8b5cf6', value: '₹' + stats.totalValue.toLocaleString() },
  ]

  return (
    <>
      <header>
        <div>
          <h1>Stock</h1>
          <div className="date">{stats.total} products • {stats.inStock} in stock • Last updated from Inventory sheet</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={load} disabled={isRefreshing} style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isRefreshing ? 0.6 : 1 }}>
            ↻ {isRefreshing ? 'Refreshing...' : 'Refresh Stock'}
          </button>
          <ProfileSection />
        </div>
      </header>

      <div className="stats-grid">
        {summary.map(s => (
          <div className="stat-card" key={s.label} style={{ position: 'relative' }}>
            <div className="stat-header">
              <div className="stat-label">{s.label}</div>
              <div className="stat-icon" style={{ background: `${s.color}26`, color: s.color }}>{s.icon}</div>
            </div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="recent-orders" style={{ marginTop: 20, borderColor: 'rgba(239,68,68,0.4)' }}>
          <div style={{ color: '#ef4444', fontSize: 13, padding: 8 }}>
            Failed to load stock data: {error} — <a href="#" onClick={e => { e.preventDefault(); load() }} style={{ color: '#3b82f6' }}>retry</a>
          </div>
        </div>
      )}

      {!error && (
        <div className="recent-orders" style={{ marginTop: 20 }}>
          <div className="orders-header">
            <div className="orders-title">Inventory Master</div>
            <div className="chart-period" style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 12 }}>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', fontSize: 12, cursor: 'pointer', outline: 'none' }}>
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <CSVButton makeRows={csvRows} filename="stock_inventory.csv" />
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading stock data...</div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No products match this filter.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Box Type</th>
                  <th>Product</th>
                  <th>MRP</th>
                  <th>Expiry</th>
                  <th>Days to Expiry</th>
                  <th>Opening Box</th>
                  <th>Box In</th>
                  <th>Box Out</th>
                  <th>Closing Box Count</th>
                  <th>Reorder Level</th>
                  <th>Stock Status</th>
                  <th>Total Value</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const days = num(r['Days to Expiry'])
                  const expiryStyle = days > 0 && days <= 30 ? { color: '#ef4444' } : undefined
                  return (
                    <tr key={i}>
                      <td>{r['Box Type'] || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{r['Product'] || '—'}</td>
                      <td>{r['MRP'] ? '₹' + num(r['MRP']) : '—'}</td>
                      <td>{r['EXP Date (MM-DD-YYYY)'] || '—'}</td>
                      <td style={expiryStyle}>{days || '—'}</td>
                      <td>{num(r['Opening Box Count']) || '—'}</td>
                      <td>{num(r['Box In']) || '—'}</td>
                      <td>{num(r['Box Out']) || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{num(r['Closing Box Count']) || '—'}</td>
                      <td>{num(r['Reorder Level']) || '—'}</td>
                      <td><StockStatusPill status={r['Stock Status']} /></td>
                      <td>{r['Total Value'] ? '₹' + num(r['Total Value']).toLocaleString() : '—'}</td>
                      <td style={{ color: '#94a3b8' }}>{r['Remarks'] || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}