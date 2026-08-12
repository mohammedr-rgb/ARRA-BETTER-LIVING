import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ComposedChart, Line,
} from 'recharts'
import { num, parseDate, parseMMDDDate, uniqueByPO, sumPOField, sumField, csvEscape, MONTH_NAMES } from '../lib/utils'
import { Tooltip, TooltipRow, StatCard, StatusPill, CSVButton, ProfileSection } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { PONumberLink } from '../components/PONumberLink'
import { ExecutiveSummary } from '../components/ExecutiveSummary'
import { FulfillmentMetrics } from '../components/FulfillmentMetrics'
import { BoardReport } from '../components/BoardReport'

const PIE_COLORS = {
  Delivered: '#22c55e',
  'In-Transit': '#3b82f6',
  RTO: '#ef4444',
  Pending: '#eab308',
  Processing: '#a855f7',
  Unknown: '#64748b',
}

export default function DashboardTab({ data, metrics, cityData, statusData, recentOrders, platformFilter, onOpenPO, searchQuery = '', onSearch }) {
  const [hoverPlatform, setHoverPlatform] = useState(null)
  const [drill, setDrill] = useState(null)
  const [cityMetric, setCityMetric] = useState('orders')

  const drillPOs = useMemo(() => {
    if (!drill) return []
    const poSet = new Set()
    for (const r of data) {
      if (drill.city && r['City'] !== drill.city) continue
      if (drill.status && (r['Status'] || '') !== drill.status) continue
      poSet.add(r['PO Number'])
    }
    const seen = new Set()
    return data.filter(r => {
      const po = r['PO Number']
      if (!po || !poSet.has(po) || seen.has(po)) return false
      seen.add(po)
      return true
    })
  }, [data, drill])

  const drillColumns = [
    { key: 'po', label: 'PO #', accessor: r => r['PO Number'], render: r => <PONumberLink row={r} onOpenPO={onOpenPO} /> },
    { key: 'city', label: 'City', accessor: r => r['City'] },
    { key: 'platform', label: 'Platform', accessor: r => r['Platform'] },
    { key: 'product', label: 'Product', accessor: r => r['Product'], render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r['Product']}</span> },
    { key: 'qty', label: 'Qty', accessor: r => num(r['PO Qty']), align: 'right' },
    { key: 'tonnage', label: 'Tonnage', accessor: r => num(r['Tonnage']), align: 'right' },
    { key: 'value', label: 'Value', accessor: r => num(r['PO Value with Tax']), align: 'right', render: r => '₹' + num(r['PO Value with Tax']).toLocaleString() },
    { key: 'released', label: 'Released', accessor: r => r['PO Released Date(MM-DD-YYYY)'] },
    { key: 'status', label: 'Status', accessor: r => r['Status'], render: r => <StatusPill status={r['Status']} /> },
  ]

  const platformPerf = useMemo(() => {
    const now = new Date()
    const currentMk = now.getFullYear() * 12 + now.getMonth()
    const allRows = data.filter(r => {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      return d && (d.getFullYear() * 12 + d.getMonth()) === currentMk
    })
    const poRows = uniqueByPO(allRows)
    const map = {}
    for (const r of poRows) {
      const p = r['Platform'] || 'Unknown'
      if (!map[p]) map[p] = { platform: p, orders: 0, delivered: 0, rto: 0, tonnage: 0, value: 0 }
      map[p].orders++
      map[p].value += num(r['PO Value with Tax'])
      if (r['Status'] === 'Delivered') map[p].delivered++
      if (r['Status'] === 'RTO') map[p].rto++
    }
    for (const r of allRows) {
      const p = r['Platform'] || 'Unknown'
      if (!map[p]) continue
      map[p].tonnage += num(r['Tonnage'])
    }
    return Object.values(map).sort((a, b) => b.orders - a.orders)
  }, [data])

  const monthData = useMemo(() => {
    const map = {}
    data.forEach(r => {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!d) return
      const mk = d.getFullYear() * 12 + d.getMonth()
      if (!map[mk]) map[mk] = { orders: new Set(), poValues: {}, tonnage: 0, boxes: 0, delivered: new Set(), rto: new Set(), cities: new Set(), platforms: {}, platformValues: {} }
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
      if (!cell.platformValues[p]) cell.platformValues[p] = {}
      if (po && pv > 0 && pv > (cell.platformValues[p][po] || 0)) cell.platformValues[p][po] = pv
    })
    return Object.entries(map).sort((a, b) => a[0] - b[0]).map(([mk, c]) => {
      const m = mk % 12
      const y = Math.floor(mk / 12)
      const platforms = Object.entries(c.platforms).map(([name, set]) => ({ name, orders: set.size })).sort((a, b) => b.orders - a.orders)
      const platformValues = Object.fromEntries(
        Object.entries(c.platformValues).map(([name, vmap]) => [name, Math.round(Object.values(vmap).reduce((s, v) => s + v, 0))])
      )
      return {
        key: String(mk),
        label: `${MONTH_NAMES[m]} ${String(y).slice(2)}`,
        orders: c.orders.size,
        tonnage: Math.round(c.tonnage),
        boxes: Math.round(c.boxes),
        value: Math.round(Object.values(c.poValues).reduce((s, v) => s + v, 0)),
        delivered: c.delivered.size,
        rto: c.rto.size,
        cities: c.cities.size,
        platforms,
        platformValues,
        ...platformValues,
        platformLabel: platforms.map(x => `${x.name} (${x.orders})`).join(', '),
        deliveryRate: (c.delivered.size + c.rto.size) ? Math.round(c.delivered.size / (c.delivered.size + c.rto.size) * 100) : null,
      }
    })
  }, [data])

  const last3Months = useMemo(() => monthData.slice(-3), [monthData])

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
      value: sumPOField(active, 'PO Value with Tax'),
      tonnage: sumField(active, 'Tonnage'),
      boxes: sumField(active, 'Box Count'),
      fillRate: totalQty ? Math.round(totalDel / totalQty * 100) : null,
    }
  }, [data])

  const periodDeltas = useMemo(() => {
    let maxDate = null
    for (const r of data) {
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      if (d && (!maxDate || d > maxDate)) maxDate = d
    }
    if (!maxDate) return { orders: null, value: null, tonnage: null, boxes: null, fillRate: null }
    const currStart = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate() - 29)
    const prevEnd = new Date(currStart.getFullYear(), currStart.getMonth(), currStart.getDate() - 1)
    const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() - 29)
    const inWindow = (start, end) => data.filter(r => {
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      return d && d >= start && d <= end
    })
    const stats = (rows) => {
      const po = uniqueByPO(rows)
      const fillByPO = {}
      for (const r of rows) {
        if (r['Status'] !== 'Delivered') continue
        const poKey = r['PO Number']
        if (!poKey) continue
        if (!fillByPO[poKey]) fillByPO[poKey] = { qty: 0, rejected: 0 }
        fillByPO[poKey].qty += num(r['PO Qty'])
        fillByPO[poKey].rejected += num(r['Rejected Qty'])
      }
      const tq = Object.values(fillByPO).reduce((s, v) => s + v.qty, 0)
      const tr = Object.values(fillByPO).reduce((s, v) => s + v.rejected, 0)
      return {
        orders: po.length,
        value: sumPOField(rows, 'PO Value with Tax'),
        tonnage: sumField(rows, 'Tonnage'),
        boxes: sumField(rows, 'Box Count'),
        fillRate: tq ? Math.round((tq - tr) / tq * 100) : null,
      }
    }
    const curr = stats(inWindow(currStart, maxDate))
    const prev = stats(inWindow(prevStart, prevEnd))
    const delta = (c, p) => (p && p > 0) ? Math.round((c - p) / p * 1000) / 10 : null
    return {
      orders: delta(curr.orders, prev.orders),
      value: delta(curr.value, prev.value),
      tonnage: delta(curr.tonnage, prev.tonnage),
      boxes: delta(curr.boxes, prev.boxes),
      fillRate: curr.fillRate !== null && prev.fillRate !== null ? delta(curr.fillRate, prev.fillRate) : null,
    }
  }, [data])

  const insights = useMemo(() => {
    const list = []
    const now = new Date()
    const poRows = uniqueByPO(data)

    if (monthData.length >= 2) {
      const m0 = monthData[0]
      const m1 = monthData[1]
      if (m1.orders > 0 && m0.orders !== m1.orders) {
        const chg = Math.round((m0.orders - m1.orders) / m1.orders * 100)
        list.push({ type: chg > 0 ? 'good' : 'warn', text: `Orders in ${m0.label} ${chg > 0 ? 'up' : 'down'} ${Math.abs(chg)}% vs ${m1.label}` })
      }
      if (m1.value > 0 && m0.value !== m1.value) {
        const vchg = Math.round((m0.value - m1.value) / m1.value * 100)
        list.push({ type: vchg > 0 ? 'good' : 'warn', text: `Value in ${m0.label} ${vchg > 0 ? 'up' : 'down'} ${Math.abs(vchg)}% vs ${m1.label}` })
      }
    }

    const cityStats = {}
    for (const r of poRows) {
      const c = r['City']; if (!c) continue
      if (!cityStats[c]) cityStats[c] = { city: c, orders: 0, rto: 0 }
      cityStats[c].orders++
      if (r['Status'] === 'RTO') cityStats[c].rto++
    }
    const riskyCities = Object.values(cityStats).filter(c => c.orders >= 3 && c.rto / c.orders >= 0.25)
    if (riskyCities.length) {
      const top = riskyCities.sort((a, b) => b.rto / b.orders - a.rto / a.orders)[0]
      list.push({ type: 'danger', text: `High RTO risk in ${top.city}: ${top.rto} of ${top.orders} orders returned (${Math.round(top.rto / top.orders * 100)}%)` })
    }

    const fillMap = {}
    for (const r of poRows) {
      const p = r['Product']; if (!p) continue
      if (!fillMap[p]) fillMap[p] = { po: 0, del: 0, count: 0 }
      fillMap[p].po += num(r['PO Qty'])
      fillMap[p].del += num(r['Delivered QTY'])
      fillMap[p].count++
    }
    const lowFill = Object.entries(fillMap)
      .filter(([, v]) => v.count >= 2 && v.po > 0 && v.del / v.po < 0.7)
      .sort((a, b) => a[1].del / a[1].po - b[1].del / b[1].po)[0]
    if (lowFill) {
      const name = lowFill[0].length > 38 ? lowFill[0].slice(0, 38) + '…' : lowFill[0]
      list.push({ type: 'danger', text: `Low fill rate: "${name}" at ${Math.round(lowFill[1].del / lowFill[1].po * 100)}% (target ≥70%)` })
    }

    const platStats = {}
    for (const r of poRows) {
      const p = r['Platform'] || 'Unknown'
      if (!platStats[p]) platStats[p] = { delivered: 0, rto: 0 }
      if (r['Status'] === 'Delivered') platStats[p].delivered++
      if (r['Status'] === 'RTO') platStats[p].rto++
    }
    const weakPlat = Object.entries(platStats)
      .filter(([, v]) => v.delivered + v.rto >= 3 && v.delivered / (v.delivered + v.rto) < 0.6)
      .sort((a, b) => a[1].delivered / (a[1].delivered + a[1].rto) - b[1].delivered / (b[1].delivered + b[1].rto))[0]
    if (weakPlat) {
      list.push({ type: 'warn', text: `Low delivery rate on ${weakPlat[0]}: ${Math.round(weakPlat[1].delivered / (weakPlat[1].delivered + weakPlat[1].rto) * 100)}% (${weakPlat[1].delivered} delivered of ${weakPlat[1].delivered + weakPlat[1].rto} closed)` })
    }

    const openPOs = poRows.filter(r => !['Delivered', 'RTO'].includes(r['Status'] || ''))
    let stale = 0
    for (const r of openPOs) {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (d && (now - d) / 86400000 > 30) stale++
    }
    if (stale > 0) list.push({ type: 'warn', text: `${stale} open POs are older than 30 days — prioritize dispatch` })

    return list.slice(0, 6)
  }, [data, monthData])

  const trendMonths = useMemo(() => monthData.slice(0, 6), [monthData])

  const monthCSVRows = () => {
    const rows = ['Month-wise Overview']
    rows.push('')
    rows.push('Month,Platforms,Orders,Tonnage KG,Boxes,Value,Delivered,RTO,Delivery Rate %')
    last3Months.forEach(r => {
      rows.push(`${csvEscape(r.label)},${csvEscape(r.platformLabel)},${r.orders},${r.tonnage},${r.boxes},${r.value},${r.delivered},${r.rto},${r.deliveryRate === null ? '' : r.deliveryRate}`)
    })
    return rows
  }

  const tooltipBox = { position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100 }

  return (
    <>
      <header>
        <div>
          <h1>Sales Dashboard</h1>
          <div className="date">{platformFilter !== 'All' ? `Platform: ${platformFilter} • ` : ''}{metrics.totalOrders} orders across {metrics.cities} cities</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {platformPerf.map(p => {
              const dr = (p.delivered + p.rto) ? (p.delivered / (p.delivered + p.rto) * 100).toFixed(0) : '—'
              const show = hoverPlatform === p.platform
              return (
                <div
                  key={p.platform}
                  style={{ position: 'relative' }}
                  tabIndex={0}
                  role="button"
                  aria-haspopup="true"
                  aria-expanded={show}
                  onMouseEnter={() => setHoverPlatform(p.platform)}
                  onMouseLeave={() => setHoverPlatform(null)}
                  onFocus={() => setHoverPlatform(p.platform)}
                  onBlur={() => setHoverPlatform(null)}
                  onKeyDown={e => { if (e.key === 'Escape') setHoverPlatform(null) }}
                >
                  <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', cursor: 'default' }}>
                    {p.platform} • {p.orders} • {Math.round(p.tonnage)}KG • {dr}{dr !== '—' ? '%' : ''}
                  </span>
                  {show && (
                    <Tooltip style={tooltipBox}>
                      <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>{p.platform}</div>
                      <TooltipRow label="Orders" value={p.orders} />
                      <TooltipRow label="Delivered" value={p.delivered} valueColor="#22c55e" />
                      <TooltipRow label="RTO" value={p.rto} valueColor="#ef4444" />
                      <TooltipRow label="Delivery Rate" value={(p.delivered + p.rto) ? ((p.delivered / (p.delivered + p.rto) * 100).toFixed(1) + '%') : '—'} valueColor={(p.delivered + p.rto) ? (p.delivered / (p.delivered + p.rto) * 100 >= 80 ? '#22c55e' : '#eab308') : '#94a3b8'} />
                      <TooltipRow label="Tonnage" value={Math.round(p.tonnage) + ' KG'} />
                      <TooltipRow label="Value" value={'₹' + Math.round(p.value).toLocaleString()} valueColor="#22c55e" />
                    </Tooltip>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {onSearch && (
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => onSearch(e.target.value)}
                placeholder="🔍 Search PO #, product, city, status…"
                style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, color: '#f1f5f9', padding: '10px 14px', fontSize: 13, minWidth: 280, outline: 'none' }}
              />
              {searchQuery && (
                <span
                  onClick={() => onSearch('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', cursor: 'pointer', fontSize: 12, background: '#334155', borderRadius: 50, padding: '1px 6px' }}
                  title="Clear search"
                >
                  ✕
                </span>
              )}
            </div>
          )}
          <BoardReport data={data} metrics={metrics} />
          <ProfileSection />
        </div>
      </header>

       {insights.length > 0 && (
        <div style={{ marginBottom: 20, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>💡 Insights & Alerts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.map((s, i) => {
              const bg = s.type === 'danger' ? 'rgba(239,68,68,0.12)' : s.type === 'warn' ? 'rgba(234,179,8,0.12)' : 'rgba(34,197,94,0.12)'
              const color = s.type === 'danger' ? '#ef4444' : s.type === 'warn' ? '#eab308' : '#22c55e'
              const icon = s.type === 'danger' ? '🔴' : s.type === 'warn' ? '🟡' : '🟢'
              return (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: bg, border: `1px solid ${color}33`, borderRadius: 10, padding: '10px 14px' }}>
                  <span style={{ fontSize: 14, lineHeight: '20px' }}>{icon}</span>
                  <span style={{ fontSize: 13, color: '#f1f5f9', lineHeight: '20px' }}>{s.text}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <FulfillmentMetrics data={data} />

      <div className="stats-grid">
        <StatCard
          label="Total Orders" icon="📋" color="#3b82f6"
          value={metrics.totalOrders} change={`▲ ${metrics.deliveredOrders} delivered`} changeColor="#22c55e"
          delta={periodDeltas.orders}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Current Open Orders</div>
              <TooltipRow label="Open Orders" value={openMetrics.orders} valueColor="#3b82f6" />
              <TooltipRow label="Open Value" value={'₹' + Math.round(openMetrics.value).toLocaleString()} valueColor="#22c55e" />
              <TooltipRow label="Open Tonnage" value={Math.round(openMetrics.tonnage) + ' KG'} />
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
        <StatCard
          label="PO Value (with Tax)" icon="💰" color="#22c55e"
          value={'₹' + metrics.totalValue.toLocaleString()} change="▲ Total value" changeColor="#22c55e"
          delta={periodDeltas.value}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Current Open PO Value</div>
              <TooltipRow label="Open Value" value={'₹' + Math.round(openMetrics.value).toLocaleString()} valueColor="#22c55e" />
              <TooltipRow label="Open Tonnage" value={Math.round(openMetrics.tonnage) + ' KG'} />
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
        <StatCard
          label="Total Tonnage" icon="⚖️" color="#a855f7"
          value={metrics.totalTonnage + ' KG'} change={`▲ ${metrics.deliveredTonnage} KG delivered`} changeColor="#22c55e"
          delta={periodDeltas.tonnage}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Current Open Tonnage</div>
              <TooltipRow label="Open Tonnage" value={Math.round(openMetrics.tonnage) + ' KG'} valueColor="#a855f7" />
              <TooltipRow label="Open Value" value={'₹' + Math.round(openMetrics.value).toLocaleString()} />
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
        <StatCard
          label="Box Count" icon="📦" color="#eab308"
          value={metrics.totalBoxes} change="▲ Total boxes shipped" changeColor="#22c55e"
          delta={periodDeltas.boxes}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Current Open Box Count</div>
              <TooltipRow label="Open Boxes" value={Math.round(openMetrics.boxes)} valueColor="#eab308" />
              <TooltipRow label="Open Value" value={'₹' + Math.round(openMetrics.value).toLocaleString()} />
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
        <StatCard
          label="Fill Rate" icon="🎯" color="#6366f1"
          value={metrics.avgFillRate + '%'} valueColor={metrics.avgFillRate >= 80 ? '#22c55e' : metrics.avgFillRate >= 50 ? '#eab308' : '#ef4444'}
          change="Average fill rate" changeColor="#94a3b8"
          delta={periodDeltas.fillRate}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Current Open Fill Rate</div>
              <TooltipRow label="Open Fill Rate" value={openMetrics.fillRate !== null ? openMetrics.fillRate + '%' : '—'} valueColor="#6366f1" />
              <TooltipRow label="Open Orders" value={openMetrics.orders} valueColor="#3b82f6" />
              <TooltipRow label="Open Tonnage" value={Math.round(openMetrics.tonnage) + ' KG'} />
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Orders by City</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {[['orders', 'Orders'], ['tonnage', 'Tonnage'], ['value', 'Value']].map(([k, lbl]) => (
                <button
                  key={k}
                  onClick={() => setCityMetric(k)}
                  style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid ' + (cityMetric === k ? '#3b82f6' : '#334155'), background: cityMetric === k ? 'rgba(59,130,246,0.15)' : '#1e293b', color: cityMetric === k ? '#3b82f6' : '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="city" stroke="#64748b" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={80} interval={0} />
              <YAxis stroke="#64748b" tick={{ fontSize: 12 }} tickFormatter={v => cityMetric === 'value' ? '₹' + (v / 1000 >= 100 ? Math.round(v / 100000) + 'L' : (v / 1000).toFixed(0) + 'k') : v.toLocaleString()} />
              <ReTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload
                  const metricVal = cityMetric === 'value' ? '₹' + row.value.toLocaleString() : cityMetric === 'tonnage' ? Math.round(row.tonnage).toLocaleString() + ' KG' : row.orders
                  const metricColor = cityMetric === 'value' ? '#22c55e' : cityMetric === 'tonnage' ? '#a855f7' : '#3b82f6'
                  return (
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: '#f1f5f9' }}>{row.city}</div>
                      <div style={{ color: '#94a3b8' }}>Orders: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{row.orders}</span></div>
                      <div style={{ color: '#94a3b8' }}>Tonnage: <span style={{ color: '#a855f7', fontWeight: 600 }}>{Math.round(row.tonnage)} KG</span></div>
                      <div style={{ color: '#94a3b8' }}>Value: <span style={{ color: '#22c55e', fontWeight: 600 }}>₹{row.value.toLocaleString()}</span></div>
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #334155', color: '#94a3b8', fontSize: 12 }}>Metric: <span style={{ color: metricColor, fontWeight: 600 }}>{metricVal}</span></div>
                    </div>
                  )
                }}
              />
              <Bar dataKey={cityMetric} fill={cityMetric === 'value' ? '#22c55e' : cityMetric === 'tonnage' ? '#a855f7' : '#3b82f6'} radius={[6, 6, 0, 0]} name={cityMetric} onClick={(d) => d && d.payload && setDrill({ city: d.payload.city, status: null })} style={{ cursor: 'pointer' }} />
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
                onClick={(d) => d && d.payload && setDrill({ city: null, status: d.payload.name })}
                style={{ cursor: 'pointer' }}
              >
                {statusData.map((entry) => (
                  <Cell key={entry.name} fill={PIE_COLORS[entry.name] || '#64748b'} />
                ))}
              </Pie>
              <ReTooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {drill && (
        <div className="recent-orders" style={{ marginTop: 20 }}>
          <div className="orders-header">
            <div className="orders-title">
              {drill.city ? <>📍 Orders in <span style={{ color: '#3b82f6' }}>{drill.city}</span></> : <>🔎 {drill.status} Orders</>}
              <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b', fontWeight: 400 }}>{uniqueByPO(drillPOs).length} unique POs</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="chart-period">Click a row for full PO details</div>
              <button onClick={() => setDrill(null)} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✕ Clear</button>
            </div>
          </div>
          <DataTable
            columns={drillColumns}
            rows={drillPOs}
            pageSize={10}
            filename={drill.city ? `orders_${drill.city.replace(/[^A-Za-z0-9]/g, '_')}.csv` : `orders_${drill.status.replace(/[^A-Za-z0-9]/g, '_')}.csv`}
            onRowClick={onOpenPO}
            emptyMessage="No matching POs"
          />
        </div>
      )}

      {trendMonths.length > 1 && (
        <div className="chart-card" style={{ width: '100%', marginTop: 20 }}>
          <div className="chart-header">
            <div className="chart-title">Monthly Trend — Orders &amp; Value</div>
            <div className="chart-period">Last {trendMonths.length} months</div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={trendMonths}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fontSize: 12 }} tickFormatter={(v) => '₹' + (v / 1000).toFixed(0) + 'k'} />
              <ReTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload
                  return (
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: '#f1f5f9' }}>{row.label}</div>
                      <div style={{ color: '#94a3b8' }}>Orders: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{row.orders}</span></div>
                      <div style={{ color: '#94a3b8' }}>Value: <span style={{ color: '#22c55e', fontWeight: 600 }}>₹{row.value.toLocaleString()}</span></div>
                      <div style={{ color: '#94a3b8' }}>Tonnage: <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{row.tonnage} KG</span></div>
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>} />
              <Bar yAxisId="left" dataKey="orders" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Orders" />
              <Line yAxisId="right" type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Value (₹)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="recent-orders" style={{ marginTop: 20, overflowX: 'auto' }}>
        <div className="orders-header">
          <div className="orders-title">Month-wise Overview</div>
          <div className="chart-period">Last 3 months • Monthly sales performance</div>
          <CSVButton makeRows={monthCSVRows} filename="monthly_overview.csv" />
        </div>
        {last3Months.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={last3Months}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
              <ReTooltip
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
       </div>

       <div className="recent-orders">
         <div className="orders-header">
           <div className="orders-title">Recent PO Releases</div>
           <div className="chart-period">Latest {recentOrders.length} releases • click a row for details</div>
         </div>
         <DataTable
           columns={[
             { key: 'po', label: 'PO #', accessor: r => r['PO Number'], render: r => <PONumberLink row={r} onOpenPO={onOpenPO} /> },
             { key: 'city', label: 'City', accessor: r => r['City'] },
             { key: 'platform', label: 'Platform', accessor: r => r['Platform'] },
             { key: 'product', label: 'Product', accessor: r => r['Product'], render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r['Product']}</span> },
             { key: 'qty', label: 'Qty', accessor: r => num(r['PO Qty']), align: 'right' },
             { key: 'tonnage', label: 'Tonnage', accessor: r => num(r['Tonnage']), align: 'right' },
             { key: 'value', label: 'Value', accessor: r => num(r['PO Value with Tax']), align: 'right', render: r => '₹' + num(r['PO Value with Tax']).toLocaleString() },
             { key: 'released', label: 'Released', accessor: r => r['PO Released Date(MM-DD-YYYY)'] },
             { key: 'appt', label: 'Appt Date', accessor: r => r['Appointment Date(MM-DD-YYYY)'] || '—' },
             { key: 'apptid', label: 'Appt ID', accessor: r => r['Appointment ID'] || '—' },
             { key: 'status', label: 'Status', accessor: r => r['Status'], render: r => <StatusPill status={r['Status']} /> },
           ]}
           rows={recentOrders}
           pageSize={10}
           filename="recent_po_releases.csv"
           onRowClick={onOpenPO}
           emptyMessage="No recent releases"
         />
        </div>
     </>
   )
 }
