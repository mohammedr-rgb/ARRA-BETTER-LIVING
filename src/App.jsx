import { useState, useEffect, useMemo, useCallback, createContext, useContext } from 'react'

const UserContext = createContext()
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/14riCGmsLkuomzSETNSITLulbWyl7hono2U4NMRowpdI/export?format=csv&gid=1664329820'

function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = []
    let current = ''
    let inQuotes = false
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { vals.push(current.trim()); current = ''; continue }
      current += ch
    }
    vals.push(current.trim())
    if (vals.length < headers.length || vals.every(v => !v)) continue
    const row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] ? vals[idx].replace(/^#REF!$/, '') : '' })
    rows.push(row)
  }
  return rows
}

function ProfileSection() {
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

function num(val) {
  const cleaned = String(val).replace(/[^0-9.\-]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function uniqueByPO(arr) {
  const seen = new Set()
  return arr.filter(r => {
    const po = r['PO Number']
    if (!po || seen.has(po)) return false
    seen.add(po)
    return true
  })
}

function sumByPO(arr, field) {
  const map = {}
  for (const r of arr) {
    const po = r['PO Number']
    if (!po) continue
    map[po] = (map[po] || 0) + num(r[field])
  }
  return Object.values(map).reduce((s, v) => s + v, 0)
}

function useSort() {
  const [sort, setSort] = useState({ key: '', dir: 'asc' })
  const toggle = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }
  return { ...sort, toggle }
}

function SortTh({ label, k, sort, style }) {
  const active = sort.key === k
  return (
    <th onClick={() => sort.toggle(k)} style={{ cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', ...style }}>
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, color: active ? '#3b82f6' : '#475569' }}>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </th>
  )
}

function applySort(rows, sort, accessors) {
  if (!sort.key) return rows
  const getVal = accessors[sort.key]
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = getVal ? getVal(a) : a[sort.key]
    const bv = getVal ? getVal(b) : b[sort.key]
    if (av === bv) return 0
    if (av === null || av === undefined || av === '') return 1
    if (bv === null || bv === undefined || bv === '') return -1
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir
  })
}

