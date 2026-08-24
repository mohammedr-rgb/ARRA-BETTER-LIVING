import { useMemo, useState } from 'react'
import { num, parseMMDDDate, uniqueByPO, productSummary } from '../lib/utils'

const SEV = {
  danger: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)', icon: '🔴' },
  warn: { color: '#eab308', bg: 'rgba(234,179,8,0.10)', border: 'rgba(234,179,8,0.25)', icon: '🟡' },
  info: { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.25)', icon: '🔵' },
  good: { color: '#22c55e', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.25)', icon: '🟢' },
}

function InsightCard({ insight, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const s = SEV[insight.severity] || SEV.info
  const hasRows = insight.rows && insight.rows.length > 0

  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={() => hasRows && setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', background: 'transparent', border: 'none',
          cursor: hasRows ? 'pointer' : 'default', textAlign: 'left', color: 'inherit',
        }}
        aria-expanded={hasRows ? open : undefined}
      >
        <span style={{ fontSize: 13 }}>{insight.icon || s.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{insight.title}</div>
          <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2, lineHeight: 1.4 }}>{insight.summary}</div>
        </div>
        {insight.metric && (
          <span style={{ fontSize: 18, fontWeight: 800, color: s.color, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {insight.metric}
          </span>
        )}
        {hasRows && (
          <span style={{ fontSize: 10, color: '#64748b', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
        )}
      </button>
      {open && hasRows && (
        <div style={{ padding: '4px 14px 12px', borderTop: `1px solid ${s.border}` }}>
          {insight.rows.map((row, i) => (
            <div
              key={i}
              onClick={row.onClick}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px',
                borderBottom: i < insight.rows.length - 1 ? '1px solid rgba(51,65,85,0.4)' : 'none',
                cursor: row.onClick ? 'pointer' : 'default',
                fontSize: 12, color: '#cbd5e1',
              }}
              onMouseEnter={e => { if (row.onClick) e.currentTarget.style.background = 'rgba(59,130,246,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {row.cells.map((c, ci) => (
                <span
                  key={ci}
                  style={{
                    flex: c.flex, textAlign: c.align || 'left',
                    color: c.color || '#cbd5e1', fontWeight: c.bold ? 700 : 400,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontVariantNumeric: c.numeric ? 'tabular-nums' : undefined,
                  }}
                >
                  {c.text}
                </span>
              ))}
            </div>
          ))}
          {insightsFooter(insight)}
        </div>
      )}
    </div>
  )
}

function insightsFooter(insight) {
  if (!insight.footer) return null
  return <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(51,65,85,0.3)' }}>{insight.footer}</div>
}

function rowCells(...cells) {
  return { cells: cells.map(c => (typeof c === 'string' || typeof c === 'number' ? { text: c } : c)) }
}

