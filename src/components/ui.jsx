import { useState, useContext, useId, useEffect, useRef } from 'react'
import { UserContext } from '../lib/userContext'
import { mdmToISO, isoToMdm, downloadCSV } from '../lib/utils'
import { setToastDispatch, clearToastDispatch } from '../lib/toast'

const dateInputStyle = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#f1f5f9',
  padding: '8px 12px',
  fontSize: 13,
}

export function Tooltip({ children, style, role = 'tooltip', id }) {
  return <div className="popover" style={style} role={role} id={id}>{children}</div>
}

export function TooltipRow({ label, value, valueColor = '#f1f5f9' }) {
  return (
    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
      {label}: <span style={{ color: valueColor, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

export function StatCard({ label, icon, color = '#3b82f6', value, valueColor, change, changeColor = '#94a3b8', delta, deltaTitle = 'vs previous 30 days', tooltip, tooltipStyle, style }) {
  const [open, setOpen] = useState(false)
  const tid = useId()
  const show = tooltip ? open : false
  return (
    <div
      className="stat-card"
      style={{ position: 'relative', cursor: tooltip ? 'pointer' : undefined, ...style }}
      tabIndex={tooltip ? 0 : undefined}
      role={tooltip ? 'button' : undefined}
      aria-haspopup={tooltip ? 'true' : undefined}
      aria-expanded={tooltip ? show : undefined}
      aria-describedby={show ? tid : undefined}
      onMouseEnter={() => tooltip && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => tooltip && setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={e => {
        if (!tooltip) return
        if (e.key === 'Escape') setOpen(false)
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v) }
      }}
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
      {show && <Tooltip style={tooltipStyle} id={tid}>{tooltip}</Tooltip>}
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

const mdm = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`

export function RangePresets({ onFrom, onTo, style }) {
  const today = new Date()
  const presets = [
    { label: '7D', days: 7 },
    { label: '30D', days: 30 },
    { label: '90D', days: 90 },
    { label: 'QTD', q: true },
    { label: 'YTD', y: true },
    { label: 'All', all: true },
  ]
  const apply = (p) => {
    if (p.days) onFrom(mdm(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (p.days - 1))))
    else if (p.q) onFrom(mdm(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)))
    else if (p.y) onFrom(mdm(new Date(today.getFullYear(), 0, 1)))
    else if (p.all) onFrom(mdm(new Date(2000, 0, 1)))
    onTo(mdm(today))
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', ...style }}>
      {presets.map(p => (
        <button
          key={p.label}
          onClick={() => apply(p)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

export function CSVButton({ makeRows, filename, children = '⬇ Download CSV', style }) {
  const [savedMsg, setSavedMsg] = useState(null)
  const onClick = () => {
    const rows = makeRows()
    downloadCSV(rows, filename)
    setSavedMsg(`✓ Saved (${rows.length} rows)`)
    setTimeout(() => setSavedMsg(null), 2000)
  }
  return (
    <button
      onClick={onClick}
      style={{ background: savedMsg ? '#16a34a' : '#22c55e', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', ...style }}
    >
      {savedMsg || children}
    </button>
  )
}

export function SortTh({ label, k, sort, style, className }) {
  const active = sort.key === k
  return (
    <th onClick={() => sort.toggle(k)} style={{ cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', ...style }} className={className}>
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, color: active ? '#3b82f6' : '#475569' }}>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </th>
  )
}

/* ── Skeleton primitives ──────────────────────────────────────────── */

export function Skeleton({ className = '', style }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />
}

export function SkeletonStatCard() {
  return (
    <div className="stat-card" style={{ cursor: 'default' }} aria-hidden="true">
      <div className="stat-header">
        <div className="stat-label"><Skeleton className="skel-text" style={{ width: 90 }} /></div>
        <div className="stat-icon" style={{ background: 'rgba(59,130,246,0.1)' }}><Skeleton className="skel-circle" /></div>
      </div>
      <div className="stat-value"><Skeleton className="skel-text" style={{ width: 120, height: 26 }} /></div>
      <div className="stat-change"><Skeleton className="skel-text" style={{ width: 70 }} /></div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="tab-pane" aria-busy="true" aria-live="polite">
      <header style={{ marginBottom: 28 }}>
        <Skeleton className="skel-title" style={{ width: 220, height: 30 }} />
        <Skeleton className="skel-text" style={{ width: 320, marginTop: 8 }} />
      </header>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {Array.from({ length: 5 }).map((_, i) => <SkeletonStatCard key={i} />)}
      </div>
      <div className="charts-row" style={{ marginTop: 24 }}>
        <Skeleton className="skel-bar" style={{ height: 320 }} />
        <Skeleton className="skel-bar" style={{ height: 320 }} />
      </div>
    </div>
  )
}

export function SkeletonRow({ columns = 6 }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0' }} aria-hidden="true">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="skel-text" style={{ flex: 1, maxWidth: 160 }} />
      ))}
    </div>
  )
}

/* ── Layout primitives ────────────────────────────────────────────── */

export function Card({ children, style, className = '', ...rest }) {
  return <div className={`card ${className}`} style={style} {...rest}>{children}</div>
}

export function Badge({ children, color = '#3b82f6', style }) {
  return (
    <span className="badge" style={{ background: `${color}22`, color, border: `1px solid ${color}44`, ...style }}>
      {children}
    </span>
  )
}

export function SectionHeader({ title, icon, sub, right, style }) {
  return (
    <div className="section-header" style={style}>
      <div>
        <div className="section-title">{icon ? <span>{icon}</span> : null}{title}</div>
        {sub && <div className="section-sub">{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function Button({ children, variant = 'default', size, className = '', style, ...rest }) {
  const v = variant === 'primary' ? 'btn-primary' : variant === 'success' ? 'btn-success' : variant === 'ghost' ? 'btn-ghost' : ''
  const s = size === 'sm' ? 'btn-sm' : ''
  return <button className={`btn ${v} ${s} ${className}`.trim()} style={style} {...rest}>{children}</button>
}

export function IconButton({ children, title, className = '', style, ...rest }) {
  return <button className={`bell-btn ${className}`.trim()} title={title} aria-label={title} style={style} {...rest}>{children}</button>
}

export function ChartEmpty({ icon = '📊', message = 'No data to display' }) {
  return (
    <div className="chart-empty" role="status">
      <div className="ce-icon">{icon}</div>
      <div>{message}</div>
    </div>
  )
}

/* ── Toast system ─────────────────────────────────────────────────── */
/* The imperative `toast()` helper lives in ../lib/toast.js so that this
   file (which exports only components) stays fast-refresh compatible. */

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  useEffect(() => {
    setToastDispatch((t) => {
      const id = ++idRef.current
      setToasts(prev => [...prev, { id, ...t }])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), t.duration || 2800)
    })
    return () => clearToastDispatch()
  }, [])

  return (
    <>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map(t => {
          const icon = t.type === 'success' ? '✓' : t.type === 'error' ? '⚠' : t.type === 'warn' ? '!' : 'i'
          return (
            <div key={t.id} className={`toast show ${t.type === 'success' ? 'success' : t.type === 'error' ? 'error' : ''}`} role="alert">
              <span style={{ fontWeight: 800, color: t.type === 'success' ? '#22c55e' : t.type === 'error' ? '#ef4444' : t.type === 'warn' ? '#eab308' : '#3b82f6' }}>{icon}</span>
              <span>{t.message}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}
