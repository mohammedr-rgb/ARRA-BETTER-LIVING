import { useState, useMemo } from 'react'
import { num, uniqueByPO, sumField, csvEscape, parseMMDDDate, MONTH_NAMES } from '../lib/utils'
import { TooltipRow, StatCard } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { PONumberLink } from '../components/PONumberLink'

function getBoxType(row) {
  const platform = (row['Platform'] || '').trim().toLowerCase()
  const city = (row['City'] || '').trim().toLowerCase()
  if (platform === 'swiggy') {
    if (city === 'chennai' || city === 'coimbatore') return 'Standard Box'
    return 'White Box'
  }
  return 'Standard Box'
}

const PRIORITY_STYLE = {
  0: { label: 'Critical', color: '#dc2626' },
  1: { label: 'High', color: '#ef4444' },
  2: { label: 'Medium', color: '#eab308' },
  3: { label: 'Low', color: '#22c55e' },
  4: { label: '—', color: '#64748b' },
}

function priorityFor(row) {
  const d = parseMMDDDate(row['Appointment Date(MM-DD-YYYY)'])
  if (!d) return { rank: 4, label: '—' }
  const today = new Date()
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.floor((d - base) / 86400000)
  if (days < 0) return { rank: 0, label: 'Critical' }
  if (days <= 7) return { rank: 1, label: 'High' }
  if (days <= 14) return { rank: 2, label: 'Medium' }
  return { rank: 3, label: 'Low' }
}

function PriorityPill({ rank }) {
  const s = PRIORITY_STYLE[rank] || PRIORITY_STYLE[4]
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: `${s.color}1a`, color: s.color, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  )
}

const DISPATCH_STATUSES = new Set(['Ready for Dispatch', 'Pending for Dispatch', 'Pending for Schedule'])