export function InsightsPanel({ periodData, data, onOpenPO, monthData }) {
  const insights = useMemo(() => {
    const list = []
    const now = new Date()
    const poRows = uniqueByPO(periodData)
    const allPoRows = uniqueByPO(data)

    // ── 1. Near Expiry (3 days + expired) — operational, uses all data ──
    const expiryBuckets = { expired: [], '0-3d': [] }
    for (const r of data) {
      const po = r['PO Number']; if (!po) continue
      const exp = parseMMDDDate(r['Expiry Date(MM-DD-YYYY)']); if (!exp) continue
      const days = Math.floor((exp - now) / 86400000)
      if (days < 0) expiryBuckets.expired.push({ r, days })
      else if (days <= 3) expiryBuckets['0-3d'].push({ r, days })
    }
    const expiryTotal = expiryBuckets.expired.length + expiryBuckets['0-3d'].length
    if (expiryTotal > 0) {
      const poSeen = new Set()
      const rows = []
      ;[...expiryBuckets.expired.sort((a, b) => a.days - b.days), ...expiryBuckets['0-3d'].sort((a, b) => a.days - b.days)].forEach(({ r, days }) => {
        const po = r['PO Number']
        if (poSeen.has(po)) return
        poSeen.add(po)
        const v = num(r['PO Value with Tax'])
        rows.push(rowCells(
          { text: days < 0 ? 'Expired' : `${days}d left`, color: days < 0 ? '#ef4444' : '#eab308', bold: true, flex: '0 0 80px' },
          { text: po, color: '#60a5fa', bold: true, flex: '0 0 130px' },
          { text: (r['Product'] || '').slice(0, 28), flex: 1 },
          { text: r['Platform'] || '—', color: '#a78bfa', flex: '0 0 80px' },
          { text: '₹' + Math.round(v).toLocaleString(), color: '#22c55e', align: 'right', numeric: true, flex: '0 0 100px' },
        ))
        rows[rows.length - 1].onClick = () => onOpenPO(r)
      })
      list.push({
        severity: 'danger',
        icon: '⏳',
        title: 'Near Expiry / Expired',
        summary: `${expiryBuckets.expired.length} expired, ${expiryBuckets['0-3d'].length} expiring within 3 days`,
        metric: expiryTotal,
        rows: rows.slice(0, 8),
        footer: `Total value at risk: ₹${Math.round([...expiryBuckets.expired, ...expiryBuckets['0-3d']].reduce((s, x) => s + num(x.r['PO Value with Tax']), 0)).toLocaleString()}`,
      })
    }

    // ── 2. RTO Aging — age of RTO'd orders since release ──
    const rtoRows = allPoRows.filter(r => r['Status'] === 'RTO')
    const rtoBuckets = { '0-7d': 0, '8-14d': 0, '15-30d': 0, '31-60d': 0, '60d+': 0 }
    const rtoAged = []
    for (const r of rtoRows) {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)']); if (!d) continue
      const days = Math.floor((now - d) / 86400000)
      if (days <= 7) rtoBuckets['0-7d']++
      else if (days <= 14) rtoBuckets['8-14d']++
      else if (days <= 30) rtoBuckets['15-30d']++
      else if (days <= 60) rtoBuckets['31-60d']++
      else rtoBuckets['60d+']++
      rtoAged.push({ r, days })
    }
    if (rtoRows.length > 0) {
      const oldest = rtoAged.sort((a, b) => b.days - a.days).slice(0, 6)
      const rows = oldest.map(({ r, days }) => rowCells(
        { text: `${days}d`, color: days > 30 ? '#ef4444' : days > 14 ? '#f97316' : '#eab308', bold: true, flex: '0 0 60px' },
        { text: r['PO Number'], color: '#60a5fa', bold: true, flex: '0 0 130px' },
        { text: r['City'] || '—', flex: '0 0 90px' },
        { text: r['Platform'] || '—', color: '#a78bfa', flex: '0 0 80px' },
        { text: '₹' + Math.round(num(r['PO Value with Tax'])).toLocaleString(), color: '#22c55e', align: 'right', numeric: true, flex: '0 0 100px' },
      ))
      rows.forEach(row => { row.onClick = () => onOpenPO(oldest.find(o => o.r['PO Number'] === row.cells[1].text).r) })
      const stuck = rtoBuckets['31-60d'] + rtoBuckets['60d+']
      list.push({
        severity: stuck > 0 ? 'danger' : 'warn',
        icon: '↩️',
        title: 'RTO Aging',
        summary: `${rtoRows.length} RTO'd orders • ${stuck} stuck >30 days • capital tied up`,
        metric: rtoRows.length,
        rows,
        footer: `Buckets: 0-7d: ${rtoBuckets['0-7d']} • 8-14d: ${rtoBuckets['8-14d']} • 15-30d: ${rtoBuckets['15-30d']} • 31-60d: ${rtoBuckets['31-60d']} • 60d+: ${rtoBuckets['60d+']}`,
      })
    }

    // ── 3. Top Products by sales (global ranking) ──
    const prodData = productSummary(periodData).filter(p => p.value > 0)
    if (prodData.length > 0) {
      const top = prodData.slice(0, 5)
      const rows = top.map((p, i) => rowCells(
        { text: `#${i + 1}`, color: '#22c55e', bold: true, flex: '0 0 30px' },
        { text: p.product.slice(0, 32), flex: 1 },
        { text: Math.round(p.tonnage) + ' KG', color: '#a78bfa', align: 'right', numeric: true, flex: '0 0 80px' },
        { text: '₹' + Math.round(p.value).toLocaleString(), color: '#22c55e', align: 'right', bold: true, numeric: true, flex: '0 0 110px' },
      ))
      const topVal = Math.round(top.reduce((s, p) => s + p.value, 0))
      const totalVal = Math.round(prodData.reduce((s, p) => s + p.value, 0))
      list.push({
        severity: 'good',
        icon: '🏆',
        title: 'Top Products by Sales',
        summary: `Top ${top.length} products = ₹${topVal.toLocaleString()} (${totalVal ? Math.round(topVal / totalVal * 100) : 0}% of total)`,
        metric: `₹${(topVal / 1000).toFixed(0)}k`,
        rows,
        defaultOpen: false,
      })
    }

    // ── 4. Bottom Products by sales ──
    if (prodData.length > 2) {
      const bottom = prodData.slice(-5).reverse()
      const rows = bottom.map((p, i) => rowCells(
        { text: `#${prodData.length - i}`, color: '#eab308', bold: true, flex: '0 0 30px' },
        { text: p.product.slice(0, 32), flex: 1 },
        { text: Math.round(p.tonnage) + ' KG', color: '#a78bfa', align: 'right', numeric: true, flex: '0 0 80px' },
        { text: '₹' + Math.round(p.value).toLocaleString(), color: '#eab308', align: 'right', bold: true, numeric: true, flex: '0 0 110px' },
      ))
      list.push({
        severity: 'warn',
        icon: '📉',
        title: 'Bottom Products by Sales',
        summary: `Lowest ${bottom.length} products — candidates for promotion or phase-out`,
        metric: `₹${Math.round(bottom[0].value).toLocaleString()}`,
        rows,
      })
    }

    // ── 5. Platform Sales Summary ──
    const platMap = {}
    for (const r of poRows) {
      const p = r['Platform'] || 'Unknown'
      if (!platMap[p]) platMap[p] = { orders: 0, value: 0, delivered: 0, rto: 0, tonnage: 0 }
      platMap[p].orders++
      platMap[p].value += num(r['PO Value with Tax'])
      if (r['Status'] === 'Delivered') platMap[p].delivered++
      if (r['Status'] === 'RTO') platMap[p].rto++
    }
    for (const r of periodData) {
      const p = r['Platform'] || 'Unknown'
      if (platMap[p]) platMap[p].tonnage += num(r['Tonnage'])
    }
    const platList = Object.entries(platMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value)
    if (platList.length > 0) {
      const totalPlatVal = platList.reduce((s, p) => s + p.value, 0)
      const rows = platList.slice(0, 6).map(p => {
        const dr = (p.delivered + p.rto) ? Math.round(p.delivered / (p.delivered + p.rto) * 100) : null
        return rowCells(
          { text: p.name, color: '#a78bfa', bold: true, flex: '0 0 100px' },
          { text: p.orders + ' orders', flex: '0 0 90px' },
          { text: Math.round(p.tonnage) + ' KG', color: '#a78bfa', align: 'right', numeric: true, flex: '0 0 80px' },
          { text: dr !== null ? dr + '%' : '—', color: dr >= 80 ? '#22c55e' : dr >= 60 ? '#eab308' : '#ef4444', align: 'right', flex: '0 0 60px' },
          { text: '₹' + Math.round(p.value).toLocaleString(), color: '#22c55e', align: 'right', bold: true, numeric: true, flex: '0 0 110px' },
          { text: (totalPlatVal ? Math.round(p.value / totalPlatVal * 100) : 0) + '%', color: '#64748b', align: 'right', flex: '0 0 50px' },
        )
      })
      list.push({
        severity: 'info',
        icon: '📊',
        title: 'Platform Sales Summary',
        summary: `${platList.length} platforms • ₹${Math.round(totalPlatVal).toLocaleString()} total • ${poRows.length} orders`,
        metric: platList.length,
        rows,
      })
    }

    // ── 6. City RTO risk ──
    const cityStats = {}
    for (const r of allPoRows) {
      const c = r['City']; if (!c) continue
      if (!cityStats[c]) cityStats[c] = { city: c, orders: 0, rto: 0 }
      cityStats[c].orders++
      if (r['Status'] === 'RTO') cityStats[c].rto++
    }
    const riskyCities = Object.values(cityStats).filter(c => c.orders >= 3 && c.rto / c.orders >= 0.25).sort((a, b) => b.rto / b.orders - a.rto / a.orders)
    if (riskyCities.length > 0) {
      const rows = riskyCities.slice(0, 6).map(c => rowCells(
        { text: c.city, color: '#ef4444', bold: true, flex: '0 0 120px' },
        { text: `${c.rto} RTO / ${c.orders} orders`, flex: 1 },
        { text: Math.round(c.rto / c.orders * 100) + '%', color: '#ef4444', align: 'right', bold: true, flex: '0 0 60px' },
      ))
      list.push({
        severity: 'danger',
        icon: '🚨',
        title: 'High RTO Risk Cities',
        summary: `${riskyCities.length} cities with ≥25% RTO rate`,
        metric: riskyCities.length,
        rows,
      })
    }

    // ── 7. Stale open POs (>30 days) ──
    const openPOs = allPoRows.filter(r => !['Delivered', 'RTO'].includes(r['Status'] || ''))
    const stalePOs = []
    for (const r of openPOs) {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!d) continue
      const days = Math.floor((now - d) / 86400000)
      if (days > 30) stalePOs.push({ r, days })
    }
    if (stalePOs.length > 0) {
      const sorted = stalePOs.sort((a, b) => b.days - a.days).slice(0, 6)
      const rows = sorted.map(({ r, days }) => rowCells(
        { text: `${days}d`, color: days > 60 ? '#ef4444' : '#eab308', bold: true, flex: '0 0 60px' },
        { text: r['PO Number'], color: '#60a5fa', bold: true, flex: '0 0 130px' },
        { text: r['City'] || '—', flex: '0 0 90px' },
        { text: r['Status'] || '—', flex: '0 0 100px' },
        { text: '₹' + Math.round(num(r['PO Value with Tax'])).toLocaleString(), color: '#22c55e', align: 'right', numeric: true, flex: '0 0 100px' },
      ))
      rows.forEach(row => { row.onClick = () => onOpenPO(sorted.find(s => s.r['PO Number'] === row.cells[1].text).r) })
      list.push({
        severity: 'warn',
        icon: '⏰',
        title: 'Stale Open POs',
        summary: `${stalePOs.length} open POs older than 30 days — prioritize dispatch`,
        metric: stalePOs.length,
        rows,
      })
    }

    // ── 8. Month-over-Month trend ──
    if (monthData && monthData.length >= 2) {
      const m0 = monthData[0], m1 = monthData[1]
      const oChg = m1.orders > 0 ? Math.round((m0.orders - m1.orders) / m1.orders * 100) : null
      const vChg = m1.value > 0 ? Math.round((m0.value - m1.value) / m1.value * 100) : null
      if (oChg !== null && oChg !== 0) {
        const rows = monthData.slice(0, 3).reverse().map(m => rowCells(
          { text: m.label, bold: true, flex: '0 0 90px' },
          { text: m.orders + ' orders', flex: '0 0 90px' },
          { text: Math.round(m.tonnage) + ' KG', color: '#a78bfa', align: 'right', numeric: true, flex: '0 0 80px' },
          { text: '₹' + Math.round(m.value).toLocaleString(), color: '#22c55e', align: 'right', numeric: true, flex: '0 0 110px' },
          { text: m.deliveryRate !== null ? m.deliveryRate + '%' : '—', color: m.deliveryRate >= 80 ? '#22c55e' : '#eab308', align: 'right', flex: '0 0 60px' },
        ))
        list.push({
          severity: oChg > 0 ? 'good' : 'warn',
          icon: oChg > 0 ? '📈' : '📉',
          title: `Orders ${oChg > 0 ? 'up' : 'down'} ${Math.abs(oChg)}% vs ${m1.label}`,
          summary: `${m0.label}: ${m0.orders} orders • ${m1.label}: ${m1.orders} orders${vChg !== null && vChg !== 0 ? ` • Value ${vChg > 0 ? 'up' : 'down'} ${Math.abs(vChg)}%` : ''}`,
          metric: `${oChg > 0 ? '+' : ''}${oChg}%`,
          rows,
        })
      }
    }

    return list
  }, [periodData, data, onOpenPO, monthData])

  if (insights.length === 0) {
    return (
      <div style={{ marginBottom: 20, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', marginBottom: 4 }}>✅ All Clear</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>No critical insights for the selected period.</div>
      </div>
    )
  }

  const order = { danger: 0, warn: 1, info: 2, good: 3 }
  const sorted = [...insights].sort((a, b) => (order[a.severity] || 9) - (order[b.severity] || 9))

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>💡 Insights &amp; Alerts</span>
        <span style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{insights.length}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#64748b' }}>click a card to expand • click a PO for details</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map((ins, i) => <InsightCard key={i} insight={ins} defaultOpen={i === 0} />)}
      </div>
    </div>
  )
}
