import { useState, useMemo } from 'react'
import { num, uniqueByPO, sumField, csvEscape } from '../lib/utils'
import { TooltipRow, StatCard } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { PONumberLink } from '../components/PONumberLink'

function getBoxType(row) {
  const platform = (row['Platform'] || '').trim().toLowerCase()
  const city = (row['City'] || '').trim().toLowerCase()
  if (platform === 'swiggy') {
    if (city === 'chennai' || city === 'coimbatore') return 'Normal Box'
    return 'White Box'
  }
  return 'Standard Box'
}

export default function DispatchTab({ data, onOpenPO }) {
  const poData = useMemo(() => uniqueByPO(data), [data])
  const [dispatchFilters, setDispatchFilters] = useState(new Set())
  const [pendingFilter, setPendingFilter] = useState(null)

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
      openQty: sumField(allDispatched, 'PO Qty'),
      openBoxes: sumField(allDispatched, 'Box Count'),
      openTonnage: sumField(allDispatched, 'Tonnage'),
      openCharge: sumField(allDispatched, 'Transport Charges'),
      openValue: sumField(allDispatched, 'PO Value with Tax'),
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

  const downloadPendingCSV = () => {
    const statuses = new Set(['Pending for Dispatch', 'Pending for Schedule'])
    const filtered = data.filter(r => statuses.has(r['Status']))
    if (!filtered.length) return
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
      ['PO Released Date(MM-DD-YYYY)', 'PO Released Date'],
      ['Status', 'Status'],
    ]
    const header = cols.map(c => c[1]).join(',')
    const body = filtered.map(r => cols.map(([k]) => {
      if (k === 'Box Type') return csvEscape(getBoxType(r))
      const v = r[k] || ''
      return /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    }).join(',')).join('\n')

    const byPlatform = {}
    for (const r of filtered) {
      const p = r['Platform'] || 'Unknown'
      if (!byPlatform[p]) byPlatform[p] = { boxes: 0, qty: 0, tonnage: 0 }
      byPlatform[p].boxes += num(r['Box Count'])
      byPlatform[p].qty += num(r['PO Qty'])
      byPlatform[p].tonnage += num(r['Tonnage'])
    }
    const summaryLines = []
    summaryLines.push('')
    summaryLines.push('Platform Summary')
    summaryLines.push(['Platform', 'Total Box Count', 'Total Qty', 'Total Tonnage'].map(csvEscape).join(','))
    for (const [p, v] of Object.entries(byPlatform).sort((a, b) => b[1].tonnage - a[1].tonnage)) {
      summaryLines.push([p, Math.round(v.boxes), Math.round(v.qty), Math.round(v.tonnage)].map(csvEscape).join(','))
    }
    const totals = Object.values(byPlatform).reduce((s, v) => ({ boxes: s.boxes + v.boxes, qty: s.qty + v.qty, tonnage: s.tonnage + v.tonnage }), { boxes: 0, qty: 0, tonnage: 0 })
    summaryLines.push(['TOTAL', Math.round(totals.boxes), Math.round(totals.qty), Math.round(totals.tonnage)].map(csvEscape).join(','))

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
          <div className="date">{dispatchMetrics.openDispatches} pending POs • {pendingData.length} product lines</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={downloadPendingCSV} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⬇ Download Pending Data
          </button>
        </div>
      </header>

      <div className="stats-grid">
        <StatCard
          label="Open Dispatches" icon="🚚" color="#3b82f6"
          value={dispatchMetrics.openDispatches} change="Pending POs"
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Dispatch Summary</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Unique POs: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{dispatchMetrics.openDispatches}</span> • Total Lines: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{dispatchMetrics.openLines}</span></div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Qty (Units): <span style={{ color: '#3b82f6', fontWeight: 600 }}>{Math.round(dispatchMetrics.openQty).toLocaleString()}</span> • Box Count: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{Math.round(dispatchMetrics.openBoxes).toLocaleString()}</span></div>
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
            </>
          }
          tooltipStyle={{ zIndex: 9999 }}
        />
        <StatCard
          label="Dispatch Tonnage" icon="⚖️" color="#a855f7"
          value={Math.round(dispatchMetrics.openTonnage).toLocaleString() + ' KG'} change="Open tonnage in transit"
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Tonnage Details</div>
              <TooltipRow label="Unique POs" value={dispatchMetrics.openDispatches} valueColor="#a855f7" />
              <TooltipRow label="Open Tonnage" value={Math.round(dispatchMetrics.openTonnage).toLocaleString() + ' KG'} valueColor="#a855f7" />
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
        <StatCard
          label="PO Value with Tax" icon="🧾" color="#06b6d4"
          value={'₹' + Math.round(dispatchMetrics.openValue).toLocaleString()} change="Open dispatch PO value"
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Value Details</div>
              <TooltipRow label="PO Value with Tax" value={'₹' + Math.round(dispatchMetrics.openValue).toLocaleString()} valueColor="#06b6d4" />
              <TooltipRow label="Qty (Units)" value={Math.round(dispatchMetrics.openQty).toLocaleString()} valueColor="#06b6d4" />
              <TooltipRow label="Box Count" value={Math.round(dispatchMetrics.openBoxes).toLocaleString()} valueColor="#06b6d4" />
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
        <StatCard
          label="Transport Charges" icon="💰" color="#eab308"
          value={'₹' + Math.round(dispatchMetrics.openCharge).toLocaleString()} change="Open dispatch transport cost"
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Cost Details</div>
              <TooltipRow label="Total Transport Cost" value={'₹' + Math.round(dispatchMetrics.openCharge).toLocaleString()} valueColor="#eab308" />
            </>
          }
          tooltipStyle={{ zIndex: 100 }}
        />
      </div>

      <div className="recent-orders">
        <div className="orders-header">
          <div className="orders-title">Pending for Dispatch / Schedule</div>
          <div className="chart-period">{filteredPendingData.length} lines{pendingFilter ? ` • ${pendingFilter}` : ''}</div>
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
            { key: 'product', label: 'Product', accessor: r => r['Product'], render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r['Product']}</span> },
            { key: 'qty', label: 'PO Qty', accessor: r => num(r['PO Qty']), align: 'right' },
            { key: 'tonnage', label: 'Tonnage', accessor: r => num(r['Tonnage']), align: 'right' },
            { key: 'box', label: 'Box', accessor: r => num(r['Box Count']), align: 'right' },
            { key: 'mrp', label: 'MRP', accessor: r => r['MRP'] || '—', align: 'right' },
            { key: 'cost', label: 'Unit Cost', accessor: r => r['Unit Cost'] || '—', align: 'right' },
            { key: 'appt', label: 'Appointment / Status', accessor: r => r['Appointment Date(MM-DD-YYYY)'] || r['Status'], render: r => r['Appointment Date(MM-DD-YYYY)'] ? r['Appointment Date(MM-DD-YYYY)'] : <span style={{ color: '#eab308' }}>{r['Status']}</span> },
          ]}
          rows={filteredPendingData}
          pageSize={10}
          filename="pending_dispatch_schedule.csv"
          onRowClick={onOpenPO}
          emptyMessage="No pending records"
        />
      </div>
    </>
  )
}