export default function DispatchTab({ data, onOpenPO }) {
  const [selectedMonths, setSelectedMonths] = useState(() => new Set())

  const monthOptions = useMemo(() => {
    const map = {}
    data.forEach(r => {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!d) return
      const mk = d.getFullYear() * 12 + d.getMonth()
      if (!map[mk]) map[mk] = `${MONTH_NAMES[mk % 12]} ${String(Math.floor(mk / 12)).slice(2)}`
    })
    return Object.entries(map).sort((a, b) => Number(b[0]) - Number(a[0])).map(([mk, label]) => ({ mk: Number(mk), label }))
  }, [data])

  const toggleMonth = (mk) => {
    setSelectedMonths(prev => {
      const next = new Set(prev)
      if (next.has(mk)) next.delete(mk)
      else next.add(mk)
      return next
    })
  }

  const resetMonths = () => setSelectedMonths(new Set())

  const periodData = useMemo(() => {
    if (!selectedMonths.size) return data
    return data.filter(r => {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      return d && selectedMonths.has(d.getFullYear() * 12 + d.getMonth())
    })
  }, [data, selectedMonths])

  const scopeLabel = useMemo(() => {
    if (!selectedMonths.size) return 'All months'
    return [...selectedMonths]
      .sort((a, b) => a - b)
      .map(mk => MONTH_NAMES[mk % 12] + ' ' + String(Math.floor(mk / 12)).slice(2))
      .join(', ')
  }, [selectedMonths])

  const invoicePeriodData = useMemo(() => {
    if (!selectedMonths.size) return data
    return data.filter(r => {
      const d = parseMMDDDate(r['Invoice Date (MM-DD-YYYY)'])
      return d && selectedMonths.has(d.getFullYear() * 12 + d.getMonth())
    })
  }, [data, selectedMonths])

  const tonnageByStatus = useMemo(() => {
    const map = {}
    for (const r of invoicePeriodData) {
      const s = r['Status'] || 'Unknown'
      if (!map[s]) map[s] = { status: s, tonnage: 0, count: 0 }
      map[s].tonnage += num(r['Tonnage'])
      map[s].count++
    }
    return Object.values(map).sort((a, b) => b.tonnage - a.tonnage)
  }, [invoicePeriodData])

  const totalRecon = tonnageByStatus.reduce((s, r) => s + r.tonnage, 0)

  const poData = useMemo(() => uniqueByPO(periodData), [periodData])
  const [pendingFilter, setPendingFilter] = useState(null)

  const pendingData = useMemo(() => {
    const seen = new Set()
    return periodData.filter(r => {
      if (!DISPATCH_STATUSES.has(r['Status'])) return false
      const key = r['PO Number'] + '|' + r['Product']
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [periodData])

  const filteredPendingData = useMemo(() => {
    if (!pendingFilter) return pendingData
    return pendingData.filter(r => (r['Platform'] || 'Unknown') === pendingFilter)
  }, [pendingData, pendingFilter])

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
    const allDispatched = periodData.filter(r => ['Pending for Dispatch', 'Pending for Schedule'].includes(r['Status'] || ''))
    return {
      openDispatches: dispatched.length,
      openLines: allDispatched.length,
      openQty: sumField(allDispatched, 'PO Qty'),
      openBoxes: sumField(allDispatched, 'Box Count'),
      openTonnage: sumField(allDispatched, 'Tonnage'),
      openCharge: sumField(allDispatched, 'Transport Charges'),
      openValue: sumField(allDispatched, 'PO Value with Tax'),
    }
  }, [periodData, poData])

  const readyMetrics = useMemo(() => {
    const readyLines = periodData.filter(r => r['Status'] === 'Ready for Dispatch')
    const readyPOs = uniqueByPO(readyLines)
    return {
      readyPOs: readyPOs.length,
      readyLines: readyLines.length,
      readyQty: sumField(readyLines, 'PO Qty'),
      readyBoxes: sumField(readyLines, 'Box Count'),
      readyTonnage: sumField(readyLines, 'Tonnage'),
      readyValue: sumField(readyLines, 'PO Value with Tax'),
    }
  }, [periodData])

  const deliveredMetricsInvoice = useMemo(() => {
    const deliveredLines = invoicePeriodData.filter(r => r['Status'] === 'Delivered')
    const deliveredPOs = uniqueByPO(deliveredLines)
    return {
      deliveredPOs: deliveredPOs.length,
      deliveredLines: deliveredLines.length,
      deliveredQty: sumField(deliveredLines, 'PO Qty'),
      deliveredBoxes: sumField(deliveredLines, 'Box Count'),
      deliveredTonnage: sumField(deliveredLines, 'Tonnage'),
      deliveredValue: sumField(deliveredLines, 'PO Value with Tax'),
    }
  }, [invoicePeriodData])

  const inTransitMetricsInvoice = useMemo(() => {
    const lines = invoicePeriodData.filter(r => (r['Status'] || '') !== 'Delivered')
    const poRows = uniqueByPO(lines)
    const byStatus = {}
    for (const r of lines) {
      const s = r['Status'] || 'Unknown'
      if (!byStatus[s]) byStatus[s] = { status: s, tonnage: 0, count: 0 }
      byStatus[s].tonnage += num(r['Tonnage'])
      byStatus[s].count++
    }
    const byStatusArr = Object.values(byStatus).sort((a, b) => b.tonnage - a.tonnage)
    return {
      tonnage: sumField(lines, 'Tonnage'),
      pos: poRows.length,
      lines: lines.length,
      value: sumField(lines, 'PO Value with Tax'),
      byStatus: byStatusArr,
    }
  }, [invoicePeriodData])

  const readyMetricsInvoice = useMemo(() => {
    const lines = invoicePeriodData.filter(r => (r['Status'] || '') === 'Ready for Dispatch')
    const poRows = uniqueByPO(lines)
    const byStatus = {}
    for (const r of lines) {
      const s = r['Status'] || 'Unknown'
      if (!byStatus[s]) byStatus[s] = { status: s, tonnage: 0, count: 0 }
      byStatus[s].tonnage += num(r['Tonnage'])
      byStatus[s].count++
    }
    const byStatusArr = Object.values(byStatus).sort((a, b) => b.tonnage - a.tonnage)
    return {
      tonnage: sumField(lines, 'Tonnage'),
      pos: poRows.length,
      lines: lines.length,
      value: sumField(lines, 'PO Value with Tax'),
      byStatus: byStatusArr,
    }
  }, [invoicePeriodData])

  const downloadPendingCSV = () => {
    const filtered = periodData.filter(r => DISPATCH_STATUSES.has(r['Status']))
    if (!filtered.length) return
    const sorted = [...filtered].sort((a, b) => priorityFor(a).rank - priorityFor(b).rank || String(a['Appointment Date(MM-DD-YYYY)'] || '').localeCompare(String(b['Appointment Date(MM-DD-YYYY)'] || '')))
    const cols = [
      ['City', 'City'],
      ['FacilityName', 'Facility Name'],
      ['Pincode', 'Pincode'],
      ['Platform', 'Platform'],
      ['Box Type', 'Box Type'],
      ['PO Number', 'PO Number'],
      ['Product', 'Product'],
      ['PO Qty', 'QTY'],
      ['Tonnage', 'Tonnage'],
      ['Box Count', 'Box Count'],
      ['MRP', 'MRP'],
      ['Expiry Date(MM-DD-YYYY)', 'PO Expiry Date'],
      ['Appointment Date(MM-DD-YYYY)', 'Appointment Date'],
      ['__priority', 'Priority'],
      ['PO Released Date(MM-DD-YYYY)', 'PO Released Date'],
      ['Status', 'Status'],
    ]
    const header = cols.map(c => c[1]).join(',')
    const body = sorted.map(r => cols.map(([k]) => {
      if (k === '__priority') return csvEscape(priorityFor(r).label)
      if (k === 'Box Type') return csvEscape(getBoxType(r))
      if (k === 'Tonnage') return num(r[k])
      if (k === 'Box Count') return num(r[k])
      if (k === 'PO Qty') return num(r[k])
      if (k === 'MRP') return num(r[k])
      const v = r[k] || ''
      return /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    }).join(',')).join('\n')

    const byProductMRP = {}
    for (const r of filtered) {
      const bt = getBoxType(r)
      const prod = r['Product'] || 'Unknown'
      const plat = r['Platform'] || 'Unknown'
      const mrp = r['MRP'] || ''
      const key = prod + ' | ' + plat + ' | ' + bt + ' | ' + mrp
      if (!byProductMRP[key]) byProductMRP[key] = { product: prod, platform: plat, boxType: bt, mrp: mrp, boxes: 0, tonnage: 0 }
      byProductMRP[key].boxes += num(r['Box Count'])
      byProductMRP[key].tonnage += num(r['Tonnage'])
    }
    const summaryLines = []
    summaryLines.push('')
    summaryLines.push('Product-wise Summary')
    summaryLines.push(['Product', 'Platform', 'Box Type', 'MRP', 'Total Box Count', 'Total Tonnage'].map(csvEscape).join(','))
    for (const [, v] of Object.entries(byProductMRP).sort((a, b) => b[1].tonnage - a[1].tonnage)) {
      summaryLines.push([v.product, v.platform, v.boxType, csvEscape(v.mrp), Math.round(v.boxes), Math.round(v.tonnage)].map(csvEscape).join(','))
    }
    const prodTotal = Object.values(byProductMRP).reduce((s, v) => ({ boxes: s.boxes + v.boxes, tonnage: s.tonnage + v.tonnage }), { boxes: 0, tonnage: 0 })
    summaryLines.push(['TOTAL', '', '', '', Math.round(prodTotal.boxes), Math.round(prodTotal.tonnage)].map(csvEscape).join(','))

    const blob = new Blob([header + '\n' + body + '\n' + summaryLines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'pending_dispatch_schedule.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <header>
        <div>
          <h1>Dispatch Overview</h1>
          <div className="date">{readyMetrics.readyPOs} ready POs • {dispatchMetrics.openDispatches} pending POs • {pendingData.length} product lines{selectedMonths.size > 0 ? ` • ${scopeLabel}` : ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={downloadPendingCSV} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⬇ Download Pending Data
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.5 }}>PERIOD</span>
          <button
            onClick={resetMonths}
            style={{ padding: '4px 10px', borderRadius: 16, border: '1px solid ' + (selectedMonths.size === 0 ? '#3b82f6' : '#334155'), background: selectedMonths.size === 0 ? 'rgba(59,130,246,0.15)' : '#1e293b', color: selectedMonths.size === 0 ? '#3b82f6' : '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            All
          </button>
          {monthOptions.map(m => {
            const on = selectedMonths.has(m.mk)
            return (
              <button
                key={m.mk}
                onClick={() => toggleMonth(m.mk)}
                style={{ padding: '4px 10px', borderRadius: 16, border: '1px solid ' + (on ? '#22c55e' : '#334155'), background: on ? 'rgba(34,197,94,0.15)' : '#1e293b', color: on ? '#22c55e' : '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <StatCard
          label="Open Dispatches" icon="🚚" color="#3b82f6"
          value={Math.round(inTransitMetricsInvoice.tonnage).toLocaleString() + ' KG'} change={`${inTransitMetricsInvoice.pos} POs • ₹${Math.round(inTransitMetricsInvoice.value).toLocaleString()}`}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Open Dispatches Details (by Invoice Date)</div>
              <TooltipRow label="Unique POs" value={inTransitMetricsInvoice.pos} valueColor="#3b82f6" />
              <TooltipRow label="Product Lines" value={inTransitMetricsInvoice.lines} valueColor="#3b82f6" />
              <TooltipRow label="Tonnage" value={Math.round(inTransitMetricsInvoice.tonnage).toLocaleString() + ' KG'} valueColor="#3b82f6" />
              <TooltipRow label="Invoice Value" value={'₹' + Math.round(inTransitMetricsInvoice.value).toLocaleString()} valueColor="#3b82f6" />
              <div style={{ fontSize: 12, color: '#94a3b8', margin: '8px 0 4px', fontWeight: 600 }}>Tonnage by Status</div>
              {inTransitMetricsInvoice.byStatus.map(s => (
                <TooltipRow key={s.status} label={s.status} value={`${Math.round(s.tonnage).toLocaleString()} KG • ${s.count} POs`} valueColor="#3b82f6" />
              ))}
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
        <StatCard
          label="Ready for Dispatch" icon="📦" color="#22c55e"
          value={Math.round(readyMetricsInvoice.tonnage).toLocaleString() + ' KG'} change={`${readyMetricsInvoice.pos} POs • ₹${Math.round(readyMetricsInvoice.value).toLocaleString()}`}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Ready for Dispatch Details (by Invoice Date)</div>
              <TooltipRow label="Unique POs" value={readyMetricsInvoice.pos} valueColor="#22c55e" />
              <TooltipRow label="Product Lines" value={readyMetricsInvoice.lines} valueColor="#22c55e" />
              <TooltipRow label="Tonnage" value={Math.round(readyMetricsInvoice.tonnage).toLocaleString() + ' KG'} valueColor="#22c55e" />
              <TooltipRow label="Invoice Value" value={'₹' + Math.round(readyMetricsInvoice.value).toLocaleString()} valueColor="#22c55e" />
              <div style={{ fontSize: 12, color: '#94a3b8', margin: '8px 0 4px', fontWeight: 600 }}>Tonnage by Status</div>
              {readyMetricsInvoice.byStatus.map(s => (
                <TooltipRow key={s.status} label={s.status} value={`${Math.round(s.tonnage).toLocaleString()} KG • ${s.count} POs`} valueColor="#22c55e" />
              ))}
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
        <StatCard
          label="Delivered" icon="✅" color="#22c55e"
          value={Math.round(deliveredMetricsInvoice.deliveredTonnage).toLocaleString() + ' KG'} change={`${deliveredMetricsInvoice.deliveredPOs} POs • ₹${Math.round(deliveredMetricsInvoice.deliveredValue).toLocaleString()}`}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Delivered Details (by Invoice Date)</div>
              <TooltipRow label="Unique POs" value={deliveredMetricsInvoice.deliveredPOs} valueColor="#22c55e" />
              <TooltipRow label="Product Lines" value={deliveredMetricsInvoice.deliveredLines} valueColor="#22c55e" />
              <TooltipRow label="Qty (Units)" value={Math.round(deliveredMetricsInvoice.deliveredQty).toLocaleString()} valueColor="#22c55e" />
              <TooltipRow label="Box Count" value={Math.round(deliveredMetricsInvoice.deliveredBoxes).toLocaleString()} valueColor="#22c55e" />
              <TooltipRow label="Tonnage" value={Math.round(deliveredMetricsInvoice.deliveredTonnage).toLocaleString() + ' KG'} valueColor="#22c55e" />
              <TooltipRow label="Invoice Value" value={'₹' + Math.round(deliveredMetricsInvoice.deliveredValue).toLocaleString()} valueColor="#22c55e" />
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
        <StatCard
          label="In-Transit" icon="🚛" color="#a855f7"
          value={Math.round(inTransitMetricsInvoice.tonnage).toLocaleString() + ' KG'} change={`${inTransitMetricsInvoice.pos} POs • ₹${Math.round(inTransitMetricsInvoice.value).toLocaleString()}`}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>In-Transit Details (by Invoice Date)</div>
              <TooltipRow label="Unique POs" value={inTransitMetricsInvoice.pos} valueColor="#a855f7" />
              <TooltipRow label="Product Lines" value={inTransitMetricsInvoice.lines} valueColor="#a855f7" />
              <TooltipRow label="Tonnage" value={Math.round(inTransitMetricsInvoice.tonnage).toLocaleString() + ' KG'} valueColor="#a855f7" />
              <TooltipRow label="Invoice Value" value={'₹' + Math.round(inTransitMetricsInvoice.value).toLocaleString()} valueColor="#a855f7" />
              <div style={{ fontSize: 12, color: '#94a3b8', margin: '8px 0 4px', fontWeight: 600 }}>Tonnage by Status</div>
              {inTransitMetricsInvoice.byStatus.map(s => (
                <TooltipRow key={s.status} label={s.status} value={`${Math.round(s.tonnage).toLocaleString()} KG • ${s.count} POs`} valueColor="#a855f7" />
              ))}
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
      </div>

      <div className="recent-orders" style={{ marginTop: 0, marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">Tonnage Reconciliation</div>
          <div className="chart-period">by Invoice Date • {scopeLabel} • matches total tonnage on Dashboard/Inventory</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Tonnage (KG)</th>
              <th style={{ textAlign: 'right' }}>% of Total</th>
              <th style={{ textAlign: 'right' }}>POs</th>
            </tr>
          </thead>
          <tbody>
            {tonnageByStatus.map(row => (
              <tr key={row.status}>
                <td>{row.status}</td>
                <td style={{ textAlign: 'right' }}>{Math.round(row.tonnage).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{totalRecon ? Math.round(row.tonnage / totalRecon * 100) : 0}%</td>
                <td style={{ textAlign: 'right' }}>{row.count}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #334155', fontWeight: 700 }}>
              <td>TOTAL</td>
              <td style={{ textAlign: 'right' }}>{Math.round(totalRecon).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>100%</td>
              <td style={{ textAlign: 'right' }}>{tonnageByStatus.reduce((s, r) => s + r.count, 0)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
          The 4 cards above use <b>PO Released Date</b> (all-time on "All"); this table uses <b>Invoice Date</b>. The gap vs the cards = tonnage in non-dispatch statuses (e.g. RTO, Open) + rows whose released date ≠ invoice date.
        </div>
      </div>

      <div className="recent-orders">
        <div className="orders-header">
          <div className="orders-title">Ready for Dispatch / Pending for Dispatch &amp; Schedule</div>
          <div className="chart-period">{filteredPendingData.length} lines{pendingFilter ? ` • ${pendingFilter}` : ''} • Status: Ready for Dispatch, Pending for Dispatch, Pending for Schedule</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            onClick={() => setPendingFilter(null)}
            style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: pendingFilter === null ? 'rgba(59,130,246,0.2)' : 'rgba(100,116,139,0.1)', color: pendingFilter === null ? '#3b82f6' : '#94a3b8', border: pendingFilter === null ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(100,116,139,0.2)' }}
          >
            All Platforms
          </button>
          {pendingPlatformData.map(p => (
            <button
              key={p.platform}
              onClick={() => setPendingFilter(prev => prev === p.platform ? null : p.platform)}
              style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: pendingFilter === p.platform ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.1)', color: pendingFilter === p.platform ? '#60a5fa' : '#3b82f6', border: pendingFilter === p.platform ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(59,130,246,0.2)' }}
            >
              {p.platform} • {p.pos} POs
            </button>
          ))}
        </div>
        <DataTable
          columns={[
            { key: 'po', label: 'PO #', accessor: r => r['PO Number'], render: r => <PONumberLink row={r} onOpenPO={onOpenPO} /> },
            { key: 'city', label: 'City', accessor: r => r['City'] },
            { key: 'platform', label: 'Platform', accessor: r => r['Platform'] },
            { key: 'boxType', label: 'Box Type', accessor: r => getBoxType(r) },
            { key: 'product', label: 'Product', accessor: r => r['Product'], render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r['Product']}</span>, filterable: true },
            { key: 'qty', label: 'PO Qty', accessor: r => num(r['PO Qty']), align: 'right' },
            { key: 'tonnage', label: 'Tonnage', accessor: r => num(r['Tonnage']), align: 'right' },
            { key: 'box', label: 'Box', accessor: r => num(r['Box Count']), align: 'right' },
            { key: 'mrp', label: 'MRP', accessor: r => r['MRP'] || '—', align: 'right' },
            { key: 'cost', label: 'Unit Cost', accessor: r => r['Unit Cost'] || '—', align: 'right' },
            { key: 'appt', label: 'Appointment / Status', accessor: r => r['Appointment Date(MM-DD-YYYY)'] || r['Status'], render: r => r['Appointment Date(MM-DD-YYYY)'] ? r['Appointment Date(MM-DD-YYYY)'] : <span style={{ color: '#eab308' }}>{r['Status']}</span> },
            { key: 'priority', label: 'Priority', accessor: r => priorityFor(r).rank, render: r => <PriorityPill rank={priorityFor(r).rank} /> },
          ]}
          rows={filteredPendingData}
          pageSize={10}
          filename="pending_dispatch_schedule.csv"
          onRowClick={onOpenPO}
          emptyMessage="No ready or pending records"
        />
      </div>
    </>
  )
}