function csvEscape(v) {
  const s = String(v ?? '')
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const STATUS_COLORS = {
  Delivered: '#22c55e',
  'In-Transit': '#3b82f6',
  RTO: '#ef4444',
  Pending: '#eab308',
}

const PIE_COLORS = {
  Delivered: '#22c55e',
  'In-Transit': '#3b82f6',
  RTO: '#ef4444',
  Pending: '#eab308',
  Processing: '#a855f7',
  Unknown: '#64748b',
}

function DashboardTab({ data, metrics, cityData, statusData, recentOrders, platformFilter }) {
  const poData = useMemo(() => uniqueByPO(data), [data])
  const [hoverPlatform, setHoverPlatform] = useState(null)
  const [hoverStat, setHoverStat] = useState(null)
  const recentSort = useSort()

  const recentAccessors = {
    po: r => r['PO Number'],
    city: r => r['City'],
    platform: r => r['Platform'],
    product: r => r['Product'],
    qty: r => num(r['PO Qty']),
    tonnage: r => num(r['Tonnage']),
    value: r => num(r['PO Value with Tax']),
    released: r => parseMMDDDate(r['PO Released Date(MM-DD-YYYY)']),
    appt: r => parseMMDDDate(r['Appointment Date(MM-DD-YYYY)']),
    apptid: r => r['Appointment ID'],
    status: r => r['Status'],
  }

  const platformPerf = useMemo(() => {
    const now = new Date()
    const currentMk = now.getFullYear() * 12 + now.getMonth()
    const poData = uniqueByPO(data).filter(r => {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      return d && (d.getFullYear() * 12 + d.getMonth()) === currentMk
    })
    const map = {}
    for (const r of poData) {
      const p = r['Platform'] || 'Unknown'
      if (!map[p]) map[p] = { platform: p, orders: 0, delivered: 0, rto: 0, tonnage: 0, value: 0 }
      map[p].orders++
      map[p].tonnage += num(r['Tonnage'])
      map[p].value += num(r['PO Value with Tax'])
      if (r['Status'] === 'Delivered') map[p].delivered++
      if (r['Status'] === 'RTO') map[p].rto++
    }
    return Object.values(map).sort((a, b) => b.orders - a.orders)
  }, [data])

  const monthData = useMemo(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const map = {}
    data.forEach(r => {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!d) return
      const mk = d.getFullYear() * 12 + d.getMonth()
      if (!map[mk]) map[mk] = { orders: new Set(), poValues: {}, tonnage: 0, boxes: 0, delivered: new Set(), rto: new Set(), cities: new Set(), platforms: {} }
      const cell = map[mk]
      cell.orders.add(r['PO Number'])
      cell.tonnage += num(r['Tonnage'])
      cell.boxes += num(r['Box Count'])
      const po = r['PO Number']
      const pv = num(r['PO Value with Tax'])
      if (po && pv > 0) cell.poValues[po] = pv
      if (r['Status'] === 'Delivered') cell.delivered.add(po)
      if (r['Status'] === 'RTO') cell.rto.add(po)
      if (r['City']) cell.cities.add(r['City'])
      const p = r['Platform'] || 'Unknown'
      if (!cell.platforms[p]) cell.platforms[p] = new Set()
      cell.platforms[p].add(po)
    })
    return Object.entries(map).sort((a, b) => a[0] - b[0]).map(([mk, c]) => {
      const m = mk % 12
      const y = Math.floor(mk / 12)
      const platforms = Object.entries(c.platforms).map(([name, set]) => ({ name, orders: set.size })).sort((a, b) => b.orders - a.orders)
      return {
        key: String(mk),
        label: `${monthNames[m]} ${String(y).slice(2)}`,
        orders: c.orders.size,
        tonnage: Math.round(c.tonnage),
        boxes: Math.round(c.boxes),
        value: Math.round(Object.values(c.poValues).reduce((s, v) => s + v, 0)),
        delivered: c.delivered.size,
        rto: c.rto.size,
        cities: c.cities.size,
        platforms,
        platformLabel: platforms.map(x => `${x.name} (${x.orders})`).join(', '),
        deliveryRate: (c.delivered.size + c.rto.size) ? Math.round(c.delivered.size / (c.delivered.size + c.rto.size) * 100) : null,
      }
    })
  }, [data])

  const last3Months = useMemo(() => monthData.slice(0, 3), [monthData])

  const openMetrics = useMemo(() => {
    const active = data.filter(r => !['Delivered', 'RTO'].includes(r['Status'] || ''))
    const poSet = new Set(active.map(r => r['PO Number']).filter(Boolean))
    const byPO = {}
    for (const r of active) {
      const po = r['PO Number']
      if (!po) continue
      if (!byPO[po]) byPO[po] = { qty: 0, delQty: 0 }
      byPO[po].qty += num(r['PO Qty'])
      byPO[po].delQty += num(r['Delivered QTY'])
    }
    let totalQty = 0
    let totalDel = 0
    for (const k in byPO) {
      totalQty += byPO[k].qty
      totalDel += byPO[k].delQty
    }
    return {
      orders: poSet.size,
      value: active.reduce((s, r) => s + num(r['PO Value with Tax']), 0),
      tonnage: active.reduce((s, r) => s + num(r['Tonnage']), 0),
      boxes: active.reduce((s, r) => s + num(r['Box Count']), 0),
      fillRate: totalQty ? Math.round(totalDel / totalQty * 100) : null,
    }
  }, [data])

  return (
    <>
      <header>
        <div>
          <h1>Sales Dashboard</h1>
          <div className="date">{platformFilter !== 'All' ? `Platform: ${platformFilter} • ` : ''}{metrics.totalOrders} orders across {metrics.cities} cities</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {platformPerf.map(p => {
              const dr = (p.delivered + p.rto) ? (p.delivered / (p.delivered + p.rto) * 100).toFixed(0) : '—'
              return (
              <div key={p.platform} style={{ position: 'relative' }} onMouseEnter={() => setHoverPlatform(p.platform)} onMouseLeave={() => setHoverPlatform(null)}>
                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', cursor: 'default' }}>
                  {p.platform} • {p.orders} • {Math.round(p.tonnage)}KG • {dr}{dr !== '—' ? '%' : ''}
                </span>
                {hoverPlatform === p.platform && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>{p.platform}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Orders: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{p.orders}</span></div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Delivered: <span style={{ color: '#22c55e', fontWeight: 600 }}>{p.delivered}</span></div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>RTO: <span style={{ color: '#ef4444', fontWeight: 600 }}>{p.rto}</span></div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Delivery Rate: <span style={{ color: (p.delivered + p.rto) ? (p.delivered / (p.delivered + p.rto) * 100 >= 80 ? '#22c55e' : '#eab308') : '#94a3b8', fontWeight: 600 }}>{(p.delivered + p.rto) ? (p.delivered / (p.delivered + p.rto) * 100).toFixed(1) + '%' : '—'}</span></div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Tonnage: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{Math.round(p.tonnage)} KG</span></div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Value: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>₹{Math.round(p.value).toLocaleString()}</span></div>
                  </div>
                )}
              </div>
            )})}
          </div>
        </div>
        <ProfileSection />
      </header>

      <div className="stats-grid">
        <div className="stat-card" style={{ position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHoverStat('orders')} onMouseLeave={() => setHoverStat(null)}>
          <div className="stat-header">
            <div className="stat-label">Total Orders</div>
            <div className="stat-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>📋</div>
          </div>
          <div className="stat-value">{metrics.totalOrders}</div>
          <div className="stat-change positive">▲ {metrics.deliveredOrders} delivered</div>
          {hoverStat === 'orders' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Current Open Orders</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Open Orders: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{openMetrics.orders}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Open Value: <span style={{ color: '#22c55e', fontWeight: 600 }}>₹{Math.round(openMetrics.value).toLocaleString()}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Open Tonnage: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{Math.round(openMetrics.tonnage)} KG</span></div>
            </div>
          )}
        </div>
        <div className="stat-card" style={{ position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHoverStat('value')} onMouseLeave={() => setHoverStat(null)}>
          <div className="stat-header">
            <div className="stat-label">PO Value (with Tax)</div>
            <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>💰</div>
          </div>
          <div className="stat-value">₹{metrics.totalValue.toLocaleString()}</div>
          <div className="stat-change positive">▲ Total value</div>
          {hoverStat === 'value' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Current Open PO Value</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Open Value: <span style={{ color: '#22c55e', fontWeight: 600 }}>₹{Math.round(openMetrics.value).toLocaleString()}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Open Tonnage: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{Math.round(openMetrics.tonnage)} KG</span></div>
            </div>
          )}
        </div>
        <div className="stat-card" style={{ position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHoverStat('tonnage')} onMouseLeave={() => setHoverStat(null)}>
          <div className="stat-header">
            <div className="stat-label">Total Tonnage</div>
            <div className="stat-icon" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>⚖️</div>
          </div>
          <div className="stat-value">{metrics.totalTonnage} KG</div>
          <div className="stat-change positive">▲ {metrics.deliveredTonnage} KG delivered</div>
          {hoverStat === 'tonnage' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Current Open Tonnage</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Open Tonnage: <span style={{ color: '#a855f7', fontWeight: 600 }}>{Math.round(openMetrics.tonnage)} KG</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Open Value: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>₹{Math.round(openMetrics.value).toLocaleString()}</span></div>
            </div>
          )}
        </div>
        <div className="stat-card" style={{ position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHoverStat('boxes')} onMouseLeave={() => setHoverStat(null)}>
          <div className="stat-header">
            <div className="stat-label">Box Count</div>
            <div className="stat-icon" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>📦</div>
          </div>
          <div className="stat-value">{metrics.totalBoxes}</div>
          <div className="stat-change positive">▲ Total boxes shipped</div>
          {hoverStat === 'boxes' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Current Open Box Count</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Open Boxes: <span style={{ color: '#eab308', fontWeight: 600 }}>{Math.round(openMetrics.boxes)}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Open Value: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>₹{Math.round(openMetrics.value).toLocaleString()}</span></div>
            </div>
          )}
        </div>
        <div className="stat-card" style={{ position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHoverStat('fillrate')} onMouseLeave={() => setHoverStat(null)}>
          <div className="stat-header">
            <div className="stat-label">Fill Rate</div>
            <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}>🎯</div>
          </div>
          <div className="stat-value" style={{ color: metrics.avgFillRate >= 80 ? '#22c55e' : metrics.avgFillRate >= 50 ? '#eab308' : '#ef4444' }}>{metrics.avgFillRate}%</div>
          <div className="stat-change" style={{ color: '#94a3b8' }}>Average fill rate</div>
          {hoverStat === 'fillrate' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Current Open Fill Rate</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Open Fill Rate: <span style={{ color: '#6366f1', fontWeight: 600 }}>{openMetrics.fillRate !== null ? openMetrics.fillRate + '%' : '—'}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Open Orders: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{openMetrics.orders}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Open Tonnage: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{Math.round(openMetrics.tonnage)} KG</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Orders by City</div>
            <div className="chart-period">All time</div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="city" stroke="#64748b" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={80} interval={0} />
                <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload
                    return (
                      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                        <div style={{ fontWeight: 600, marginBottom: 8, color: '#f1f5f9' }}>{row.city}</div>
                        <div style={{ color: '#94a3b8' }}>Orders: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{row.orders}</span></div>
                        <div style={{ color: '#94a3b8' }}>Delivered: <span style={{ color: '#22c55e', fontWeight: 600 }}>{row.delivered}</span></div>
                        <div style={{ color: '#94a3b8' }}>Tonnage: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{Math.round(row.tonnage)} KG</span></div>
                        <div style={{ color: '#94a3b8' }}>Delivered Tonnage: <span style={{ color: '#22c55e', fontWeight: 600 }}>{Math.round(row.deliveredTonnage)} KG</span></div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="orders" fill="#3b82f6" radius={[6, 6, 0, 0]} name="orders" />
              </BarChart>
            </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Order Status</div>
            <div className="chart-period">Distribution</div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={60}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine
                >
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={PIE_COLORS[entry.name] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
                  formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
                />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

        <div className="recent-orders" style={{ marginTop: 20, overflowX: 'auto' }}>
        <div className="orders-header">
          <div className="orders-title">Month-wise Overview</div>
          <div className="chart-period">Last 3 months • Monthly sales performance</div>
          <button onClick={() => {
            const rows = ['Month-wise Overview']
            rows.push('')
            rows.push('Month,Platforms,Orders,Tonnage KG,Boxes,Value,Delivered,RTO,Delivery Rate %')
            last3Months.forEach(r => {
              rows.push(`${csvEscape(r.label)},${csvEscape(r.platformLabel)},${r.orders},${r.tonnage},${r.boxes},${r.value},${r.delivered},${r.rto},${r.deliveryRate === null ? '' : r.deliveryRate}`)
            })
            const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = 'monthly_overview.csv'; a.click()
            URL.revokeObjectURL(url)
          }} style={{ background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            ⬇ Download CSV
          </button>
        </div>
        {last3Months.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={last3Months}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload
                  return (
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: '#f1f5f9' }}>{row.label}</div>
                      <div style={{ color: '#94a3b8' }}>Platforms: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{row.platformLabel}</span></div>
                      <div style={{ color: '#94a3b8' }}>Orders: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{row.orders}</span></div>
                      <div style={{ color: '#94a3b8' }}>Tonnage: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{row.tonnage} KG</span></div>
                      <div style={{ color: '#94a3b8' }}>Value: <span style={{ color: '#22c55e', fontWeight: 600 }}>₹{row.value.toLocaleString()}</span></div>
                      <div style={{ color: '#94a3b8' }}>Delivered: <span style={{ color: '#22c55e', fontWeight: 600 }}>{row.delivered}</span></div>
                      <div style={{ color: '#94a3b8' }}>RTO: <span style={{ color: '#ef4444', fontWeight: 600 }}>{row.rto}</span></div>
                      <div style={{ color: '#94a3b8' }}>Delivery Rate: <span style={{ color: row.deliveryRate !== null && row.deliveryRate >= 80 ? '#22c55e' : '#eab308', fontWeight: 600 }}>{row.deliveryRate !== null ? row.deliveryRate + '%' : '—'}</span></div>
                    </div>
                  )
                }}
              />
              <Bar dataKey="tonnage" fill="#3b82f6" radius={[6, 6, 0, 0]} name="tonnage" />
            </BarChart>
          </ResponsiveContainer>
        )}
        <table style={{ marginTop: 16, minWidth: 480 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', width: 150 }}>Metric</th>
              {last3Months.map(m => (
                <th key={m.label} style={{ textAlign: 'center', fontSize: 14 }}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ color: '#94a3b8' }}>Orders</td>
              {last3Months.map(m => <td key={m.label} style={{ textAlign: 'center', fontWeight: 600 }}>{m.orders}</td>)}
            </tr>
            <tr>
              <td style={{ color: '#94a3b8' }}>Tonnage (KG)</td>
              {last3Months.map(m => <td key={m.label} style={{ textAlign: 'center', fontWeight: 600 }}>{m.tonnage.toLocaleString()}</td>)}
            </tr>
            <tr>
              <td style={{ color: '#94a3b8' }}>Boxes</td>
              {last3Months.map(m => <td key={m.label} style={{ textAlign: 'center', fontWeight: 600 }}>{m.boxes}</td>)}
            </tr>
            <tr>
              <td style={{ color: '#94a3b8' }}>Value</td>
              {last3Months.map(m => <td key={m.label} style={{ textAlign: 'center', fontWeight: 600 }}>₹{m.value.toLocaleString()}</td>)}
            </tr>
            <tr>
              <td style={{ color: '#94a3b8' }}>Delivered</td>
              {last3Months.map(m => <td key={m.label} style={{ textAlign: 'center', fontWeight: 600, color: '#22c55e' }}>{m.delivered}</td>)}
            </tr>
            <tr>
              <td style={{ color: '#94a3b8' }}>RTO</td>
              {last3Months.map(m => <td key={m.label} style={{ textAlign: 'center', fontWeight: 600, color: '#ef4444' }}>{m.rto}</td>)}
            </tr>
            <tr>
              <td style={{ color: '#94a3b8' }}>Delivery Rate</td>
              {last3Months.map(m => (
                <td key={m.label} style={{ textAlign: 'center', fontWeight: 600, color: m.deliveryRate !== null ? (m.deliveryRate >= 80 ? '#22c55e' : '#eab308') : '#64748b' }}>
                  {m.deliveryRate !== null ? m.deliveryRate + '%' : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ color: '#94a3b8', verticalAlign: 'top' }}>Platforms</td>
              {last3Months.map(m => (
                <td key={m.label} style={{ textAlign: 'center', fontSize: 12, padding: '8px 6px' }}>
                  {m.platforms.map((x, j) => (
                    <span key={x.name} style={{ display: 'block' }}>
                      <span style={{ color: '#3b82f6', fontWeight: 600 }}>{x.name}</span> ({x.orders})
                    </span>
                  ))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

        <div className="recent-orders" style={{ overflowX: 'auto' }}>
        <div className="orders-header">
          <div className="orders-title">Recent PO Releases</div>
          <div className="chart-period">Latest 10 releases</div>
        </div>
        <table style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <SortTh label="PO #" k="po" sort={recentSort} />
              <SortTh label="City" k="city" sort={recentSort} />
              <SortTh label="Platform" k="platform" sort={recentSort} />
              <SortTh label="Product" k="product" sort={recentSort} />
              <SortTh label="Qty" k="qty" sort={recentSort} />
              <SortTh label="Tonnage" k="tonnage" sort={recentSort} />
              <SortTh label="Value" k="value" sort={recentSort} />
              <SortTh label="Released Date" k="released" sort={recentSort} />
              <SortTh label="Appt Date" k="appt" sort={recentSort} />
              <SortTh label="Appt ID" k="apptid" sort={recentSort} />
              <SortTh label="Status" k="status" sort={recentSort} />
            </tr>
          </thead>
          <tbody>
            {applySort(recentOrders, recentSort, recentAccessors).map((row, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row['PO Number']}</td>
                <td>{row['City']}</td>
                <td>{row['Platform']}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row['Product']}</td>
                <td>{row['PO Qty']}</td>
                <td>{row['Tonnage']}</td>
                <td>₹{num(row['PO Value with Tax']).toLocaleString()}</td>
                <td style={{ fontSize: 12, color: '#94a3b8' }}>{row['PO Released Date(MM-DD-YYYY)']}</td>
                <td style={{ fontSize: 12, color: '#94a3b8' }}>{row['Appointment Date(MM-DD-YYYY)'] || '—'}</td>
                <td style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>{row['Appointment ID'] || '—'}</td>
                <td>
                  <span className={`status ${(row['Status'] || '').toLowerCase().replace(/\s+/g, '')}`}>
                    {row['Status'] || 'N/A'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function DispatchTab({ data, rawCSV }) {
  const poData = useMemo(() => uniqueByPO(data), [data])
  const [hoverStat, setHoverStat] = useState(null)
  const [dispatchFilters, setDispatchFilters] = useState(new Set())
  const pendingSort = useSort()

  const pendingAccessors = {
    po: r => r['PO Number'],
    city: r => r['City'],
    platform: r => r['Platform'],
    product: r => r['Product'],
    qty: r => num(r['PO Qty']),
    tonnage: r => num(r['Tonnage']),
    box: r => num(r['Box Count']),
    mrp: r => num(r['MRP']),
    cost: r => num(r['Unit Cost']),
    appt: r => r['Appointment Date(MM-DD-YYYY)'] || r['Status'],
  }

  const pendingData = useMemo(() => {
    const statuses = new Set(['Pending for Dispatch', 'Pending for Schedule'])
    const seen = new Set()
    return data.filter(r => {
      if (!statuses.has(r['Status'])) return false
      const key = r['PO Number'] + '|' + r['Product']
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [data])

  const pendingPlatformData = useMemo(() => {
    const map = {}
    for (const r of pendingData) {
      const p = r['Platform'] || 'Unknown'
      if (!map[p]) map[p] = { platform: p, pos: new Set() }
      map[p].pos.add(r['PO Number'])
    }
    return Object.values(map).map(x => ({ platform: x.platform, pos: x.pos.size })).sort((a, b) => b.pos - a.pos)
  }, [pendingData])

  const dispatchMetrics = useMemo(() => {
    const dispatched = poData.filter(r => ['Pending for Dispatch', 'Pending for Schedule'].includes(r['Status'] || ''))
    const allDispatched = data.filter(r => ['Pending for Dispatch', 'Pending for Schedule'].includes(r['Status'] || ''))
    const byPlatform = {}
    const byCity = {}
    for (const r of allDispatched) {
      const p = r['Platform'] || 'Unknown'
      const c = r['City'] || 'Unknown'
      if (!byPlatform[p]) byPlatform[p] = { boxes: 0, tonnage: 0 }
      byPlatform[p].boxes += num(r['Box Count'])
      byPlatform[p].tonnage += num(r['Tonnage'])
      if (!byCity[c]) byCity[c] = { platforms: {} }
      if (!byCity[c].platforms[p]) byCity[c].platforms[p] = { boxes: 0, tonnage: 0 }
      byCity[c].platforms[p].boxes += num(r['Box Count'])
      byCity[c].platforms[p].tonnage += num(r['Tonnage'])
    }
    const fmt = (obj) => Object.entries(obj).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.tonnage - a.tonnage)
    return {
      openDispatches: dispatched.length,
      openLines: allDispatched.length,
      openTonnage: dispatched.reduce((s, r) => s + num(r['Tonnage']), 0),
      openCharge: dispatched.reduce((s, r) => s + num(r['Transport Charges']), 0),
      byPlatform: fmt(byPlatform),
      byCity: fmt(byCity),
    }
  }, [poData, data])

  const toggleDispatchFilter = (name) => {
    setDispatchFilters(prev => {
      const all = new Set(dispatchMetrics.byPlatform.map(p => p.name))
      if (prev.has(name)) {
        const next = new Set(prev)
        next.delete(name)
        return next
      }
      const next = new Set(prev)
      next.add(name)
      if (next.size === all.size) return new Set()
      return next
    })
  }

  const filteredCityData = useMemo(() => {
    if (!dispatchFilters.size) return dispatchMetrics.byCity
    return dispatchMetrics.byCity.map(c => {
      const t = Object.entries(c.platforms)
        .filter(([p]) => dispatchFilters.has(p))
        .reduce((s, [, v]) => ({ boxes: s.boxes + v.boxes, tonnage: s.tonnage + v.tonnage }), { boxes: 0, tonnage: 0 })
      return { name: c.name, ...t }
    }).filter(x => x.boxes > 0 || x.tonnage > 0).sort((a, b) => b.tonnage - a.tonnage)
  }, [dispatchMetrics, dispatchFilters])

  return (
    <>
      <header>
        <div>
          <h1>Dispatch Overview</h1>
          <div className="date">{dispatchMetrics.openDispatches} pending POs • {pendingData.length} product lines</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => {
            const statuses = new Set(['Pending for Dispatch', 'Pending for Schedule'])
            const filtered = data.filter(r => statuses.has(r['Status']))
            if (!filtered.length) return
            const cols = [
              ['City', 'City'],
              ['Platform', 'Platform'],
              ['PO Number', 'PO Number'],
              ['Product', 'Product'],
              ['PO Qty', 'QTY'],
              ['Tonnage', 'Tonnage'],
              ['Box Count', 'Box Count'],
              ['MRP', 'MRP'],
              ['Expiry Date(MM-DD-YYYY)', 'PO Expiry Date'],
              ['Appointment Date(MM-DD-YYYY)', 'Appointment Date'],
              ['PO Released Date(MM-DD-YYYY)', 'PO Released Date'],
            ]
            const header = cols.map(c => c[1]).join(',')
            const body = filtered.map(r => cols.map(([k]) => {
              const v = r[k] || ''
              return /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
            }).join(',')).join('\n')
            const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = 'pending_dispatch_schedule.csv'; a.click()
            URL.revokeObjectURL(url)
          }} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⬇ Download Pending Data
          </button>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card" style={{ position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHoverStat('dispatches')} onMouseLeave={() => setHoverStat(null)}>
          <div className="stat-header">
            <div className="stat-label">Open Dispatches</div>
            <div className="stat-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>🚚</div>
          </div>
          <div className="stat-value">{dispatchMetrics.openDispatches}</div>
          <div className="stat-change">Pending POs</div>
          {hoverStat === 'dispatches' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 9999, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Dispatch Summary</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Unique POs: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{dispatchMetrics.openDispatches}</span> • Total Lines: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{dispatchMetrics.openLines}</span></div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                {dispatchMetrics.byPlatform.map(p => {
                  const checked = !dispatchFilters.size || dispatchFilters.has(p.name)
                  return (
                    <label key={p.name} style={{ fontSize: 12, color: checked ? '#3b82f6' : '#64748b', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontWeight: 600 }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleDispatchFilter(p.name)} style={{ cursor: 'pointer' }} />
                      {p.name}
                    </label>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600, marginBottom: 4 }}>Platform-wise</div>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '2px 14px 4px 0', color: '#64748b', fontWeight: 600 }}>Platform</th>
                        <th style={{ textAlign: 'right', padding: '2px 0 4px 14px', color: '#64748b', fontWeight: 600 }}>Boxes</th>
                        <th style={{ textAlign: 'right', padding: '2px 0 4px 14px', color: '#64748b', fontWeight: 600 }}>KG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatchMetrics.byPlatform.filter(p => !dispatchFilters.size || dispatchFilters.has(p.name)).map(p => (
                        <tr key={p.name}>
                          <td style={{ padding: '3px 14px 3px 0', color: '#94a3b8' }}>{p.name}</td>
                          <td style={{ textAlign: 'right', padding: '3px 0 3px 14px', color: '#f1f5f9', fontWeight: 600 }}>{Math.round(p.boxes).toLocaleString()}</td>
                          <td style={{ textAlign: 'right', padding: '3px 0 3px 14px', color: '#f1f5f9', fontWeight: 600 }}>{Math.round(p.tonnage).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#a855f7', fontWeight: 600, marginBottom: 4 }}>City-wise</div>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '2px 14px 4px 0', color: '#64748b', fontWeight: 600 }}>City</th>
                        <th style={{ textAlign: 'right', padding: '2px 0 4px 14px', color: '#64748b', fontWeight: 600 }}>Boxes</th>
                        <th style={{ textAlign: 'right', padding: '2px 0 4px 14px', color: '#64748b', fontWeight: 600 }}>KG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCityData.map(c => (
                        <tr key={c.name}>
                          <td style={{ padding: '3px 14px 3px 0', color: '#94a3b8' }}>{c.name}</td>
                          <td style={{ textAlign: 'right', padding: '3px 0 3px 14px', color: '#f1f5f9', fontWeight: 600 }}>{Math.round(c.boxes).toLocaleString()}</td>
                          <td style={{ textAlign: 'right', padding: '3px 0 3px 14px', color: '#f1f5f9', fontWeight: 600 }}>{Math.round(c.tonnage).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="stat-card" style={{ position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHoverStat('tonnage')} onMouseLeave={() => setHoverStat(null)}>
          <div className="stat-header">
            <div className="stat-label">Dispatch Tonnage</div>
            <div className="stat-icon" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>⚖️</div>
          </div>
          <div className="stat-value">{Math.round(dispatchMetrics.openTonnage).toLocaleString()} KG</div>
          <div className="stat-change">Open tonnage in transit</div>
          {hoverStat === 'tonnage' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Tonnage Details</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Unique POs: <span style={{ color: '#a855f7', fontWeight: 600 }}>{dispatchMetrics.openDispatches}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Open Tonnage: <span style={{ color: '#a855f7', fontWeight: 600 }}>{Math.round(dispatchMetrics.openTonnage).toLocaleString()} KG</span></div>
            </div>
          )}
        </div>
        <div className="stat-card" style={{ position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHoverStat('charge')} onMouseLeave={() => setHoverStat(null)}>
          <div className="stat-header">
            <div className="stat-label">Transport Charges</div>
            <div className="stat-icon" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>💰</div>
          </div>
          <div className="stat-value">₹{Math.round(dispatchMetrics.openCharge).toLocaleString()}</div>
          <div className="stat-change">Open dispatch transport cost</div>
          {hoverStat === 'charge' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Cost Details</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Total Transport Cost: <span style={{ color: '#eab308', fontWeight: 600 }}>₹{Math.round(dispatchMetrics.openCharge).toLocaleString()}</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="recent-orders">
        <div className="orders-header">
          <div className="orders-title">Pending for Dispatch / Schedule</div>
          <div className="chart-period">{dispatchMetrics.openDispatches} POs</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {pendingPlatformData.map(p => (
            <span key={p.platform} style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', whiteSpace: 'nowrap' }}>
              {p.platform} • {p.pos} POs
            </span>
          ))}
        </div>
        <table>
          <thead>
            <tr>
              <SortTh label="PO #" k="po" sort={pendingSort} />
              <SortTh label="City" k="city" sort={pendingSort} />
              <SortTh label="Platform" k="platform" sort={pendingSort} />
              <SortTh label="Product" k="product" sort={pendingSort} />
              <SortTh label="PO Qty" k="qty" sort={pendingSort} />
              <SortTh label="Tonnage" k="tonnage" sort={pendingSort} />
              <SortTh label="Box" k="box" sort={pendingSort} />
              <SortTh label="MRP" k="mrp" sort={pendingSort} />
              <SortTh label="Unit Cost" k="cost" sort={pendingSort} />
              <SortTh label="Appointment / Status" k="appt" sort={pendingSort} />
            </tr>
          </thead>
          <tbody>
            {pendingData.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#64748b', padding: 20, fontSize: 13 }}>No pending records</td></tr>
            ) : applySort(pendingData, pendingSort, pendingAccessors).map((r, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r['PO Number']}</td>
                <td>{r['City']}</td>
                <td>{r['Platform']}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['Product']}</td>
                <td style={{ textAlign: 'right' }}>{r['PO Qty']}</td>
                <td style={{ textAlign: 'right' }}>{r['Tonnage']}</td>
                <td style={{ textAlign: 'right' }}>{r['Box Count']}</td>
                <td style={{ textAlign: 'right' }}>{r['MRP'] || '—'}</td>
                <td style={{ textAlign: 'right' }}>{r['Unit Cost'] || '—'}</td>
                <td style={{ fontSize: 12, color: '#94a3b8' }}>{r['Appointment Date(MM-DD-YYYY)'] ? r['Appointment Date(MM-DD-YYYY)'] : <span style={{ color: '#eab308' }}>{r['Status']}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function FinanceTab({ data }) {
  const poData = useMemo(() => uniqueByPO(data), [data])
  const [hoverStat, setHoverStat] = useState(null)
  const poSort = useSort()

  const poAccessors = {
    po: r => r['PO Number'],
    entity: r => r['Entity'],
    invoice: r => r['Invoice No'],
    value: r => num(r['PO Value with Tax']),
    dn: r => num(r['DN amount']),
    fs: r => num(r['Final Settlement']),
    overdue: r => r['Payment Overdue Alert'],
  }

  const financeMetrics = useMemo(() => {
    let totalPOValue = 0, totalDN = 0, totalFS = 0, overdueCount = 0, invoiceCount = 0
    const overduePOs = []
    const entityMap = {}
    for (const r of poData) {
      const val = num(r['PO Value with Tax'])
      const dn = num(r['DN amount'])
      const fs = num(r['Final Settlement'])
      const overdue = r['Payment Overdue Alert'] || ''
      totalPOValue += val
      totalDN += dn
      totalFS += fs
      if (overdue.toLowerCase().includes('overdue') || overdue.toLowerCase().includes('yes')) {
        overdueCount++
        overduePOs.push(r['PO Number'])
      }
      if (r['Invoice No']) invoiceCount++
      const e = r['Entity'] || 'Unknown'
      if (!entityMap[e]) entityMap[e] = { entity: e, orders: 0, poValue: 0, dn: 0, fs: 0, invoices: 0, overdueCount: 0 }
      entityMap[e].orders++
      entityMap[e].poValue += val
      entityMap[e].dn += dn
      entityMap[e].fs += fs
      if (r['Invoice No']) entityMap[e].invoices++
      if (overdue.toLowerCase().includes('overdue') || overdue.toLowerCase().includes('yes')) {
        entityMap[e].overdueCount++
      }
    }
    const avgOrderValue = totalPOValue / (poData.length || 1)
    const pendingSettlement = totalDN - totalFS
    return {
      totalPOValue: Math.round(totalPOValue),
      avgOrderValue: Math.round(avgOrderValue),
      totalDN: Math.round(totalDN),
      totalFS: Math.round(totalFS),
      pendingSettlement: Math.round(pendingSettlement),
      overdueCount,
      overduePOs,
      invoiceCount,
      totalOrders: poData.length,
      entityWise: Object.values(entityMap).sort((a, b) => b.poValue - a.poValue),
    }
  }, [poData])

  return (
    <>
      <header>
        <div>
          <h1>Finance Overview</h1>
          <div className="date">{financeMetrics.totalOrders} POs • Credit period 30 days • {financeMetrics.entityWise.length} entities</div>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card" style={{ position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHoverStat('poValue')} onMouseLeave={() => setHoverStat(null)}>
          <div className="stat-header">
            <div className="stat-label">Total PO Value</div>
            <div className="stat-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>💰</div>
          </div>
          <div className="stat-value">₹{financeMetrics.totalPOValue.toLocaleString()}</div>
          <div className="stat-change positive">▲ PO Value with Tax</div>
          {hoverStat === 'poValue' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>PO Value Summary</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Total: <span style={{ color: '#3b82f6', fontWeight: 600 }}>₹{financeMetrics.totalPOValue.toLocaleString()}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Avg per PO: <span style={{ color: '#22c55e', fontWeight: 600 }}>₹{financeMetrics.avgOrderValue.toLocaleString()}</span></div>
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">Avg Order Value</div>
            <div className="stat-icon" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>📊</div>
          </div>
          <div className="stat-value">₹{financeMetrics.avgOrderValue.toLocaleString()}</div>
          <div className="stat-change">Average PO value</div>
        </div>
        <div className="stat-card" style={{ position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHoverStat('pending')} onMouseLeave={() => setHoverStat(null)}>
          <div className="stat-header">
            <div className="stat-label">Pending Settlement</div>
            <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>📋</div>
          </div>
          <div className="stat-value" style={{ color: financeMetrics.pendingSettlement > 0 ? '#ef4444' : '#22c55e' }}>₹{financeMetrics.pendingSettlement.toLocaleString()}</div>
          <div className="stat-change">DN − Final Settlement</div>
          {hoverStat === 'pending' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Settlement Details</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>DN Amount: <span style={{ color: '#3b82f6', fontWeight: 600 }}>₹{financeMetrics.totalDN.toLocaleString()}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Final Settlement: <span style={{ color: '#22c55e', fontWeight: 600 }}>₹{financeMetrics.totalFS.toLocaleString()}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Pending: <span style={{ color: financeMetrics.pendingSettlement > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>₹{financeMetrics.pendingSettlement.toLocaleString()}</span></div>
            </div>
          )}
        </div>
        <div className="stat-card" style={{ position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHoverStat('overdue')} onMouseLeave={() => setHoverStat(null)}>
          <div className="stat-header">
            <div className="stat-label">Payment Overdue</div>
            <div className="stat-icon" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>🔴</div>
          </div>
          <div className="stat-value" style={{ color: financeMetrics.overdueCount > 0 ? '#ef4444' : '#22c55e' }}>{financeMetrics.overdueCount}</div>
          <div className="stat-change">{financeMetrics.overdueCount > 0 ? 'POs with overdue alerts' : 'No overdue'}</div>
          {hoverStat === 'overdue' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Overdue POs</div>
              {financeMetrics.overduePOs.length === 0 ? <div style={{ fontSize: 12, color: '#94a3b8' }}>None</div> : financeMetrics.overduePOs.slice(0, 10).map(po => (
                <div key={po} style={{ fontSize: 11, fontFamily: 'monospace', color: '#ef4444' }}>{po}</div>
              ))}
              {financeMetrics.overduePOs.length > 10 && <div style={{ fontSize: 11, color: '#94a3b8' }}>...and {financeMetrics.overduePOs.length - 10} more</div>}
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">Invoices Issued</div>
            <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>📄</div>
          </div>
          <div className="stat-value">{financeMetrics.invoiceCount}</div>
          <div className="stat-change">Of {financeMetrics.totalOrders} POs</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">Credit Period</div>
            <div className="stat-icon" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>📅</div>
          </div>
          <div className="stat-value">30 Days</div>
          <div className="stat-change">Standard credit terms</div>
        </div>
      </div>

      <div className="recent-orders">
        <div className="orders-header">
          <div className="orders-title">Entity-wise Finance Summary</div>
          <div className="chart-period">{financeMetrics.entityWise.length} entities</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Orders</th>
              <th>Invoices</th>
              <th>PO Value</th>
              <th>DN Amount</th>
              <th>Final Settlement</th>
              <th>Overdue</th>
            </tr>
          </thead>
          <tbody>
            {financeMetrics.entityWise.map((row, i) => {
              return (
              <tr key={i}>
                <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{row.entity}</td>
                <td>{row.orders}</td>
                <td>{row.invoices}</td>
                <td style={{ textAlign: 'right' }}>₹{Math.round(row.poValue).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>₹{Math.round(row.dn).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>₹{Math.round(row.fs).toLocaleString()}</td>
                <td><span style={{ color: row.overdueCount > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{row.overdueCount}</span></td>
              </tr>
            )
            })}
          </tbody>
        </table>
      </div>

      <div className="recent-orders">
        <div className="orders-header">
          <div className="orders-title">PO-wise DN & Settlement Details</div>
          <div className="chart-period">All POs</div>
        </div>
        <table>
          <thead>
            <tr>
              <SortTh label="PO #" k="po" sort={poSort} />
              <SortTh label="Entity" k="entity" sort={poSort} />
              <SortTh label="Invoice" k="invoice" sort={poSort} />
              <SortTh label="PO Value" k="value" sort={poSort} />
              <SortTh label="DN Amount" k="dn" sort={poSort} />
              <SortTh label="Final Settlement" k="fs" sort={poSort} />
              <SortTh label="Overdue Alert" k="overdue" sort={poSort} />
            </tr>
          </thead>
          <tbody>
            {applySort(poData, poSort, poAccessors).map((r, i) => {
              const dn = num(r['DN amount'])
              const fs = num(r['Final Settlement'])
              return (
              <tr key={i}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r['PO Number']}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['Entity']}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r['Invoice No'] || '—'}</td>
                <td style={{ textAlign: 'right' }}>₹{num(r['PO Value with Tax']).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{dn ? `₹${dn.toLocaleString()}` : '—'}</td>
                <td style={{ textAlign: 'right' }}>{fs ? `₹${fs.toLocaleString()}` : '—'}</td>
                <td><span style={{ color: (r['Payment Overdue Alert'] || '').toLowerCase().includes('overdue') ? '#ef4444' : '#64748b', fontSize: 12 }}>{r['Payment Overdue Alert'] || '—'}</span></td>
              </tr>
            )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function parseDate(str) {
  if (!str) return null
  const parts = str.split('-')
  if (parts.length !== 3) return null
  const a = parseInt(parts[0], 10)
  const b = parseInt(parts[1], 10)
  const year = parseInt(parts[2], 10)
  let day, month
  if (b >= 1 && b <= 12) {
    day = a
    month = b - 1
  } else {
    day = b
    month = a - 1
  }
  return new Date(year, month, day)
}

function parseMMDDDate(str) {
  if (!str) return null
  const parts = str.split('-')
  if (parts.length !== 3) return null
  return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10))
}

function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}-${dd}-${yyyy}`
}

const statusFilters = ['All', 'Active', 'Delivered', 'RTO']

function OrdersTab({ data, platformFilter }) {
  const poData = useMemo(() => uniqueByPO(data), [data])
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
  const [dateFrom, setDateFrom] = useState(formatDate(thirtyDaysAgo))
  const [dateTo, setDateTo] = useState(formatDate(today))
  const [statusFilter, setStatusFilter] = useState('Active')
  const [hoverFilter, setHoverFilter] = useState(null)

  const statusSummary = useMemo(() => {
    const result = {}
    statusFilters.forEach(f => {
      const poSet = new Set()
      let items
      if (f === 'All') items = poData
      else if (f === 'Active') items = poData.filter(r => ['In-Transit', 'Pending', 'Processing'].includes(r['Status'] || ''))
      else items = poData.filter(r => (r['Status'] || '') === f)
      items.forEach(r => poSet.add(r['PO Number']))
      const matchingRows = data.filter(r => poSet.has(r['PO Number']))
      const withinRange = matchingRows.filter(r => {
        const d = parseDate(r['DATE(MM-DD-YYYY)'])
        if (!d) return false
        if (d < parseDate(dateFrom) || d > parseDate(dateTo)) return false
        if (platformFilter !== 'All' && r['Platform'] !== platformFilter) return false
        return true
      })
      result[f] = {
        orders: new Set(withinRange.map(r => r['PO Number'])).size,
        value: sumByPO(withinRange, 'PO Value with Tax'),
        tonnage: sumByPO(withinRange, 'Tonnage'),
      }
    })
    return result
  }, [data, poData, dateFrom, dateTo, platformFilter])

  const filteredData = useMemo(() => {
    const poSet = new Set()
    const base = poData.filter(r => {
      const s = r['Status'] || ''
      if (statusFilter === 'All') return true
      if (statusFilter === 'Active') return ['In-Transit', 'Pending', 'Processing'].includes(s)
      return s === statusFilter
    })
    base.forEach(r => poSet.add(r['PO Number']))
    const matchingRows = data.filter(r => poSet.has(r['PO Number']))
    return matchingRows.filter(r => {
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      if (!d) return false
      if (d < parseDate(dateFrom) || d > parseDate(dateTo)) return false
      if (platformFilter !== 'All' && r['Platform'] !== platformFilter) return false
      return true
    })
  }, [data, poData, statusFilter, dateFrom, dateTo, platformFilter])

  const citySummary = useMemo(() => {
    const map = {}
    const cityPOs = {}
    for (const r of filteredData) {
      const c = r['City']; if (!c) continue
      if (!map[c]) { map[c] = { city: c, orders: new Set(), value: 0, tonnage: 0 } }
      map[c].orders.add(r['PO Number'])
      map[c].value += num(r['PO Value with Tax'])
      map[c].tonnage += num(r['Tonnage'])
    }
    return Object.values(map).map(x => ({ ...x, orders: x.orders.size })).sort((a, b) => b.orders - a.orders)
  }, [filteredData])

  const summaryTotals = useMemo(() => ({
    orders: citySummary.reduce((s, c) => s + c.orders, 0),
    value: citySummary.reduce((s, c) => s + c.value, 0),
    tonnage: citySummary.reduce((s, c) => s + c.tonnage, 0),
  }), [citySummary])

  return (
    <>
      <header>
        <div>
          <h1>Orders</h1>
          <div className="date">{platformFilter !== 'All' ? `Platform: ${platformFilter} • ` : ''}{uniqueByPO(data).length} total orders (unique POs)</div>
        </div>
        <ProfileSection />
      </header>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: '1 1 200px' }}>
          <div className="stat-header">
            <div className="stat-label">Total PO Value (with Tax)</div>
            <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>💰</div>
          </div>
          <div className="stat-value">₹{Math.round(summaryTotals.value).toLocaleString()}</div>
          <div className="stat-change positive">{summaryTotals.orders} orders • {Math.round(summaryTotals.tonnage)} KG</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
          {statusFilters.map(s => (
            <div key={s} style={{ position: 'relative' }} onMouseEnter={() => setHoverFilter(s)} onMouseLeave={() => setHoverFilter(null)}>
              <button onClick={() => setStatusFilter(s)} style={{ background: statusFilter === s ? '#3b82f6' : '#1e293b', border: '1px solid ' + (statusFilter === s ? '#3b82f6' : '#334155'), borderRadius: 8, color: '#f1f5f9', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {s}
              </button>
              {hoverFilter === s && (
                <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '12px 16px', zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>{s} Orders</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{statusSummary[s].orders} orders</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>₹{Math.round(statusSummary[s].value).toLocaleString()}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{Math.round(statusSummary[s].tonnage)} KG</div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginLeft: 'auto' }}>
          <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>From</label>
          <input type="date" value={(() => { const p = dateFrom.split('-'); return `${p[2]}-${p[0]}-${p[1]}` })()} onChange={e => { const p = e.target.value.split('-'); setDateFrom(`${p[1]}-${p[2]}-${p[0]}`) }} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13 }} />
          <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>To</label>
          <input type="date" value={(() => { const p = dateTo.split('-'); return `${p[2]}-${p[0]}-${p[1]}` })()} onChange={e => { const p = e.target.value.split('-'); setDateTo(`${p[1]}-${p[2]}-${p[0]}`) }} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13 }} />
        </div>
      </div>

      <div className="recent-orders" style={{ marginTop: 0 }}>
        <div className="orders-header">
          <div className="orders-title">City-wise {statusFilter} Orders</div>
          <div className="chart-period">{dateFrom} to {dateTo}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>City</th>
              <th>Orders</th>
              <th>Share</th>
              <th>Value</th>
              <th>Tonnage</th>
            </tr>
          </thead>
          <tbody>
            {citySummary.map((row, i) => {
              const share = summaryTotals.orders ? (row.orders / summaryTotals.orders * 100).toFixed(1) : 0
              return (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.city}</td>
                <td>{row.orders}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, maxWidth: 80, height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${share}%`, height: '100%', background: '#3b82f6', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{share}%</span>
                  </div>
                </td>
                <td>₹{Math.round(row.value).toLocaleString()}</td>
                <td>{Math.round(row.tonnage)} KG</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AppointmentView data={data} />
    </>
  )
}

function AppointmentView({ data }) {
  const today = new Date()
  const todayStr = formatDate(today)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const tomorrowStr = formatDate(tomorrow)
  const weekEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)
  const todaySort = useSort()
  const tomorrowSort = useSort()
  const weekSort = useSort()

  const apptAccessors = {
    po: r => r['PO Number'],
    city: r => r['City'],
    platform: r => r['Platform'],
    facility: r => r['FacilityName'],
    transporter: r => r['Transporter'],
    tonnage: r => num(r._tonnage),
    apptdate: r => parseMMDDDate(r['Appointment Date(MM-DD-YYYY)']),
    apptid: r => r['Appointment ID'],
    status: r => r['Status'],
    remarks: r => r['Remarks'],
  }

  const byAppt = useMemo(() => {
    const tMap = new Map(); const tmMap = new Map(); const wMap = new Map()
    data.forEach(r => {
      const d = parseMMDDDate(r['Appointment Date(MM-DD-YYYY)'])
      if (!d) return
      const po = r['PO Number']
      const ton = num(r['Tonnage'])
      const ds = formatDate(d)
      if (ds === todayStr) {
        if (!tMap.has(po)) tMap.set(po, { ...r, _tonnage: 0 })
        tMap.get(po)._tonnage += ton
      } else if (ds === tomorrowStr) {
        if (!tmMap.has(po)) tmMap.set(po, { ...r, _tonnage: 0 })
        tmMap.get(po)._tonnage += ton
      } else if (d >= today && d <= weekEnd) {
        if (!wMap.has(po)) wMap.set(po, { ...r, _tonnage: 0 })
        wMap.get(po)._tonnage += ton
      }
    })
    const statusT = {}; const statusTm = {}; const statusW = {}
    const seenTStat = new Set(); const seenTmStat = new Set(); const seenWStat = new Set()
    data.forEach(r => {
      const d = parseMMDDDate(r['Appointment Date(MM-DD-YYYY)'])
      if (!d) return
      const po = r['PO Number']
      const s = r['Status'] || 'Unknown'
      const ds = formatDate(d)
      if (ds === todayStr) { if (!seenTStat.has(po)) { seenTStat.add(po); statusT[s] = (statusT[s] || 0) + 1 } }
      else if (ds === tomorrowStr) { if (!seenTmStat.has(po)) { seenTmStat.add(po); statusTm[s] = (statusTm[s] || 0) + 1 } }
      else if (d >= today && d <= weekEnd) { if (!seenWStat.has(po)) { seenWStat.add(po); statusW[s] = (statusW[s] || 0) + 1 } }
    })
    const sortByCity = (arr) => arr.sort((a, b) => (a['City'] || '').localeCompare(b['City'] || ''))
    return { today: sortByCity([...tMap.values()]), tomorrow: sortByCity([...tmMap.values()]), week: sortByCity([...wMap.values()]).slice(0, 20), statusT, statusTm, statusW }
  }, [data, todayStr, tomorrowStr, weekEnd])

  const renderTable = (rows, sort) => {
    if (!rows.length) return <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No appointments</div>
    return (
      <table>
        <thead>
          <tr>
            <SortTh label="PO #" k="po" sort={sort} />
            <SortTh label="City" k="city" sort={sort} />
            <SortTh label="Platform" k="platform" sort={sort} />
            <SortTh label="Facility" k="facility" sort={sort} />
            <SortTh label="Transporter" k="transporter" sort={sort} />
            <SortTh label="Tonnage (KG)" k="tonnage" sort={sort} />
            <SortTh label="Appt Date" k="apptdate" sort={sort} />
            <SortTh label="Appt ID" k="apptid" sort={sort} />
            <SortTh label="Status" k="status" sort={sort} />
            <SortTh label="Remarks" k="remarks" sort={sort} />
          </tr>
        </thead>
        <tbody>
          {applySort(rows, sort, apptAccessors).map((r, i) => (
            <tr key={i}>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r['PO Number']}</td>
              <td>{r['City']}</td>
              <td style={{ color: '#3b82f6', fontWeight: 600 }}>{r['Platform']}</td>
              <td style={{ fontSize: 12, color: '#94a3b8' }}>{r['FacilityName'] || '—'}</td>
              <td>{r['Transporter'] || '—'}</td>
              <td style={{ fontWeight: 600 }}>{Math.round(r._tonnage).toLocaleString()}</td>
              <td style={{ fontSize: 12, color: '#94a3b8' }}>{r['Appointment Date(MM-DD-YYYY)']}</td>
              <td style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>{r['Appointment ID'] || '—'}</td>
              <td><span className={`status ${(r['Status'] || '').toLowerCase().replace(/\s+/g, '')}`}>{r['Status'] || 'N/A'}</span></td>
              <td style={{ fontSize: 12, color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['Remarks'] || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <>
      <div className="recent-orders" style={{ marginTop: 20 }}>
        <div className="orders-header">
          <div className="orders-title">📅 Today's Appointments ({byAppt.today.length})</div>
          <div className="chart-period">{todayStr} — Total: {byAppt.today.length} · <span style={{ color: '#22c55e' }}>{byAppt.statusT['Delivered'] || 0} Delivered</span> · <span style={{ color: '#eab308' }}>{byAppt.statusT['In-Transit'] || 0} In-Transit</span> · <span style={{ color: '#ef4444' }}>{byAppt.statusT['RTO'] || 0} RTO</span></div>
        </div>
        {renderTable(byAppt.today, todaySort)}
      </div>

      <div className="recent-orders" style={{ marginTop: 20 }}>
        <div className="orders-header">
          <div className="orders-title">📅 Tomorrow's Appointments ({byAppt.tomorrow.length})</div>
          <div className="chart-period">{tomorrowStr} — Total: {byAppt.tomorrow.length} · <span style={{ color: '#22c55e' }}>{byAppt.statusTm['Delivered'] || 0} Delivered</span> · <span style={{ color: '#eab308' }}>{byAppt.statusTm['In-Transit'] || 0} In-Transit</span> · <span style={{ color: '#ef4444' }}>{byAppt.statusTm['RTO'] || 0} RTO</span></div>
        </div>
        {renderTable(byAppt.tomorrow, tomorrowSort)}
      </div>

      <div className="recent-orders" style={{ marginTop: 20 }}>
        <div className="orders-header">
          <div className="orders-title">📅 Weekly Appointments (Next 7 Days) ({byAppt.week.length})</div>
          <div className="chart-period">{todayStr} → {formatDate(weekEnd)} — Total: {byAppt.week.length} · <span style={{ color: '#22c55e' }}>{byAppt.statusW['Delivered'] || 0} Delivered</span> · <span style={{ color: '#eab308' }}>{byAppt.statusW['In-Transit'] || 0} In-Transit</span> · <span style={{ color: '#ef4444' }}>{byAppt.statusW['RTO'] || 0} RTO</span></div>
        </div>
        {renderTable(byAppt.week, weekSort)}
      </div>
    </>
  )
}

function WoWCityTable({ data, dateFrom, dateTo, platformFilter }) {
  const wowData = useMemo(() => {
    const to = parseDate(dateTo)
    if (!to) return []
    const currStart = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 6)
    const prevStart = new Date(currStart.getFullYear(), currStart.getMonth(), currStart.getDate() - 7)
    const prevEnd = new Date(currStart.getFullYear(), currStart.getMonth(), currStart.getDate() - 1)

    const inRange = data.filter(r => {
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      if (!d) return false
      if (platformFilter !== 'All' && r['Platform'] !== platformFilter) return false
      return d >= prevStart && d <= to
    })

    const map = {}
    const currValueSet = {}; const currTonnageSet = {}; const prevValueSet = {}; const prevTonnageSet = {}
    inRange.forEach(r => {
      const c = r['City']; if (!c) return
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      const po = r['PO Number']
      if (!map[c]) {
        map[c] = { city: c, currOrders: new Set(), currValue: 0, currTonnage: 0, prevOrders: new Set(), prevValue: 0, prevTonnage: 0 }
        currValueSet[c] = new Set(); currTonnageSet[c] = new Set(); prevValueSet[c] = new Set(); prevTonnageSet[c] = new Set()
      }
      if (d >= currStart) {
        map[c].currOrders.add(po)
        if (!currValueSet[c].has(po)) { currValueSet[c].add(po); map[c].currValue += num(r['PO Value with Tax']) }
        if (!currTonnageSet[c].has(po)) { currTonnageSet[c].add(po); map[c].currTonnage += num(r['Tonnage']) }
      } else {
        map[c].prevOrders.add(po)
        if (!prevValueSet[c].has(po)) { prevValueSet[c].add(po); map[c].prevValue += num(r['PO Value with Tax']) }
        if (!prevTonnageSet[c].has(po)) { prevTonnageSet[c].add(po); map[c].prevTonnage += num(r['Tonnage']) }
      }
    })
    Object.values(map).forEach(x => { x.currOrders = x.currOrders.size; x.prevOrders = x.prevOrders.size })
    return Object.values(map).sort((a, b) => b.currOrders - a.currOrders)
  }, [data, dateFrom, dateTo, platformFilter])

  if (!wowData.length) return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No data for week-over-week comparison.</div>

  const maxOrders = Math.max(...wowData.map(r => Math.max(r.currOrders, r.prevOrders)), 1)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>City</th>
            <th colSpan={2}>Orders</th>
            <th>Orders Change</th>
            <th colSpan={2}>Value</th>
            <th>Value Change</th>
            <th colSpan={2}>Tonnage</th>
            <th>Tonnage Change</th>
          </tr>
        </thead>
        <tbody>
          {wowData.map((row, i) => {
            const ordChange = row.prevOrders ? ((row.currOrders - row.prevOrders) / row.prevOrders * 100).toFixed(1) : null
            const valChange = row.prevValue ? ((row.currValue - row.prevValue) / row.prevValue * 100).toFixed(1) : null
            const tonChange = row.prevTonnage ? ((row.currTonnage - row.prevTonnage) / row.prevTonnage * 100).toFixed(1) : null

            const ordPct = row.prevOrders ? (row.currOrders / Math.max(row.currOrders, row.prevOrders)) : 0.5
            const valPct = row.prevValue ? (row.currValue / Math.max(row.currValue, row.prevValue)) : 0.5

            const ChangeBadge = ({ change }) => {
              if (change === null) return <span style={{ color: '#64748b' }}>—</span>
              const isUp = change >= 0
              return (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: isUp ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: isUp ? '#22c55e' : '#ef4444',
                  padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                }}>
                  <span>{isUp ? '▲' : '▼'}</span>
                  <span>{Math.abs(change)}%</span>
                </span>
              )
            }

            const MiniBar = ({ curr, prev, max }) => {
              const cw = max ? (curr / max * 100) : 0
              const pw = max ? (prev / max * 100) : 0
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#3b82f6', fontWeight: 600 }}>{curr}</span>
                    <span style={{ color: '#64748b' }}>{prev}</span>
                  </div>
                  <div style={{ height: 6, background: '#1e293b', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ width: `${pw}%`, height: '100%', background: '#475569', borderRadius: 3, position: 'absolute', left: 0 }} />
                    <div style={{ width: `${cw}%`, height: '100%', background: '#3b82f6', borderRadius: 3, position: 'absolute', left: 0, opacity: 0.8 }} />
                  </div>
                </div>
              )
            }

            return (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.city}</td>
                <td><MiniBar curr={row.currOrders} prev={row.prevOrders} max={maxOrders} /></td>
                <td style={{ fontSize: 11, color: '#64748b' }}>Curr / Prev</td>
                <td><ChangeBadge change={ordChange} /></td>
                <td style={{ fontWeight: 600, fontSize: 13 }}>₹{Math.round(row.currValue / 1e3).toLocaleString()}K</td>
                <td style={{ color: '#64748b', fontSize: 12 }}>₹{Math.round(row.prevValue / 1e3).toLocaleString()}K</td>
                <td><ChangeBadge change={valChange} /></td>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{Math.round(row.currTonnage)} KG</td>
                <td style={{ color: '#64748b', fontSize: 12 }}>{Math.round(row.prevTonnage)} KG</td>
                <td><ChangeBadge change={tonChange} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function InventoryTab({ data }) {
  const [hoverSku, setHoverSku] = useState(null)
  const toNumKG = (v) => {
    const s = String(v).replace(/[^0-9.\-]/g, '')
    const n = parseFloat(s)
    return isNaN(n) ? 0 : n
  }

  const productData = useMemo(() => {
    const map = {}
    data.forEach(r => {
      const p = r['Product']
      if (!p) return
      if (!map[p]) map[p] = { product: p, qty: 0, tonnage: 0, boxes: 0, value: 0 }
      map[p].qty += num(r['PO Qty'])
      map[p].tonnage += num(r['Tonnage'])
      map[p].boxes += num(r['Box Count'])
      map[p].value += num(r['PO Value with Tax'])
    })
    return Object.values(map).sort((a, b) => b.tonnage - a.tonnage)
  }, [data])

  const platformMonthData = useMemo(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const map = {}
    const monthSet = new Set()
    data.forEach(r => {
      const p = r['Platform'] || 'Unknown'
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!d) return
      const mk = `${d.getFullYear()}-${d.getMonth()}`
      monthSet.add(mk)
      if (!map[p]) map[p] = {}
      if (!map[p][mk]) map[p][mk] = { tonnage: 0, poValues: {} }
      map[p][mk].tonnage += num(r['Tonnage'])
      const po = r['PO Number']
      const iv = num(r['Invoice Value'])
      if (po && iv > 0) map[p][mk].poValues[po] = iv
    })
    const months = [...monthSet].sort().map(mk => {
      const [y, m] = mk.split('-').map(Number)
      return { key: mk, label: `${monthNames[m]} ${String(y).slice(2)}` }
    })
    const platforms = Object.keys(map).sort()
    const rows = platforms.map(p => {
      let totalTonnage = 0, totalValue = 0
      const cells = months.map(m => {
        const c = map[p][m.key]
        const value = c ? Object.values(c.poValues).reduce((s, v) => s + v, 0) : 0
        totalTonnage += c ? c.tonnage : 0
        totalValue += value
        return c ? { tonnage: Math.round(c.tonnage), value: Math.round(value) } : null
      })
      return { platform: p, cells, totalTonnage, totalValue }
    })
    const grand = rows.reduce((s, r) => ({
      totalTonnage: s.totalTonnage + r.totalTonnage,
      totalValue: s.totalValue + r.totalValue,
    }), { totalTonnage: 0, totalValue: 0 })
    const monthTotals = months.map((m, i) => rows.reduce((s, r) => {
      const c = r.cells[i]
      return { tonnage: s.tonnage + (c ? c.tonnage : 0), value: s.value + (c ? c.value : 0) }
    }, { tonnage: 0, value: 0 }))
    return { months, rows, grand, monthTotals }
  }, [data])

  const [planPlatform, setPlanPlatform] = useState('All')
  const [planCity, setPlanCity] = useState('All')

  const planData = useMemo(() => {
    const now = new Date()
    const thisYear = now.getFullYear()
    const prev2 = new Date(thisYear, now.getMonth() - 1, 1)
    const prev1 = new Date(thisYear, now.getMonth() - 2, 1)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    const last2MonthOrders = data.filter(r => {
      const d = parseMMDDDate(r['DATE(MM-DD-YYYY)'])
      if (!d) return false
      return (d.getMonth() === prev2.getMonth() && d.getFullYear() === prev2.getFullYear()) || (d.getMonth() === prev1.getMonth() && d.getFullYear() === prev1.getFullYear())
    })

    const skuMap = {}
    last2MonthOrders.forEach(r => {
      const p = r['Product']
      if (!p) return
      if (!skuMap[p]) skuMap[p] = { product: p, salesQty: 0, salesTonnage: 0, salesBoxes: 0, transportCharge: 0, totalValue: 0, combo: {} }
      const sku = skuMap[p]
      sku.salesQty += num(r['PO Qty'])
      sku.salesTonnage += num(r['Tonnage'])
      sku.salesBoxes += num(r['Box Count'])
      sku.transportCharge += toNumKG(r['Transport Charge'])
      sku.totalValue += num(r['PO Value with Tax'])
      const c = r['City'] || 'Unknown'
      const pl = r['Platform'] || 'Unknown'
      if (!sku.combo[c]) sku.combo[c] = {}
      if (!sku.combo[c][pl]) sku.combo[c][pl] = { qty: 0, boxes: 0 }
      sku.combo[c][pl].qty += num(r['PO Qty'])
      sku.combo[c][pl].boxes += num(r['Box Count'])
    })

    const nextMonth = (prev2.getMonth() + 1) % 12
    const nextMonthName = monthNames[nextMonth]
    const periodLabel = `${monthNames[prev1.getMonth()]}–${monthNames[prev2.getMonth()]}`

    const platformOptions = [...new Set(Object.values(skuMap).flatMap(s => Object.keys(s.combo).flatMap(c => Object.keys(s.combo[c]))))]
    const cityOptions = [...new Set(Object.values(skuMap).flatMap(s => Object.keys(s.combo)))]

    const baseItems = Object.values(skuMap).map(r => {
      const perUnitTonnage = r.salesQty ? r.salesTonnage / r.salesQty : 0
      const perUnitBoxes = r.salesQty ? r.salesBoxes / r.salesQty : 0
      const perUnitCharge = r.salesQty ? r.transportCharge / r.salesQty : 0
      return {
        product: r.product,
        salesQty: r.salesQty,
        salesTonnage: Math.round(r.salesTonnage),
        salesBoxes: r.salesBoxes,
        transportCharge: Math.round(r.transportCharge),
        totalValue: Math.round(r.totalValue),
        perUnitTonnage,
        perUnitBoxes,
        perUnitCharge,
        combo: r.combo,
      }
    })

    return { month: periodLabel, nextMonth: nextMonthName, baseItems, platformOptions, cityOptions }
  }, [data])

  const planItems = useMemo(() => {
    const filterQty = (sku) => {
      let qty = 0
      for (const c in sku.combo) {
        for (const pl in sku.combo[c]) {
          if (planPlatform !== 'All' && pl !== planPlatform) continue
          if (planCity !== 'All' && c !== planCity) continue
          qty += sku.combo[c][pl].qty
        }
      }
      return qty
    }
    const platformQty = (sku) => {
      const map = {}
      for (const c in sku.combo) {
        for (const pl in sku.combo[c]) {
          if (planCity !== 'All' && c !== planCity) continue
          map[pl] = (map[pl] || 0) + sku.combo[c][pl].qty
        }
      }
      return Object.entries(map).sort((a, b) => b[1] - a[1])
    }
    const cityQty = (sku) => {
      const map = {}
      for (const c in sku.combo) {
        if (planPlatform !== 'All') continue
        for (const pl in sku.combo[c]) {
          map[c] = (map[c] || 0) + sku.combo[c][pl].qty
        }
      }
      if (planPlatform !== 'All') {
        for (const c in sku.combo) {
          if (sku.combo[c][planPlatform]) map[c] = (map[c] || 0) + sku.combo[c][planPlatform].qty
        }
      }
      return Object.entries(map).sort((a, b) => b[1] - a[1])
    }
    return planData.baseItems.map(r => {
      const qty = filterQty(r)
      const planQty = Math.round(qty * 0.7)
      const platforms = platformQty(r)
      const cities = cityQty(r)
      return {
        product: r.product,
        salesQty: qty,
        salesTonnage: Math.round(r.salesTonnage),
        salesBoxes: r.salesBoxes,
        totalValue: Math.round(r.totalValue),
        planQty,
        planTonnage: Math.round(planQty * r.perUnitTonnage),
        planBoxes: Math.round(planQty * r.perUnitBoxes),
        planTransport: Math.round(planQty * r.perUnitCharge),
        perUnitCharge: r.perUnitCharge.toFixed(2),
        platforms,
        cities,
      }
    }).filter(x => x.salesQty > 0).sort((a, b) => b.planQty - a.planQty)
  }, [planData, planPlatform, planCity])

  return (
    <>
      <header>
        <div>
          <h1>Inventory</h1>
          <div className="date">{productData.length} unique products • Platform: All</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => {
            const rows = ['Production Plan Report']
            rows.push('Period,' + planData.month + ' Sales → ' + planData.nextMonth + ' Plan')
            rows.push('')
            if (planData.baseItems && planData.baseItems.length) {
              rows.push('SKU,Sales Qty,Plan Qty,Plan Tonnage KG,Plan Boxes,Cost/Unit,Total Value,Platforms,Cities')
              let gQty = 0, gTon = 0, gBox = 0, gVal = 0
              planData.baseItems.forEach(r => {
                const planQty = Math.round(r.salesQty * 0.7)
                rows.push(`${csvEscape(r.product)},${r.salesQty},${planQty},${Math.round(planQty * r.perUnitTonnage)},${Math.round(planQty * r.perUnitBoxes)},${r.perUnitCharge.toFixed(2)},${r.totalValue}`)
                gQty += planQty; gTon += Math.round(planQty * r.perUnitTonnage); gBox += Math.round(planQty * r.perUnitBoxes); gVal += r.totalValue
              })
              rows.push('')
              rows.push(`GRAND TOTAL,${gQty},${gTon},${gBox},,${gVal}`)
            }
            const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = 'production_plan_report.csv'; a.click()
            URL.revokeObjectURL(url)
          }} style={{ background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⬇ Download CSV
          </button>
          <ProfileSection />
        </div>
      </header>

      <div className="recent-orders" style={{ marginTop: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Total Qty</th>
              <th>Tonnage (KG)</th>
              <th>Boxes</th>
              <th>Total Value</th>
            </tr>
          </thead>
          <tbody>
            {productData.map((row, i) => (
              <tr key={i}>
                <td>{row.product}</td>
                <td>{row.qty}</td>
                <td>{Math.round(row.tonnage)}</td>
                <td>{row.boxes}</td>
                <td>₹{Math.round(row.value).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {platformMonthData.rows.length > 0 && (
        <div className="recent-orders" style={{ marginTop: 20 }}>
          <div className="orders-header">
            <div className="orders-title">Platform &amp; Month-wise Sales</div>
            <div className="chart-period">Tonnage (KG) • Invoice Value</div>
            <button onClick={() => {
              const rows = ['Platform & Month-wise Sales']
              rows.push('')
              rows.push('Platform,' + platformMonthData.months.map(m => `${m.label} Tonnage`).join(',') + ',' + platformMonthData.months.map(m => `${m.label} Value`).join(',') + ',Total Tonnage,Total Value')
              platformMonthData.rows.forEach(r => {
                rows.push(csvEscape(r.platform) + ',' + r.cells.map(c => c ? c.tonnage : '').join(',') + ',' + r.cells.map(c => c ? c.value : '').join(',') + ',' + r.totalTonnage + ',' + r.totalValue)
              })
              rows.push('TOTAL,' + platformMonthData.monthTotals.map(m => m.tonnage).join(',') + ',' + platformMonthData.monthTotals.map(m => m.value).join(',') + ',' + platformMonthData.grand.totalTonnage + ',' + platformMonthData.grand.totalValue)
              const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'platform_month_sales.csv'; a.click()
              URL.revokeObjectURL(url)
            }} style={{ background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              ⬇ Download CSV
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Platform</th>
                {platformMonthData.months.map(m => (
                  <th key={m.key} colSpan={2} style={{ textAlign: 'center' }}>{m.label}</th>
                ))}
                <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Total Tonnage</th>
                <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Total Value</th>
              </tr>
              <tr>
                {platformMonthData.months.flatMap(m => [
                  <th key={'c' + m.key}>Tonnage</th>,
                  <th key={'v' + m.key}>Value</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {platformMonthData.rows.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{row.platform}</td>
                  {row.cells.flatMap((c, j) => [
                    <td key={'t' + j}>{c ? c.tonnage : '—'}</td>,
                    <td key={'v' + j}>{c ? '₹' + c.value.toLocaleString() : '—'}</td>,
                  ])}
                  <td style={{ fontWeight: 600 }}>{row.totalTonnage}</td>
                  <td style={{ fontWeight: 600 }}>₹{row.totalValue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'rgba(59,130,246,0.12)' }}>
                <td style={{ fontWeight: 700 }}>Grand Total</td>
                {platformMonthData.monthTotals.flatMap((m, j) => [
                  <td key={'t' + j} style={{ fontWeight: 700 }}>{m.tonnage}</td>,
                  <td key={'v' + j} style={{ fontWeight: 700 }}>₹{m.value.toLocaleString()}</td>,
                ])}
                <td style={{ fontWeight: 700 }}>{platformMonthData.grand.totalTonnage}</td>
                <td style={{ fontWeight: 700 }}>₹{platformMonthData.grand.totalValue.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {planItems.length > 0 && (() => {
        const t = planItems.reduce((s, r) => ({
          salesQty: s.salesQty + r.salesQty,
          planQty: s.planQty + r.planQty,
          planTonnage: s.planTonnage + r.planTonnage,
          planBoxes: s.planBoxes + r.planBoxes,
          totalValue: s.totalValue + r.totalValue,
        }), { salesQty: 0, planQty: 0, planTonnage: 0, planBoxes: 0, totalValue: 0 })
        const chip = (active, onClick, label) => (
          <button key={label} onClick={onClick} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: active ? 'rgba(59,130,246,0.25)' : 'rgba(59,130,246,0.1)', color: active ? '#f1f5f9' : '#3b82f6', border: active ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(59,130,246,0.2)' }}>
            {label}
          </button>
        )
        return (
        <div className="recent-orders" style={{ marginTop: 20 }}>
          <div className="orders-header">
            <div className="orders-title">Production Plan — {planData.nextMonth}</div>
            <div className="chart-period">Based on {planData.month} sales • 30% lower projection</div>
            <button onClick={() => {
              const rows = ['Production Plan Report']
              rows.push('Period,' + planData.month + ' Sales → ' + planData.nextMonth + ' Plan (2-week stock arrangement)')
              rows.push('')
              rows.push('CITY WISE × PRODUCT WISE × PLATFORM WISE')
              rows.push('City,Product,Platform,Sales Qty (2M),Plan Qty (70%),Plan Boxes')
              const detail = []
              const prodTotals = {}
              for (const r of planData.baseItems) {
                for (const c in r.combo) {
                  for (const pl in r.combo[c]) {
                    const cell = r.combo[c][pl]
                    if (cell.qty <= 0) continue
                    const planQty = Math.round(cell.qty * 0.7)
                    const planBoxes = Math.round(planQty * r.perUnitBoxes)
                    detail.push([c, r.product, pl, cell.qty, planQty, planBoxes])
                    prodTotals[r.product] = (prodTotals[r.product] || 0) + cell.qty
                  }
                }
              }
              detail.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]))
              detail.forEach(d => rows.push(d.map(x => csvEscape(String(x))).join(',')))
              rows.push('')
              rows.push('PRODUCT SUMMARY (UNIQUE PRODUCT - OVERALL PLAN COUNT)')
              rows.push('Product,Total Sales Qty (2M),Total Plan Qty (70%),Total Plan Boxes')
              const prodBoxes = {}
              for (const r of planData.baseItems) {
                prodBoxes[r.product] = Math.round(r.salesQty * 0.7 * r.perUnitBoxes)
              }
              Object.entries(prodTotals).sort((a, b) => b[1] - a[1]).forEach(([p, q]) => {
                rows.push(`${csvEscape(p)},${q},${Math.round(q * 0.7)},${prodBoxes[p] || 0}`)
              })
              const grand = Object.values(prodTotals).reduce((s, v) => s + v, 0)
              const grandBoxes = Object.values(prodBoxes).reduce((s, v) => s + v, 0)
              rows.push('')
              rows.push(`GRAND TOTAL,${grand},${Math.round(grand * 0.7)},${grandBoxes}`)
              const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'production_plan.csv'; a.click()
              URL.revokeObjectURL(url)
            }} style={{ background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              ⬇ Download Plan
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>{planData.month} Sales</th>
                <th>Plan Qty</th>
                <th>Plan Tonnage</th>
                <th>Plan Boxes</th>
                <th>Cost/Unit</th>
                <th>Value</th>
                <th>Platforms</th>
                <th>Cities</th>
              </tr>
            </thead>
            <tbody>
              {planItems.map((row, i) => {
                const pct = planItems.length ? (row.planQty / planItems[0].planQty * 100) : 0
                return (
                <tr key={i}>
                  <td style={{ position: 'relative', fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onMouseEnter={() => setHoverSku(row.product)} onMouseLeave={() => setHoverSku(null)}>{row.product}
                    {hoverSku === row.product && (
                      <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: 4, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '8px 12px', zIndex: 9999, maxWidth: 420, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                        <span style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 600, wordBreak: 'break-word', whiteSpace: 'normal' }}>{row.product}</span>
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 50, height: 5, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#3b82f6', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 13 }}>{row.salesQty}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: '#3b82f6' }}>{row.planQty}</td>
                  <td>{row.planTonnage} KG</td>
                  <td>{row.planBoxes}</td>
                  <td style={{ fontSize: 12, color: '#94a3b8' }}>₹{row.perUnitCharge}</td>
                  <td style={{ fontSize: 12, color: '#94a3b8' }}>₹{row.totalValue.toLocaleString()}</td>
                  <td style={{ fontSize: 11, color: '#3b82f6', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.platforms.map(([n, q]) => `${n} (${q})`).join(' • ')}</td>
                  <td style={{ fontSize: 11, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.cities.map(([n, q]) => `${n} (${q})`).join(' • ')}</td>
                </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'rgba(59,130,246,0.12)' }}>
                <td style={{ fontWeight: 700 }}>Total</td>
                <td style={{ fontWeight: 700 }}>{t.salesQty}</td>
                <td style={{ fontWeight: 700, color: '#3b82f6' }}>{t.planQty}</td>
                <td style={{ fontWeight: 700 }}>{t.planTonnage} KG</td>
                <td style={{ fontWeight: 700 }}>{t.planBoxes}</td>
                <td>—</td>
                <td style={{ fontWeight: 700 }}>₹{t.totalValue.toLocaleString()}</td>
                <td>—</td>
                <td>—</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
        )
      })()}
    </>
  )
}

function LogisticsTab({ data }) {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
  const [dateFrom, setDateFrom] = useState(formatDate(thirtyDaysAgo))
  const [dateTo, setDateTo] = useState(formatDate(today))

  const carrierData = useMemo(() => {
    const map = {}
    data.forEach(r => {
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      if (!d) return
      if (d < parseDate(dateFrom) || d > parseDate(dateTo)) return
      const c = r['Transporter'] || 'Not Assigned'
      if (!map[c]) map[c] = { carrier: c, totalPO: new Set(), delivered: new Set(), rto: new Set(), inTransit: 0, tonnage: 0, totalValue: 0, transportCharge: 0 }
      map[c].totalPO.add(r['PO Number'])
      map[c].tonnage += num(r['Tonnage'])
      map[c].totalValue += num(r['PO Value with Tax'])
      map[c].transportCharge += num(r['Transport Charge'])
      const status = r['Status'] || ''
      if (status === 'Delivered') map[c].delivered.add(r['PO Number'])
      else if (status === 'RTO') map[c].rto.add(r['PO Number'])
      else if (['In-Transit', 'Pending', 'Processing'].includes(status)) map[c].inTransit++
    })
    return Object.values(map).map(x => ({ ...x, totalPO: x.totalPO.size, delivered: x.delivered.size, rto: x.rto.size })).sort((a, b) => b.totalPO - a.totalPO)
  }, [data, dateFrom, dateTo])

  return (
    <>
      <header>
        <div>
          <h1>Logistics</h1>
          <div className="date">{carrierData.length} carriers active • Platform: All</div>
        </div>
        <ProfileSection />
      </header>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, justifyContent: 'flex-end' }}>
        <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>From</label>
        <input type="date" value={(() => { const p = dateFrom.split('-'); return `${p[2]}-${p[0]}-${p[1]}` })()} onChange={e => { const p = e.target.value.split('-'); setDateFrom(`${p[1]}-${p[2]}-${p[0]}`) }} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13 }} />
        <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>To</label>
        <input type="date" value={(() => { const p = dateTo.split('-'); return `${p[2]}-${p[0]}-${p[1]}` })()} onChange={e => { const p = e.target.value.split('-'); setDateTo(`${p[1]}-${p[2]}-${p[0]}`) }} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13 }} />
      </div>

      <div className="recent-orders" style={{ marginTop: 0 }}>
        <div className="orders-header">
          <div className="orders-title">Transporter-wise Performance</div>
          <div className="chart-period">{dateFrom} to {dateTo}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Transporter</th>
              <th>POs Handled</th>
              <th>In-Transit</th>
              <th>Delivered</th>
              <th>RTO</th>
              <th>Delivery Rate</th>
              <th>RTO Rate</th>
              <th>Tonnage</th>
              <th>Transport Cost</th>
              <th>Cost/KG</th>
              <th>Total Value</th>
            </tr>
          </thead>
          <tbody>
            {carrierData.map((row, i) => {
              const deliveryRate = row.totalPO ? Math.min(100, row.delivered / row.totalPO * 100).toFixed(1) : 0
              const rtoRate = row.totalPO ? (row.rto / row.totalPO * 100).toFixed(1) : 0
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{row.carrier}</td>
                  <td>{row.totalPO}</td>
                  <td><span style={{ color: '#3b82f6', fontWeight: 600 }}>{row.inTransit}</span></td>
                  <td><span style={{ color: '#22c55e', fontWeight: 600 }}>{row.delivered}</span></td>
                  <td><span style={{ color: '#ef4444', fontWeight: 600 }}>{row.rto}</span></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${deliveryRate}%`, height: '100%', background: deliveryRate >= 70 ? '#22c55e' : deliveryRate >= 40 ? '#eab308' : '#ef4444', borderRadius: 3 }} />
                      </div>
                      <span style={{ color: deliveryRate >= 70 ? '#22c55e' : deliveryRate >= 40 ? '#eab308' : '#ef4444', fontWeight: 600, fontSize: 13 }}>{deliveryRate}%</span>
                    </div>
                  </td>
                  <td style={{ color: rtoRate > 10 ? '#ef4444' : '#94a3b8', fontWeight: 600 }}>{rtoRate}%</td>
                  <td>{Math.round(row.tonnage)} KG</td>
                  <td style={{ fontWeight: 600 }}>₹{Math.round(row.transportCharge).toLocaleString()}</td>
                  <td style={{ color: '#a855f7', fontWeight: 600 }}>{row.tonnage ? (row.transportCharge / row.tonnage).toFixed(2) : '—'}</td>
                  <td>₹{Math.round(row.totalValue).toLocaleString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ReportsTab({ data, metrics, platformFilter }) {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
  const [dateFrom, setDateFrom] = useState(formatDate(thirtyDaysAgo))
  const [dateTo, setDateTo] = useState(formatDate(today))

  const reportData = useMemo(() => {
    const map = {}
    data.forEach(r => {
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      if (!d) return
      if (d < parseDate(dateFrom) || d > parseDate(dateTo)) return
      if (platformFilter !== 'All' && r['Platform'] !== platformFilter) return
      const p = r['Platform'] || 'Unknown'
      if (!map[p]) map[p] = { platform: p, orders: new Set(), delivered: 0, rto: 0, inTransit: 0, tonnage: 0, value: 0 }
      map[p].orders.add(r['PO Number'])
      map[p].tonnage += num(r['Tonnage'])
      map[p].value += num(r['PO Value with Tax'])
      if (r['Status'] === 'Delivered') map[p].delivered++
      else if (r['Status'] === 'RTO') map[p].rto++
      else if (['In-Transit', 'Pending', 'Processing'].includes(r['Status'] || '')) map[p].inTransit++
    })
    return Object.values(map).map(r => ({
      ...r,
      orders: r.orders.size,
      fillRate: (r.delivered + r.rto) ? Math.round(r.delivered / (r.delivered + r.rto) * 100) : 0,
    })).sort((a, b) => b.orders - a.orders)
  }, [data, dateFrom, dateTo, platformFilter])

  const downloadCSV = () => {
    const header = 'Platform,Orders,Delivered,RTO,In-Transit,Fill Rate%,Tonnage (KG),Value'
    const rows = reportData.map(r =>
      `${r.platform},${r.orders},${r.delivered},${r.rto},${r.inTransit},${r.fillRate},${Math.round(r.tonnage)},${Math.round(r.value)}`
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `platform_report_${dateFrom}_to_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <header>
        <div>
          <h1>Reports</h1>
          <div className="date">{platformFilter !== 'All' ? `Platform: ${platformFilter} • ` : ''}Platform-wise summary</div>
        </div>
        <ProfileSection />
      </header>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>From</label>
        <input type="date" value={(() => { const p = dateFrom.split('-'); return `${p[2]}-${p[0]}-${p[1]}` })()} onChange={e => { const p = e.target.value.split('-'); setDateFrom(`${p[1]}-${p[2]}-${p[0]}`) }} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13 }} />
        <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>To</label>
        <input type="date" value={(() => { const p = dateTo.split('-'); return `${p[2]}-${p[0]}-${p[1]}` })()} onChange={e => { const p = e.target.value.split('-'); setDateTo(`${p[1]}-${p[2]}-${p[0]}`) }} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13 }} />
        <button onClick={downloadCSV} style={{ marginLeft: 'auto', background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          ⬇ Download CSV
        </button>
      </div>

      <div className="recent-orders" style={{ marginTop: 0 }}>
        <div className="orders-header">
          <div className="orders-title">Platform-wise Report</div>
          <div className="chart-period">{dateFrom} to {dateTo}{platformFilter !== 'All' ? ` • ${platformFilter}` : ''}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>Orders</th>
              <th>Delivered</th>
              <th>RTO</th>
              <th>In-Transit</th>
              <th>Fill Rate</th>
              <th>Tonnage (KG)</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {reportData.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.platform}</td>
                <td>{r.orders}</td>
                <td style={{ color: '#22c55e', fontWeight: 600 }}>{r.delivered}</td>
                <td style={{ color: '#ef4444', fontWeight: 600 }}>{r.rto}</td>
                <td style={{ color: '#3b82f6', fontWeight: 600 }}>{r.inTransit}</td>
                <td style={{ color: r.fillRate >= 80 ? '#22c55e' : r.fillRate >= 50 ? '#eab308' : '#ef4444', fontWeight: 700 }}>{r.fillRate}%</td>
                <td>{Math.round(r.tonnage)}</td>
                <td>₹{Math.round(r.value).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function SettingsTab() {
  const { userEmail, setUserEmail } = useContext(UserContext)
  const [editEmail, setEditEmail] = useState(userEmail)
  return (
    <>
      <header>
        <div>
          <h1>Settings</h1>
          <div className="date">Configure your dashboard</div>
        </div>
        <ProfileSection />
      </header>

      <div className="recent-orders" style={{ padding: 24 }}>
        <div className="orders-header" style={{ marginBottom: 20 }}>
          <div className="orders-title">User Profile</div>
          <div className="chart-period">Update your display information</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Email Address</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
              style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '10px 14px', fontSize: 14 }} />
            <button onClick={() => setUserEmail(editEmail)}
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Update</button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>This email is displayed across all dashboard tabs.</div>
      </div>
    </>
  )
}

function PerformanceTab({ data, platformFilter }) {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
  const [wowDateFrom, setWowDateFrom] = useState(formatDate(thirtyDaysAgo))
  const [wowDateTo, setWowDateTo] = useState(formatDate(today))
  const [wowPlatformFilter, setWowPlatformFilter] = useState('All')

  const wowPlatforms = useMemo(() => {
    const set = new Set()
    data.forEach(r => { if (r['Platform']) set.add(r['Platform']) })
    return ['All', ...Array.from(set).sort()]
  }, [data])

  const analysis = useMemo(() => {
    const filtered = platformFilter === 'All' ? data : data.filter(r => r['Platform'] === platformFilter)
    const poData = uniqueByPO(filtered)

    const parsePct = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : (n <= 1 ? Math.round(n * 100) : Math.round(n)) }

    const leadDays = (a, b) => {
      const da = parseDate(a); const db = parseDate(b)
      if (!da || !db) return null
      return Math.round((db - da) / (1000 * 60 * 60 * 24))
    }

    const toNumKG = (v) => {
      const s = String(v).replace(/[^0-9.\-]/g, '')
      const n = parseFloat(s)
      return isNaN(n) ? 0 : n
    }

    const pocMap = {}
    for (const r of poData) {
      const p = r['Platform']
      if (!p) continue
      if (!pocMap[p]) pocMap[p] = { platform: p, count: 0, aging: {} }
      pocMap[p].count++
      const aging = r['PO Aging'] || 'N/A'
      pocMap[p].aging[aging] = (pocMap[p].aging[aging] || 0) + 1
    }

    const poAgg = {}
    for (const r of filtered) {
      const po = r['PO Number']
      if (!po) continue
      if (!poAgg[po]) poAgg[po] = { transporter: r['Transporter'], charge: 0, tonnage: 0, value: 0 }
      poAgg[po].charge += toNumKG(r['Transport Charge'])
      poAgg[po].tonnage += toNumKG(r['Tonnage'])
      poAgg[po].value += toNumKG(r['PO Value with Tax'])
    }
    const transportMap = {}
    for (const agg of Object.values(poAgg)) {
      const t = agg.transporter
      if (!t) continue
      if (!transportMap[t]) transportMap[t] = { transporter: t, charge: 0, tonnage: 0, value: 0, count: 0 }
      transportMap[t].charge += agg.charge
      transportMap[t].tonnage += agg.tonnage
      transportMap[t].value += agg.value
      transportMap[t].count++
    }
    const transportData = Object.values(transportMap).map(x => ({
      ...x, count: x.count.size,
      costPerKG: x.tonnage ? (x.charge / x.tonnage) : 0,
      costPct: x.value ? (x.charge / x.value * 100) : 0,
    })).sort((a, b) => b.charge - a.charge)

    const allBooking = []; const allDelivery = []; const allTotal = []
    const leadMap = {}
    for (const r of poData) {
      const released = r['PO Released Date(MM-DD-YYYY)']
      const appt = r['Appointment Date(MM-DD-YYYY)']
      const delivered = r['Actual Delivery Date(MM-DD-YYYY)']
      const t1 = leadDays(released, appt)
      const t2 = leadDays(appt, delivered)
      if (t1 === null && t2 === null) continue
      if (t1 !== null && t1 >= 0) allBooking.push(t1)
      if (t2 !== null && t2 >= 0) allDelivery.push(t2)
      if (t1 !== null && t2 !== null && t1 >= 0 && t2 >= 0) allTotal.push(t1 + t2)
      const p = r['Platform']
      if (!p) continue
      if (!leadMap[p]) leadMap[p] = { platform: p, bookingDays: [], deliveryDays: [], totalDays: [] }
      if (t1 !== null && t1 >= 0) leadMap[p].bookingDays.push(t1)
      if (t2 !== null && t2 >= 0) leadMap[p].deliveryDays.push(t2)
      if (t1 !== null && t2 !== null && t1 >= 0 && t2 >= 0) leadMap[p].totalDays.push(t1 + t2)
    }
    const leadData = Object.values(leadMap).map(x => ({
      platform: x.platform,
      avgBooking: x.bookingDays.length ? Math.round(x.bookingDays.reduce((s, v) => s + v, 0) / x.bookingDays.length) : '—',
      avgDelivery: x.deliveryDays.length ? Math.round(x.deliveryDays.reduce((s, v) => s + v, 0) / x.deliveryDays.length) : '—',
      avgTotal: x.totalDays.length ? Math.round(x.totalDays.reduce((s, v) => s + v, 0) / x.totalDays.length) : '—',
      samples: x.totalDays.length,
    })).sort((a, b) => (b.avgTotal === '—' ? 0 : b.avgTotal) - (a.avgTotal === '—' ? 0 : a.avgTotal))
    const overallBooking = allBooking.length ? Math.round(allBooking.reduce((s, v) => s + v, 0) / allBooking.length) : null
    const overallDelivery = allDelivery.length ? Math.round(allDelivery.reduce((s, v) => s + v, 0) / allDelivery.length) : null

    const fillMap = {}
    for (const r of poData) {
      const p = r['Product']
      if (!p) continue
      if (!fillMap[p]) fillMap[p] = { product: p, poQty: 0, delQty: 0, tonnage: 0 }
      fillMap[p].poQty += num(r['PO Qty'])
      fillMap[p].delQty += num(r['Delivered QTY'])
      fillMap[p].tonnage += toNumKG(r['Dispatch Tonnage'])
    }
    const fillData = Object.values(fillMap).map(x => ({
      product: x.product,
      avgFinal: x.poQty ? Math.round(x.delQty / x.poQty * 100) : 0,
      gap: x.poQty ? 100 - Math.round(x.delQty / x.poQty * 100) : 0,
      samples: x.poQty,
      tonnage: x.tonnage,
    })).sort((a, b) => a.avgFinal - b.avgFinal)

    const rtoReasons = {}
    for (const r of poData) {
      if (r['Status'] !== 'RTO') continue
      const reason = r['RTO Reason']
      if (!reason) continue
      if (!rtoReasons[reason]) rtoReasons[reason] = { reason, count: 0, tonnage: 0, value: 0 }
      rtoReasons[reason].count++
      rtoReasons[reason].tonnage += toNumKG(r['RTO Tonnage (MT)'])
      rtoReasons[reason].value += toNumKG(r['RTO Value at Risk'])
    }
    const rtoData = Object.values(rtoReasons).sort((a, b) => b.count - a.count)

    const cityAvail = {}
    for (const r of poData) {
      const c = r['City']
      if (!c) continue
      if (!cityAvail[c]) cityAvail[c] = { city: c, totalPOQty: 0, totalDelQty: 0, poCount: 0 }
      cityAvail[c].totalPOQty += num(r['PO Qty'])
      cityAvail[c].totalDelQty += num(r['Delivered QTY'])
      cityAvail[c].poCount++
    }
    const cityFillData = Object.values(cityAvail).map(x => ({
      city: x.city,
      avgFinal: x.totalPOQty ? Math.round(x.totalDelQty / x.totalPOQty * 100) : null,
      samples: x.poCount,
    })).sort((a, b) => a.city.localeCompare(b.city))

    const totalPOQty = poData.reduce((s, r) => s + num(r['PO Qty']), 0)
    const totalDelQty = poData.reduce((s, r) => s + num(r['Delivered QTY']), 0)
    const overallFillRate = totalPOQty ? Math.round(totalDelQty / totalPOQty * 100) : null
    const totalCharge = transportData.reduce((s, x) => s + x.charge, 0)
    const totalTonnage = transportData.reduce((s, x) => s + x.tonnage, 0)
    const overallCostPerKG = totalTonnage ? totalCharge / totalTonnage : null

    return { pocMap, transportData, leadData, fillData, rtoData, cityFillData, overallBooking, overallDelivery, overallFillRate, overallCostPerKG }
  }, [data, platformFilter])

  const agings = ['New PO', 'Less than 7 days PO', 'Grater than 7 days', 'Grater than 15 days', 'More than 30 days', 'N/A']

  return (
    <>
      <header>
        <div>
          <h1>Supply Chain Performance</h1>
          <div className="date">Data-driven analysis & recommendations • Platform: All</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => {
            const header = 'Section,Metric,Value'
            const rows = []
            const add = (s, m, v) => rows.push(`${s},${m},${v}`)
            add('Overview', 'Avg Booking Lead Time', analysis.overallBooking !== null ? analysis.overallBooking + ' days' : '—')
            add('Overview', 'Avg Delivery Lead Time', analysis.overallDelivery !== null ? analysis.overallDelivery + ' days' : '—')
            add('Overview', 'Avg Final Fill Rate', analysis.overallFillRate !== null ? analysis.overallFillRate + '%' : '—')
            add('Overview', 'Avg Transport Cost/KG', analysis.overallCostPerKG !== null ? '₹' + analysis.overallCostPerKG.toFixed(2) : '—')
            Object.values(analysis.pocMap).sort((a, b) => b.count - a.count).forEach(p => add('PO Booking', p.platform, p.count + ' POs'))
            analysis.transportData.forEach(t => add('Transport', t.transporter, `₹${t.costPerKG.toFixed(2)}/KG, ${t.count} POs, ${t.costPct.toFixed(1)}% of value`))
            analysis.leadData.forEach(l => add('Lead Time', l.platform, `${l.avgTotal} days total (booking ${l.avgBooking}d, delivery ${l.avgDelivery}d)`))
            analysis.fillData.filter(x => x.samples > 1).slice(0, 20).forEach(f => add('Fill Rate', f.product, `Final ${f.avgFinal}%, gap ${f.gap}%`))
            analysis.cityFillData.forEach(c => add('City Fill', c.city, `Fill ${c.avgFinal}%, Samples ${c.samples}`))
            analysis.rtoData.forEach(r => add('RTO', r.reason, `${r.count} occurrences, ₹${Math.round(r.value).toLocaleString()} at risk`))
            const csv = [header, ...rows].join('\n')
            const blob = new Blob([csv], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = 'performance_report.csv'; a.click()
            URL.revokeObjectURL(url)
          }} style={{ background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⬇ Download CSV
          </button>
          <ProfileSection />
        </div>
      </header>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">Avg Booking Lead Time</div>
            <div className="stat-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>📅</div>
          </div>
          <div className="stat-value">{analysis.overallBooking !== null ? analysis.overallBooking + ' days' : '—'}</div>
          <div className="stat-change" style={{ color: '#94a3b8' }}>PO Released → Appointment</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">Avg Delivery Lead Time</div>
            <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>🚚</div>
          </div>
          <div className="stat-value">{analysis.overallDelivery !== null ? analysis.overallDelivery + ' days' : '—'}</div>
          <div className="stat-change" style={{ color: '#94a3b8' }}>Appointment → Delivered</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">Avg Final Fill Rate</div>
            <div className="stat-icon" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>🎯</div>
          </div>
          <div className="stat-value">{analysis.overallFillRate !== null ? analysis.overallFillRate + '%' : '—'}</div>
          <div className="stat-change" style={{ color: '#eab308' }}>Overall final fill rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">Avg Transport Cost/KG</div>
            <div className="stat-icon" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>💰</div>
          </div>
          <div className="stat-value">{analysis.overallCostPerKG !== null ? '₹' + analysis.overallCostPerKG.toFixed(2) : '—'}</div>
          <div className="stat-change" style={{ color: '#94a3b8' }}>Across {analysis.transportData.length} carriers</div>
        </div>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">1. PO Booking Analysis — Aging & Freshness</div>
          <div className="chart-period">Root cause: delayed bookings reduce delivery reliability</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>Total POs</th>
              {agings.map(a => <th key={a}>{a}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.values(analysis.pocMap).sort((a, b) => b.count - a.count).map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.platform}</td>
                <td>{row.count}</td>
                {agings.map(a => <td key={a}>{row.aging[a] || 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(59,130,246,0.08)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#3b82f6', marginBottom: 8 }}>💡 Suggestions for PO Booking</div>
          <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
            <li><strong style={{ color: '#f1f5f9' }}>Reduce aging:</strong> Target 80%+ POs in Less than 7 days bucket. Currently high aging POs increase RTO risk.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Consolidate PO releases:</strong> Batch POs on fixed weekdays to streamline transporter scheduling and reduce booking lead time.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Align with platform cycles:</strong> Sync PO release with platform-specific demand cycles to avoid last-minute rushes.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Automate reorder triggers:</strong> Set min-stock alerts per product to automate PO generation before stockout.</li>
          </ul>
        </div>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">2. Transporter Cost Analysis — Charge Efficiency</div>
          <div className="chart-period">Root cause: uneven carrier costs impact margins</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Transporter</th>
              <th>POs Handled</th>
              <th>Total Charge</th>
              <th>Tonnage (KG)</th>
              <th>Cost/KG</th>
              <th>Cost as % of Value</th>
              <th>Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {analysis.transportData.map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.transporter}</td>
                <td>{row.count}</td>
                <td>₹{Math.round(row.charge).toLocaleString()}</td>
                <td>{Math.round(row.tonnage)}</td>
                <td style={{ fontWeight: 700, color: row.costPerKG > (analysis.transportData.reduce((s, x) => s + x.costPerKG, 0) / analysis.transportData.length) ? '#ef4444' : '#22c55e' }}>₹{row.costPerKG.toFixed(2)}</td>
                <td>{row.costPct.toFixed(1)}%</td>
                <td>
                  <span style={{ color: row.costPct <= 5 ? '#22c55e' : row.costPct <= 10 ? '#eab308' : '#ef4444', fontWeight: 600 }}>
                    {row.costPct <= 5 ? 'Good' : row.costPct <= 10 ? 'Average' : 'High'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(34,197,94,0.08)', borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>💡 Suggestion for Transport Cost</div>
          <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
            <li><strong style={{ color: '#f1f5f9' }}>Negotiate with high-cost carriers:</strong> Carriers above avg ₹{analysis.transportData.length ? (analysis.transportData.reduce((s, x) => s + x.costPerKG, 0) / analysis.transportData.length).toFixed(2) : 'X'}/KG need rate renegotiation or volume-based discounts.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Consolidate tonnage:</strong> Combine smaller loads into full truckloads to reduce per-KG cost for Own Vehicle / long-haul routes.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Compare cost vs value:</strong> Transport cost &gt; 10% of PO value is a red flag — review pricing for high-value low-weight products.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Optimize route allocation:</strong> Assign high-volume city routes to lowest-cost reliable carriers.</li>
          </ul>
        </div>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">3. Lead Time Analysis — Booking-to-Delivery</div>
          <div className="chart-period">Root cause: long cycle times reduce fill rates</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>Avg Booking (days)</th>
              <th>Avg Delivery (days)</th>
              <th>Avg Total (days)</th>
              <th>Samples</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {analysis.leadData.map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.platform}</td>
                <td>{row.avgBooking === '—' ? '—' : <span style={{ color: row.avgBooking > 10 ? '#ef4444' : row.avgBooking > 5 ? '#eab308' : '#22c55e', fontWeight: 600 }}>{row.avgBooking}d</span>}</td>
                <td>{row.avgDelivery === '—' ? '—' : <span style={{ color: row.avgDelivery > 5 ? '#ef4444' : row.avgDelivery > 3 ? '#eab308' : '#22c55e', fontWeight: 600 }}>{row.avgDelivery}d</span>}</td>
                <td style={{ fontWeight: 700 }}>{row.avgTotal === '—' ? '—' : `${row.avgTotal}d`}</td>
                <td>{row.samples}</td>
                <td><span style={{ color: row.avgTotal === '—' ? '#64748b' : row.avgTotal <= 10 ? '#22c55e' : row.avgTotal <= 20 ? '#eab308' : '#ef4444', fontWeight: 600 }}>{row.avgTotal === '—' ? 'N/A' : row.avgTotal <= 10 ? 'Fast' : row.avgTotal <= 20 ? 'Moderate' : 'Slow'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(99,102,241,0.08)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#6366f1', marginBottom: 8 }}>💡 Suggestions for Lead Time Reduction</div>
          <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
            <li><strong style={{ color: '#f1f5f9' }}>Reduce booking lead time:</strong> Target &lt;3 days from PO release to appointment by pre-booking transporter slots.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Improve appointment compliance:</strong> Enforce appointment scheduling within 48h of PO release — late appointments cascade into delayed deliveries.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Platform-specific SLAs:</strong> Platforms with &gt;15 day total lead time need dedicated escalation — consider split delivery models.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Real-time tracking:</strong> Implement GPS tracking for high-value shipments to proactively manage delays.</li>
          </ul>
        </div>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">4. Availability & Fill Rate Analysis</div>
          <div className="chart-period">Root cause: fill rate drops from dispatch to delivery</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Final Fill %</th>
              <th>Drop-off Gap</th>
              <th>Tonnage (KG)</th>
              <th>Samples</th>
            </tr>
          </thead>
          <tbody>
            {analysis.fillData.filter(x => x.samples > 1).slice(0, 20).map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 700, color: row.avgFinal >= 90 ? '#22c55e' : row.avgFinal >= 70 ? '#eab308' : '#ef4444' }}>{row.avgFinal}%</td>
                <td><span style={{ color: row.gap > 10 ? '#ef4444' : row.gap > 5 ? '#eab308' : '#22c55e', fontWeight: 600 }}>{row.gap}%</span></td>
                <td style={{ fontWeight: 600 }}>{Math.round(row.tonnage).toLocaleString()}</td>
                <td>{row.samples}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(168,85,247,0.08)', borderRadius: 10, border: '1px solid rgba(168,85,247,0.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#a855f7', marginBottom: 8 }}>💡 Suggestions for Availability Improvement</div>
          <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
            <li><strong style={{ color: '#f1f5f9' }}>Close the dispatch-to-delivery gap:</strong> Products with &gt;10% drop-off need quality checks at dispatch — damage during transit is a key driver.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Safety stock for fill-rate losers:</strong> Keep 15-20% buffer stock for products with final fill rate &lt;80% to absorb variability.</li>
            <li><strong style={{ color: '#f1f5f9' }}>City-specific inventory planning:</strong> High RTO rate cities need separate stock allocation — one-size-fits-all fails.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Improve packaging:</strong> Damage-related RTO (most common reason) can be reduced with better packaging and handling SOPs.</li>
          </ul>
        </div>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">5. Fill Rate by City — Availability Heatmap</div>
          <div className="chart-period">Root cause: city-level fill rate variance</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>City</th>
              <th>Final Fill Rate</th>
              <th>Samples</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {analysis.cityFillData.map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.city}</td>
                <td style={{ fontWeight: 700, color: row.avgFinal === null ? '#64748b' : row.avgFinal >= 90 ? '#22c55e' : row.avgFinal >= 70 ? '#eab308' : '#ef4444' }}>{row.avgFinal !== null ? row.avgFinal + '%' : '—'}</td>
                <td>{row.samples}</td>
                <td><span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: row.avgFinal === null ? 'rgba(100,116,139,0.2)' : row.avgFinal < 70 ? 'rgba(239,68,68,0.2)' : row.avgFinal < 90 ? 'rgba(234,179,8,0.2)' : 'rgba(34,197,94,0.2)', color: row.avgFinal === null ? '#64748b' : row.avgFinal < 70 ? '#ef4444' : row.avgFinal < 90 ? '#eab308' : '#22c55e' }}>{row.avgFinal === null ? '⚪ No Data' : row.avgFinal < 70 ? '🔴 Critical' : row.avgFinal < 90 ? '🟡 Monitor' : '🟢 Good'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {analysis.rtoData.length > 0 && (
        <div className="recent-orders" style={{ marginBottom: 20 }}>
          <div className="orders-header">
            <div className="orders-title">6. RTO Root Cause Analysis</div>
            <div className="chart-period">Top reasons for returns</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>RTO Reason</th>
                <th>Occurrences</th>
                <th>Tonnage Lost (KG)</th>
                <th>Value at Risk</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const total = analysis.rtoData.reduce((s, r) => s + r.count, 0)
                return analysis.rtoData.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row.reason}</td>
                    <td>{row.count}</td>
                    <td>{Math.round(row.tonnage)}</td>
                    <td style={{ color: '#ef4444', fontWeight: 600 }}>₹{Math.round(row.value).toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${total ? row.count / total * 100 : 0}%`, height: '100%', background: '#ef4444', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{total ? (row.count / total * 100).toFixed(1) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>
          <div style={{ marginTop: 16, padding: 16, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>💡 Suggestions for Fill Rate Improvement</div>
            <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
              <li><strong style={{ color: '#f1f5f9' }}>Target #1 RTO reason:</strong> {analysis.rtoData.length ? `${analysis.rtoData[0].reason} (${analysis.rtoData[0].count} occurrences)` : 'N/A'} — implement corrective action plan immediately.</li>
              <li><strong style={{ color: '#f1f5f9' }}>Quality gates at dispatch:</strong> Add inspection checkpoint for products with history of damage-related returns.</li>
              <li><strong style={{ color: '#f1f5f9' }}>Transporter scorecard:</strong> Track fill rate performance per carrier and phase out low performers (&lt;80% final fill rate).</li>
              <li><strong style={{ color: '#f1f5f9' }}>Customer communication:</strong> Pre-delivery SMS/email with delivery window reduces rejection and RTO.</li>
              <li><strong style={{ color: '#f1f5f9' }}>Monthly business review:</strong> Review top-5 fill rate losers monthly with cross-functional team (warehouse, logistics, sales).</li>
            </ul>
          </div>
        </div>
      )}

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">7. Week-on-Week City Performance</div>
          <div className="chart-period">Current vs Previous week</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>From</label>
          <input type="date" value={(() => { const p = wowDateFrom.split('-'); return `${p[2]}-${p[0]}-${p[1]}` })()} onChange={e => { const p = e.target.value.split('-'); setWowDateFrom(`${p[1]}-${p[2]}-${p[0]}`) }} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13 }} />
          <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>To</label>
          <input type="date" value={(() => { const p = wowDateTo.split('-'); return `${p[2]}-${p[0]}-${p[1]}` })()} onChange={e => { const p = e.target.value.split('-'); setWowDateTo(`${p[1]}-${p[2]}-${p[0]}`) }} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13 }} />
          <select value={wowPlatformFilter} onChange={e => setWowPlatformFilter(e.target.value)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
            {wowPlatforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <WoWCityTable data={data} dateFrom={wowDateFrom} dateTo={wowDateTo} platformFilter={wowPlatformFilter} />
      </div>
    </>
  )
}

function RTOTab({ data }) {
  const toNumKG = (v) => {
    const cleaned = String(v).replace(/[^0-9.\-]/g, '')
    const n = parseFloat(cleaned)
    return isNaN(n) ? 0 : n
  }
  const poData = useMemo(() => uniqueByPO(data), [data])
  const rtoPOs = useMemo(() => poData.filter(r => r['Status'] === 'RTO'), [poData])
  const rtoSort = useSort()

  const rtoAccessors = {
    po: r => r['PO Number'],
    apptdate: r => parseMMDDDate(r['Appointment Date(MM-DD-YYYY)']),
    city: r => r['City'],
    platform: r => r['Platform'],
    product: r => r['Product'],
    reason: r => r['RTO Reason'],
    tonnage: r => toNumKG(r['RTO Tonnage (MT)']),
    value: r => toNumKG(r['RTO Value at Risk']),
  }

  const rtoMetrics = useMemo(() => {
    const totalRTO = rtoPOs.length
    const totalPO = poData.length
    const rtoRate = totalPO ? (totalRTO / totalPO * 100).toFixed(1) : 0
    const tonnageLost = rtoPOs.reduce((s, r) => s + toNumKG(r['RTO Tonnage (MT)']), 0)
    const valueLost = rtoPOs.reduce((s, r) => s + toNumKG(r['RTO Value at Risk']), 0)
    return { totalRTO, rtoRate: parseFloat(rtoRate), tonnageLost, valueLost }
  }, [rtoPOs, poData.length])

  const cityRTO = useMemo(() => {
    const map = {}
    rtoPOs.forEach(r => {
      const c = r['City']; if (!c) return
      if (!map[c]) map[c] = { city: c, rto: 0, tonnage: 0, value: 0 }
      map[c].rto++
      map[c].tonnage += toNumKG(r['RTO Tonnage (MT)'])
      map[c].value += toNumKG(r['RTO Value at Risk'])
    })
    return Object.values(map).sort((a, b) => b.rto - a.rto)
  }, [rtoPOs])

  const platformRTO = useMemo(() => {
    const map = {}
    rtoPOs.forEach(r => {
      const p = r['Platform'] || 'Unknown'
      if (!map[p]) map[p] = { platform: p, rto: 0, tonnage: 0, value: 0, reasons: {} }
      map[p].rto++
      map[p].tonnage += toNumKG(r['RTO Tonnage (MT)'])
      map[p].value += toNumKG(r['RTO Value at Risk'])
      const reason = r['RTO Reason'] || 'Unknown'
      map[p].reasons[reason] = (map[p].reasons[reason] || 0) + 1
    })
    return Object.values(map).sort((a, b) => b.rto - a.rto)
  }, [rtoPOs])

  const rtoReasons = useMemo(() => {
    const map = {}
    rtoPOs.forEach(r => {
      const reason = r['RTO Reason'] || 'Not Specified'
      if (!map[reason]) map[reason] = { reason, count: 0, tonnage: 0, value: 0 }
      map[reason].count++
      map[reason].tonnage += toNumKG(r['RTO Tonnage (MT)'])
      map[reason].value += toNumKG(r['RTO Value at Risk'])
    })
    return Object.values(map).sort((a, b) => b.count - a.count)
  }, [rtoPOs])

  return (
    <>
      <header>
        <div>
          <h1>Returns (RTO) Analysis</h1>
          <div className="date">{rtoPOs.length} returned orders out of {poData.length} total • Platform: All</div>
        </div>
        <ProfileSection />
      </header>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ borderLeft: '3px solid #ef4444' }}>
          <div className="stat-label">RTO Orders</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>{rtoMetrics.totalRTO}</div>
          <div className="stat-change">of {poData.length} total POs</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #f97316' }}>
          <div className="stat-label">RTO Rate</div>
          <div className="stat-value" style={{ color: '#f97316' }}>{rtoMetrics.rtoRate}%</div>
          <div className="stat-change">percentage returned</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #eab308' }}>
          <div className="stat-label">Tonnage Lost</div>
          <div className="stat-value" style={{ color: '#eab308' }}>{Math.round(rtoMetrics.tonnageLost).toLocaleString()} KG</div>
          <div className="stat-change">total return tonnage</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #ef4444' }}>
          <div className="stat-label">Value at Risk</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>₹{Math.round(rtoMetrics.valueLost).toLocaleString()}</div>
          <div className="stat-change">financial exposure</div>
        </div>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">RTO by City</div>
          <div className="chart-period">Highest return cities</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>City</th>
              <th>RTO Orders</th>
              <th>Tonnage Lost (KG)</th>
              <th>Value at Risk</th>
            </tr>
          </thead>
          <tbody>
            {cityRTO.map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.city}</td>
                <td style={{ fontWeight: 600, color: '#ef4444' }}>{row.rto}</td>
                <td>{Math.round(row.tonnage).toLocaleString()}</td>
                <td style={{ color: '#ef4444', fontWeight: 600 }}>₹{Math.round(row.value).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">RTO by Platform</div>
          <div className="chart-period">Platform-wise return analysis</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>RTO Orders</th>
              <th>Tonnage Lost (KG)</th>
              <th>Value at Risk</th>
              <th>Top RTO Reason</th>
            </tr>
          </thead>
          <tbody>
            {platformRTO.map((row, i) => {
              const topReason = Object.entries(row.reasons).sort((a, b) => b[1] - a[1])[0]
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{row.platform}</td>
                  <td style={{ fontWeight: 600, color: '#ef4444' }}>{row.rto}</td>
                  <td>{Math.round(row.tonnage).toLocaleString()}</td>
                  <td style={{ color: '#ef4444', fontWeight: 600 }}>₹{Math.round(row.value).toLocaleString()}</td>
                  <td style={{ fontSize: 12, color: '#94a3b8' }}>{topReason ? `${topReason[0]} (${topReason[1]})` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rtoReasons.length > 0 && (
        <div className="recent-orders" style={{ marginBottom: 20 }}>
          <div className="orders-header">
            <div className="orders-title">RTO Root Cause Analysis</div>
            <div className="chart-period">Top reasons for returns</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>RTO Reason</th>
                <th>Occurrences</th>
                <th>Tonnage Lost (KG)</th>
                <th>Value at Risk</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const total = rtoReasons.reduce((s, r) => s + r.count, 0)
                return rtoReasons.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row.reason}</td>
                    <td style={{ color: '#ef4444', fontWeight: 600 }}>{row.count}</td>
                    <td>{Math.round(row.tonnage).toLocaleString()}</td>
                    <td style={{ color: '#ef4444', fontWeight: 600 }}>₹{Math.round(row.value).toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${total ? row.count / total * 100 : 0}%`, height: '100%', background: '#ef4444', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{total ? (row.count / total * 100).toFixed(1) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>
          <div style={{ marginTop: 12, padding: 16, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>RTO Reduction Suggestions</div>
            <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
              {rtoReasons.length > 0 && <li><strong style={{ color: '#f1f5f9' }}>Target #{1} reason:</strong> {rtoReasons[0].reason} ({rtoReasons[0].count} occurrences) — implement corrective action plan.</li>}
              <li><strong style={{ color: '#f1f5f9' }}>Improve packaging:</strong> Damage-related RTO can be reduced with better packaging and handling SOPs.</li>
              <li><strong style={{ color: '#f1f5f9' }}>Customer communication:</strong> Pre-delivery SMS/email with delivery window reduces rejection and RTO.</li>
              <li><strong style={{ color: '#f1f5f9' }}>City-specific stock allocation:</strong> High RTO rate cities need separate stock allocation.</li>
            </ul>
          </div>
        </div>
      )}

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">Recent RTO Orders</div>
          <div className="chart-period">Last 50 returned orders</div>
        </div>
        <table>
          <thead>
            <tr>
              <SortTh label="PO #" k="po" sort={rtoSort} />
              <SortTh label="Appt Date" k="apptdate" sort={rtoSort} />
              <SortTh label="City" k="city" sort={rtoSort} />
              <SortTh label="Platform" k="platform" sort={rtoSort} />
              <SortTh label="Product" k="product" sort={rtoSort} />
              <SortTh label="RTO Reason" k="reason" sort={rtoSort} />
              <SortTh label="Tonnage Lost" k="tonnage" sort={rtoSort} />
              <SortTh label="Value at Risk" k="value" sort={rtoSort} />
            </tr>
          </thead>
          <tbody>
            {applySort(rtoPOs, rtoSort, rtoAccessors).slice(0, 50).map((r, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r['PO Number']}</td>
                <td style={{ fontSize: 12, color: '#94a3b8' }}>{r['Appointment Date(MM-DD-YYYY)'] || '—'}</td>
                <td>{r['City'] || '—'}</td>
                <td>{r['Platform'] || '—'}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['Product'] || '—'}</td>
                <td style={{ color: '#ef4444' }}>{r['RTO Reason'] || '—'}</td>
                <td>{Math.round(toNumKG(r['RTO Tonnage (MT)'])).toLocaleString()} KG</td>
                <td style={{ color: '#ef4444', fontWeight: 600 }}>₹{Math.round(toNumKG(r['RTO Value at Risk'])).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function App() {
  const [data, setData] = useState([])
  const [rawCSV, setRawCSV] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')
  const [userEmail, setUserEmail] = useState('mohammed.r@gemedible.com')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [globalPlatform, setGlobalPlatform] = useState('All')

  const platforms = useMemo(() => {
    const set = new Set()
    data.forEach(r => { if (r['Platform']) set.add(r['Platform']) })
    return ['All', ...Array.from(set).sort()]
  }, [data])

  useEffect(() => {
    fetch(SHEET_URL)
      .then(r => r.text())
      .then(text => {
        setRawCSV(text)
        setData(parseCSV(text))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filteredData = useMemo(() => {
    if (globalPlatform === 'All') return data
    return data.filter(r => r['Platform'] === globalPlatform)
  }, [data, globalPlatform])

  const metrics = useMemo(() => {
    const poData = uniqueByPO(filteredData)
    const totalOrders = poData.length
    const totalTonnage = filteredData.reduce((s, r) => s + num(r['Tonnage']), 0)
    const totalBoxes = filteredData.reduce((s, r) => s + num(r['Box Count']), 0)
    const totalValue = filteredData.reduce((s, r) => s + num(r['PO Value with Tax']), 0)

    const statusCounts = {}
    poData.forEach(r => {
      const s = r['Status'] || 'Unknown'
      statusCounts[s] = (statusCounts[s] || 0) + 1
    })

    const delivered = filteredData.filter(r => r['Status'] === 'Delivered')
    const deliveredTonnage = delivered.reduce((s, r) => s + num(r['Tonnage']), 0)

    const cities = [...new Set(poData.map(r => r['City']).filter(Boolean))]

    const deliveredCount = poData.filter(r => r['Status'] === 'Delivered').length
    const rtoCount = poData.filter(r => r['Status'] === 'RTO').length
    const fillByPO = {}
    for (const r of filteredData) {
      if (r['Status'] !== 'Delivered') continue
      const po = r['PO Number']
      if (!po) continue
      if (!fillByPO[po]) fillByPO[po] = { qty: 0, rejected: 0 }
      fillByPO[po].qty += num(r['PO Qty'])
      fillByPO[po].rejected += num(r['Rejected Qty'])
    }
    const totalPOQty = Object.values(fillByPO).reduce((s, v) => s + v.qty, 0)
    const totalRejectedQty = Object.values(fillByPO).reduce((s, v) => s + v.rejected, 0)
    const avgFillRate = totalPOQty ? Math.round((totalPOQty - totalRejectedQty) / totalPOQty * 100) : 0

    return {
      totalOrders,
      totalTonnage: Math.round(totalTonnage),
      totalBoxes,
      totalValue: Math.round(totalValue),
      deliveredOrders: deliveredCount,
      rtoOrders: rtoCount,
      deliveredTonnage: Math.round(deliveredTonnage),
      statusCounts,
      cities: cities.length,
      avgFillRate: Math.round(avgFillRate),
    }
  }, [filteredData])

  const cityData = useMemo(() => {
    const map = {}
    for (const r of filteredData) {
      const c = r['City']; if (!c) continue
      if (!map[c]) map[c] = { city: c, orders: new Set(), tonnage: 0, delivered: 0, deliveredTonnage: 0 }
      map[c].orders.add(r['PO Number'])
      map[c].tonnage += num(r['Tonnage'])
      if (r['Status'] === 'Delivered') {
        map[c].delivered++
        map[c].deliveredTonnage += num(r['Tonnage'])
      }
    }
    return Object.values(map).map(x => ({ ...x, orders: x.orders.size })).sort((a, b) => b.orders - a.orders)
  }, [filteredData])

  const statusData = useMemo(() => {
    const poData = uniqueByPO(filteredData)
    const map = {}
    poData.forEach(r => {
      const s = r['Status'] || 'Unknown'
      map[s] = (map[s] || 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [filteredData])

  const recentOrders = useMemo(() => {
    const seen = new Set()
    return filteredData
      .map(r => ({ r, released: parseMMDDDate(r['PO Released Date(MM-DD-YYYY)']) }))
      .filter(x => x.released && !seen.has(x.r['PO Number']))
      .sort((a, b) => b.released - a.released)
      .slice(0, 10)
      .map(x => x.r)
  }, [filteredData])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100%', background: '#0f172a', color: '#94a3b8', fontSize: 18 }}>
        Loading dashboard data...
      </div>
    )
  }

  const closeNav = () => setMobileMenu(false)
  return (
    <>
      <div className={`mobile-overlay ${mobileMenu ? 'visible' : ''}`} onClick={closeNav} />
      <button className="menu-toggle" onClick={() => setMobileMenu(v => !v)}>☰</button>
      <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <button className="menu-close" onClick={closeNav}>✕</button>
        <div className="logo"><span className="brand-icon">✦</span> <span className="brand-gradient">ARRA BETTER LIVING</span></div>
        <div style={{ padding: '8px 16px 4px' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Platform Filter</div>
          <select value={globalPlatform} onChange={e => setGlobalPlatform(e.target.value)} style={{ width: '100%', background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#f1f5f9', padding: '8px 10px', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <nav>
          <a href="#" className={tab === 'dashboard' ? 'active' : ''} onClick={e => { e.preventDefault(); setTab('dashboard'); closeNav() }}><span className="icon">📈</span> Dashboard</a>
          <a href="#" className={tab === 'orders' ? 'active' : ''} onClick={e => { e.preventDefault(); setTab('orders'); closeNav() }}><span className="icon">📦</span> Orders</a>
          <a href="#" className={tab === 'inventory' ? 'active' : ''} onClick={e => { e.preventDefault(); setTab('inventory'); closeNav() }}><span className="icon">🏭</span> Inventory</a>
           <a href="#" className={tab === 'logistics' ? 'active' : ''} onClick={e => { e.preventDefault(); setTab('logistics'); closeNav() }}><span className="icon">🚚</span> Logistics</a>
            <a href="#" className={tab === 'dispatch' ? 'active' : ''} onClick={e => { e.preventDefault(); setTab('dispatch'); closeNav() }}><span className="icon">📤</span> Dispatch</a>
           <a href="#" className={tab === 'reports' ? 'active' : ''} onClick={e => { e.preventDefault(); setTab('reports'); closeNav() }}><span className="icon">📋</span> Reports</a>
            <a href="#" className={tab === 'rto' ? 'active' : ''} onClick={e => { e.preventDefault(); setTab('rto'); closeNav() }}><span className="icon">↩️</span> RTO</a>
            <a href="#" className={tab === 'finance' ? 'active' : ''} onClick={e => { e.preventDefault(); setTab('finance'); closeNav() }}><span className="icon">💰</span> Finance</a>
            <a href="#" className={tab === 'performance' ? 'active' : ''} onClick={e => { e.preventDefault(); setTab('performance'); closeNav() }}><span className="icon">🔬</span> Performance</a>
           <a href="#" className={tab === 'settings' ? 'active' : ''} onClick={e => { e.preventDefault(); setTab('settings'); closeNav() }}><span className="icon">⚙️</span> Settings</a>
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #334155' }}>
          <button onClick={() => {
            const blob = new Blob([rawCSV], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = 'full_dataset.csv'; a.click()
            URL.revokeObjectURL(url)
          }} style={{ width: '100%', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            ⬇ Download Full Data
          </button>
        </div>
      </aside>

      <UserContext.Provider value={{ userEmail, setUserEmail }}>
        <div className="main-content">
          {tab === 'dashboard' && <DashboardTab data={filteredData} metrics={metrics} cityData={cityData} statusData={statusData} recentOrders={recentOrders} platformFilter={globalPlatform} />}
          {tab === 'orders' && <OrdersTab data={filteredData} platformFilter={globalPlatform} />}
          {tab === 'inventory' && <InventoryTab data={filteredData} />}
          {tab === 'logistics' && <LogisticsTab data={filteredData} />}
          {tab === 'dispatch' && <DispatchTab data={filteredData} rawCSV={rawCSV} />}
          {tab === 'reports' && <ReportsTab data={filteredData} metrics={metrics} platformFilter={globalPlatform} />}
          {tab === 'rto' && <RTOTab data={filteredData} />}
          {tab === 'finance' && <FinanceTab data={filteredData} />}
          {tab === 'performance' && <PerformanceTab data={filteredData} platformFilter={globalPlatform} />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </UserContext.Provider>
    </>
  )
}

export default App