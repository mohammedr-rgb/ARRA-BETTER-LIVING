import { useState, useContext } from 'react'
import { UserContext } from '../lib/userContext'
import { mdmToISO, isoToMdm } from '../lib/utils'

const dateInputStyle = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#f1f5f9',
  padding: '8px 12px',
  fontSize: 13,
}

export function Tooltip({ children, style }) {
  return <div className="popover" style={style}>{children}</div>
}

export function TooltipRow({ label, value, valueColor = '#f1f5f9' }) {
  return (
    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
      {label}: <span style={{ color: valueColor, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

export function StatCard({ label, icon, color = '#3b82f6', value, valueColor, change, changeColor = '#94a3b8', delta, deltaTitle = 'vs previous 30 days', tooltip, tooltipStyle, style }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      className="stat-card"
      style={{ position: 'relative', cursor: tooltip ? 'pointer' : undefined, ...style }}
      onMouseEnter={() => tooltip && setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="stat-header">
        <div className="stat-label">{label}</div>
        <div className="stat-icon" style={{ background: `${color}26`, color }}>{icon}</div>
      </div>
      <div className="stat-value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
      <div className="stat-change" style={{ color: changeColor, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {change}
        {delta !== undefined && delta !== null && (
          <span title={deltaTitle} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: delta >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: delta >= 0 ? '#22c55e' : '#ef4444' }}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
      </div>
      {hover && <Tooltip style={tooltipStyle}>{tooltip}</Tooltip>}
    </div>
  )
}

export function StatusPill({ status }) {
  return (
    <span className={`status ${(status || '').toLowerCase().replace(/\s+/g, '')}`}>
      {status || 'N/A'}
    </span>
  )
}

export function EmptyState({ message = 'No data available' }) {
  return <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 13 }}>{message}</div>
}

export function ProfileSection() {
  const { userEmail } = useContext(UserContext)
  return (
    <div className="profile">
      <div className="avatar">{userEmail ? userEmail[0].toUpperCase() : 'U'}</div>
      <div>
        <div className="name">{userEmail}</div>
      </div>
    </div>
  )
}

export function DateRangePicker({ from, to, onFrom, onTo, style }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', ...style }}>
      <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>From</label>
      <input type="date" value={mdmToISO(from)} onChange={e => onFrom(isoToMdm(e.target.value))} style={dateInputStyle} />
      <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>To</label>
      <input type="date" value={mdmToISO(to)} onChange={e => onTo(isoToMdm(e.target.value))} style={dateInputStyle} />
    </div>
  )
}

export function CSVButton({ makeRows, filename, children = '⬇ Download CSV', style }) {
  return (
    <button
      onClick={() => downloadCSV(makeRows(), filename)}
      style={{ background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', whiteSpace: 'nowrap', ...style }}
    >
      {children}
    </button>
  )
}

function downloadCSV(rows, filename) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function SortTh({ label, k, sort, style }) {
  const active = sort.key === k
  return (
    <th onClick={() => sort.toggle(k)} style={{ cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', ...style }}>
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, color: active ? '#3b82f6' : '#475569' }}>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </th>
  )
}
