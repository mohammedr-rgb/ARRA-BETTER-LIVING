import { useState, useMemo } from 'react'
import { num, parseDate, parseMMDDDate, formatDate, uniqueByPO, sumPOField, sumField, csvEscape, statusFilters, toNumKG } from '../lib/utils'
import { useSort, applySort } from '../lib/useSort'
import { Tooltip, StatusPill, EmptyState, DateRangePicker, CSVButton, ProfileSection, SortTh } from '../components/ui'
import { PONumberLink } from '../components/PONumberLink'

export default function OrdersTab({ data, platformFilter, onOpenPO }) {
  const poData = useMemo(() => uniqueByPO(data), [data])
  const today = useMemo(() => new Date(), [])
  const releasedFrom = useMemo(() => new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1), [today])
  const monthFrom = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today])
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
        value: sumPOField(withinRange, 'PO Value with Tax'),
        tonnage: sumField(withinRange, 'Tonnage'),
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
    for (const r of filteredData) {
      const c = r['City']; if (!c) continue
      const d = parseMMDDDate(r['DATE(MM-DD-YYYY)'])
      if (!d || d < monthFrom || d > today) continue
      if (!map[c]) map[c] = { city: c, orders: new Set(), poValueMap: {}, tonnage: 0 }
      map[c].orders.add(r['PO Number'])
      const v = num(r['PO Value with Tax'])
      const po = r['PO Number']
      if (po && v > 0 && v > (map[c].poValueMap[po] || 0)) map[c].poValueMap[po] = v
      map[c].tonnage += num(r['Tonnage'])
    }
    return Object.values(map)
      .map(x => ({
        city: x.city,
        orders: x.orders.size,
        value: Object.values(x.poValueMap).reduce((s, v) => s + v, 0),
        tonnage: x.tonnage,
      }))
      .sort((a, b) => b.orders - a.orders)
  }, [filteredData, monthFrom, today])

  const summaryTotals = useMemo(() => ({
    orders: citySummary.reduce((s, c) => s + c.orders, 0),
    value: citySummary.reduce((s, c) => s + c.value, 0),
    tonnage: citySummary.reduce((s, c) => s + c.tonnage, 0),
  }), [citySummary])

  const todayReleased = useMemo(() => {
    const seen = new Set()
    const rows = []
    data.forEach(r => {
      if (platformFilter !== 'All' && r['Platform'] !== platformFilter) return
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!d || d < releasedFrom) return
      const po = r['PO Number']
      if (seen.has(po)) return
      seen.add(po)
      rows.push(r)
    })
    return rows.sort((a, b) => (a['City'] || '').localeCompare(b['City'] || ''))
  }, [data, platformFilter, releasedFrom])

  const todayReleasedAll = useMemo(() => {
    const rows = []
    data.forEach(r => {
      if (platformFilter !== 'All' && r['Platform'] !== platformFilter) return
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!d || d < releasedFrom) return
      rows.push(r)
    })
    return rows.sort((a, b) => (a['City'] || '').localeCompare(b['City'] || '') || (a['PO Number'] || '').localeCompare(b['PO Number'] || ''))
  }, [data, platformFilter, releasedFrom])

  const todayCSVRows = () => {
    const rows = ['Last 2 Days Released POs']
    rows.push('City,Platform,PO Number,Product,QTY,Tonnage,Box Count,MRP,PO Value with Tax,PO Expiry Date')
    todayReleasedAll.forEach(r => {
      rows.push([r['City'], r['Platform'], r['PO Number'], r['Product'], num(r['PO Qty']), num(r['Tonnage']), num(r['Box Count']), num(r['MRP']), num(r['PO Value with Tax']), r['Expiry Date(MM-DD-YYYY)'] || '—'].map(x => csvEscape(String(x))).join(','))
    })
    return rows
  }

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
              <button
                onClick={() => setStatusFilter(s)}
                onFocus={() => setHoverFilter(s)}
                onBlur={() => setHoverFilter(null)}
                onKeyDown={e => { if (e.key === 'Escape') setHoverFilter(null) }}
                aria-expanded={hoverFilter === s}
                style={{ background: statusFilter === s ? '#3b82f6' : '#1e293b', border: '1px solid ' + (statusFilter === s ? '#3b82f6' : '#334155'), borderRadius: 8, color: '#f1f5f9', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {s}
              </button>
              {hoverFilter === s && (
                <Tooltip style={{ left: '50%', transform: 'translateX(-50%)' }}>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>{s} Orders</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{statusSummary[s].orders} orders</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>₹{Math.round(statusSummary[s].value).toLocaleString()}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{Math.round(statusSummary[s].tonnage)} KG</div>
                </Tooltip>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <DateRangePicker from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo} />
        </div>
      </div>

      <div className="recent-orders" style={{ marginTop: 0 }}>
        <div className="orders-header">
          <div className="orders-title">📌 Last 2 Days Released POs ({todayReleased.length})</div>
          <div className="chart-period">{formatDate(releasedFrom)} — {formatDate(today)} — {todayReleasedAll.reduce((s, r) => s + num(r['PO Qty']), 0)} units • {Math.round(todayReleasedAll.reduce((s, r) => s + num(r['Tonnage']), 0)).toLocaleString()} KG • ₹{Math.round(sumPOField(todayReleasedAll, 'PO Value with Tax')).toLocaleString()}</div>
          <CSVButton makeRows={todayCSVRows} filename="last_2_days_released_pos.csv" style={{ padding: '8px 20px', fontSize: 13 }} />
        </div>
        {todayReleased.length ? (
          <div className="table-scroll">
          <table style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>PO #</th>
                <th>City</th>
                <th>Platform</th>
                <th className="num">Qty</th>
                <th className="num">Tonnage</th>
                <th className="num">Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {todayReleased.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => onOpenPO && onOpenPO(row)}
                  style={onOpenPO ? { cursor: 'pointer' } : undefined}
                >
                  <td><PONumberLink row={row} onOpenPO={onOpenPO} /></td>
                  <td>{row['City']}</td>
                  <td style={{ color: '#3b82f6', fontWeight: 600 }}>{row['Platform']}</td>
                  <td className="num">{num(row['PO Qty'])}</td>
                  <td className="num">{num(row['Tonnage'])}</td>
                  <td className="num">₹{num(row['PO Value with Tax']).toLocaleString()}</td>
                  <td><StatusPill status={row['Status']} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <EmptyState message="No POs released in the last 2 days" />
        )}
      </div>

      <div className="recent-orders" style={{ marginTop: 0 }}>
        <div className="orders-header">
          <div className="orders-title">City-wise {statusFilter} Orders</div>
          <div className="chart-period">{formatDate(monthFrom)} to {formatDate(today)}</div>
        </div>
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>City</th>
              <th className="num">Orders</th>
              <th className="num">Share</th>
              <th className="num">Value</th>
              <th className="num">Tonnage</th>
            </tr>
          </thead>
          <tbody>
            {citySummary.length === 0 ? (
              <tr><td colSpan={5}><EmptyState /></td></tr>
            ) : citySummary.map((row, i) => {
              const share = summaryTotals.orders ? (row.orders / summaryTotals.orders * 100).toFixed(1) : 0
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{row.city}</td>
                  <td className="num">{row.orders}</td>
                  <td className="num">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <div style={{ flex: 1, maxWidth: 80, height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${share}%`, height: '100%', background: '#3b82f6', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>{share}%</span>
                    </div>
                  </td>
                  <td className="num">₹{Math.round(row.value).toLocaleString()}</td>
                  <td className="num">{Math.round(row.tonnage)} KG</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>

      <AppointmentView data={data} platformFilter={platformFilter} onOpenPO={onOpenPO} />
      <PriorityPushView data={data} platformFilter={platformFilter} onOpenPO={onOpenPO} />
    </>
  )
}

function PriorityPushView({ data, platformFilter, onOpenPO }) {
  const sort = useSort()

  const pushRows = useMemo(() => {
    const map = new Map()
    const statuses = new Set()
    data.forEach(r => {
      if (platformFilter !== 'All' && r['Platform'] !== platformFilter) return
      const s = (r['Status'] || '').toLowerCase()
      if (!/^reach/i.test(s) || !/destination/i.test(s)) return
      statuses.add(r['Status'])
      const po = r['PO Number']
      if (!po) return
      if (!map.has(po)) map.set(po, { ...r, _tonnage: 0, _qty: 0 })
      const entry = map.get(po)
      entry._tonnage += num(r['Tonnage'])
      entry._qty += num(r['PO Qty'])
    })
    return [...map.values()].sort((a, b) => (a['City'] || '').localeCompare(b['City'] || '') || (a['PO Number'] || '').localeCompare(b['PO Number'] || ''))
  }, [data, platformFilter])

  const totals = useMemo(() => ({
    tonnage: pushRows.reduce((s, r) => s + r._tonnage, 0),
    value: sumPOField(pushRows, 'PO Value with Tax'),
  }), [pushRows])

  const pushAccessors = {
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

  const csvRows = () => {
    const rows = ['Priority Push Appointments (Reached Destination)']
    rows.push('PO Number,City,Platform,Facility,Transporter,Tonnage (KG),Qty,PO Value with Tax,Appointment Date,Appointment ID,Status,Remarks')
    pushRows.forEach(r => {
      rows.push([r['PO Number'], r['City'], r['Platform'], r['FacilityName'], r['Transporter'], num(r._tonnage), num(r._qty), num(r['PO Value with Tax']), r['Appointment Date(MM-DD-YYYY)'], r['Appointment ID'], r['Status'], r['Remarks']].map(x => csvEscape(String(x))).join(','))
    })
    return rows
  }

  return (
    <div className="recent-orders" style={{ marginTop: 20 }}>
      <div className="orders-header">
        <div className="orders-title">🚀 Priority Push Appointments — Reached Destination ({pushRows.length})</div>
        <div className="chart-period">{Math.round(totals.tonnage).toLocaleString()} KG • ₹{Math.round(totals.value).toLocaleString()} • Status: Reached Destination</div>
        <CSVButton makeRows={csvRows} filename="priority_push_appointments.csv" style={{ padding: '8px 20px', fontSize: 13 }} />
      </div>
      {pushRows.length ? (
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <SortTh label="PO #" k="po" sort={sort} />
              <SortTh label="City" k="city" sort={sort} />
              <SortTh label="Platform" k="platform" sort={sort} />
              <SortTh label="Facility" k="facility" sort={sort} />
              <SortTh label="Transporter" k="transporter" sort={sort} />
              <SortTh label="Tonnage (KG)" k="tonnage" sort={sort} className="num" />
              <SortTh label="Appt Date" k="apptdate" sort={sort} />
              <SortTh label="Appt ID" k="apptid" sort={sort} className="num" />
              <SortTh label="Status" k="status" sort={sort} />
              <SortTh label="Remarks" k="remarks" sort={sort} />
            </tr>
          </thead>
          <tbody>
            {applySort(pushRows, sort, pushAccessors).map((r, i) => (
              <tr
                key={i}
                onClick={() => onOpenPO && onOpenPO(r)}
                style={onOpenPO ? { cursor: 'pointer' } : undefined}
              >
                <td><PONumberLink row={r} onOpenPO={onOpenPO} /></td>
                <td>{r['City'] || '—'}</td>
                <td style={{ color: '#3b82f6', fontWeight: 600 }}>{r['Platform']}</td>
                <td style={{ fontSize: 12, color: '#94a3b8' }}>{r['FacilityName'] || '—'}</td>
                <td>{r['Transporter'] || '—'}</td>
                <td className="num" style={{ fontWeight: 600 }}>{Math.round(r._tonnage).toLocaleString()}</td>
                <td style={{ fontSize: 12, color: '#94a3b8' }}>{r['Appointment Date(MM-DD-YYYY)'] || '—'}</td>
                <td className="num" style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>{r['Appointment ID'] || '—'}</td>
                <td><StatusPill status={r['Status']} /></td>
                <td style={{ fontSize: 12, color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['Remarks'] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <EmptyState message="No POs marked Reached Destination" />
      )}
    </div>
  )
}

function AppointmentView({ data, onOpenPO }) {
  const today = useMemo(() => new Date(), [])
  const todayStr = formatDate(today)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const tomorrowStr = formatDate(tomorrow)
  const weekEnd = useMemo(() => new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7), [today])
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
    boxcount: r => num(r._boxes),
    apptdate: r => parseMMDDDate(r['Appointment Date(MM-DD-YYYY)']),
    apptid: r => r['Appointment ID'],
    invoice: r => r['Invoice No'],
    tracking: r => r['Tracking No'],
    status: r => r['Status'],
    remarks: r => r['Remarks'],
    rtoCount: r => rtoByCityFac.get((r['City'] || '') + '||' + (r['FacilityName'] || ''))?.lines || 0,
    rtoTonnage: r => rtoByCityFac.get((r['City'] || '') + '||' + (r['FacilityName'] || ''))?.tonnage || 0,
    rtoValue: r => rtoByCityFac.get((r['City'] || '') + '||' + (r['FacilityName'] || ''))?.value || 0,
  }

  const rtoByCityFac = useMemo(() => {
    const map = new Map()
    data.forEach(r => {
      if ((r['Status'] || '') !== 'RTO') return
      if ((r['RTO Received Date(MM-DD-YYYY)'] || '').trim()) return
      const key = (r['City'] || '') + '||' + (r['FacilityName'] || '')
      if (!map.has(key)) map.set(key, { lines: 0, tonnage: 0, value: 0 })
      const agg = map.get(key)
      agg.lines++
      agg.tonnage += toNumKG(r['RTO Tonnage (MT)'])
      agg.value += num(r['RTO Value at Risk'])
    })
    return map
  }, [data])

  const byAppt = useMemo(() => {
    const tMap = new Map(); const tmMap = new Map(); const wMap = new Map()
    data.forEach(r => {
      const d = parseMMDDDate(r['Appointment Date(MM-DD-YYYY)'])
      if (!d) return
      const po = r['PO Number']
      const ton = num(r['Tonnage'])
      const bx = num(r['Box Count'])
      const ds = formatDate(d)
      if (ds === todayStr) {
        if (!tMap.has(po)) tMap.set(po, { ...r, _tonnage: 0, _boxes: 0 })
        tMap.get(po)._tonnage += ton
        tMap.get(po)._boxes += bx
      } else if (ds === tomorrowStr) {
        if (!tmMap.has(po)) tmMap.set(po, { ...r, _tonnage: 0, _boxes: 0 })
        tmMap.get(po)._tonnage += ton
        tmMap.get(po)._boxes += bx
      } else if (d >= today && d <= weekEnd) {
        if (!wMap.has(po)) wMap.set(po, { ...r, _tonnage: 0, _boxes: 0 })
        wMap.get(po)._tonnage += ton
        wMap.get(po)._boxes += bx
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
  }, [data, todayStr, tomorrowStr, weekEnd, today])

  const renderTable = (rows, sort) => {
    if (!rows.length) return <EmptyState message="No appointments" />
    return (
      <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <SortTh label="PO #" k="po" sort={sort} />
            <SortTh label="City" k="city" sort={sort} />
            <SortTh label="Platform" k="platform" sort={sort} />
            <SortTh label="Facility" k="facility" sort={sort} />
            <SortTh label="Transporter" k="transporter" sort={sort} />
            <SortTh label="Tonnage (KG)" k="tonnage" sort={sort} className="num" />
            <SortTh label="Boxes" k="boxcount" sort={sort} className="num" />
            <SortTh label="RTO #" k="rtoCount" sort={sort} className="num" />
            <SortTh label="RTO Tonnage" k="rtoTonnage" sort={sort} className="num" />
            <SortTh label="RTO Value" k="rtoValue" sort={sort} className="num" />
            <SortTh label="Appt Date" k="apptdate" sort={sort} />
            <SortTh label="Appt ID" k="apptid" sort={sort} className="num" />
            <SortTh label="Invoice #" k="invoice" sort={sort} className="num" />
            <SortTh label="Tracking #" k="tracking" sort={sort} className="num" />
            <SortTh label="Status" k="status" sort={sort} />
            <SortTh label="Remarks" k="remarks" sort={sort} />
          </tr>
        </thead>
        <tbody>
          {applySort(rows, sort, apptAccessors).map((r, i) => (
            <tr
              key={i}
              onClick={() => onOpenPO && onOpenPO(r)}
              style={onOpenPO ? { cursor: 'pointer' } : undefined}
            >
              <td><PONumberLink row={r} onOpenPO={onOpenPO} /></td>
              <td>{r['City']}</td>
              <td style={{ color: '#3b82f6', fontWeight: 600 }}>{r['Platform']}</td>
              <td style={{ fontSize: 12, color: '#94a3b8' }}>{r['FacilityName'] || '—'}</td>
              <td>{r['Transporter'] || '—'}</td>
              <td className="num" style={{ fontWeight: 600 }}>{Math.round(r._tonnage).toLocaleString()}</td>
              <td className="num" style={{ fontWeight: 600 }}>{Math.round(r._boxes).toLocaleString()}</td>
              <td className="num" style={{ fontWeight: 600, color: apptAccessors.rtoCount(r) > 0 ? '#ef4444' : undefined }}>{apptAccessors.rtoCount(r) || '—'}</td>
              <td className="num" style={{ color: apptAccessors.rtoTonnage(r) > 0 ? '#ef4444' : '#94a3b8' }}>{apptAccessors.rtoTonnage(r) > 0 ? Math.round(apptAccessors.rtoTonnage(r)).toLocaleString() : '—'}</td>
              <td className="num" style={{ color: apptAccessors.rtoValue(r) > 0 ? '#ef4444' : '#94a3b8' }}>{apptAccessors.rtoValue(r) > 0 ? '₹' + Math.round(apptAccessors.rtoValue(r)).toLocaleString() : '—'}</td>
              <td style={{ fontSize: 12, color: '#94a3b8' }}>{r['Appointment Date(MM-DD-YYYY)']}</td>
              <td className="num" style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>{r['Appointment ID'] || '—'}</td>
              <td className="num" style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>{r['Invoice No'] || '—'}</td>
              <td className="num" style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>{r['Tracking No'] || '—'}</td>
              <td><StatusPill status={r['Status']} /></td>
              <td style={{ fontSize: 12, color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['Remarks'] || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    )
  }

  const makeCSVRows = (rows, title) => {
    const lines = [title]
    lines.push('PO Number,City,Platform,Facility,Transporter,Tonnage (KG),Box Count,RTO #,RTO Tonnage (KG),RTO Value,Appointment Date,Appointment ID,Invoice No,Tracking No,Status,Remarks')
    rows.forEach(r => {
      lines.push([r['PO Number'], r['City'], r['Platform'], r['FacilityName'], r['Transporter'], num(r._tonnage), Math.round(num(r._boxes)), apptAccessors.rtoCount(r), Math.round(apptAccessors.rtoTonnage(r)), Math.round(apptAccessors.rtoValue(r)), r['Appointment Date(MM-DD-YYYY)'], r['Appointment ID'], r['Invoice No'], r['Tracking No'], r['Status'], r['Remarks']].map(x => csvEscape(String(x ?? ''))).join(','))
    })
    return lines
  }

  return (
    <>
      <div className="recent-orders" style={{ marginTop: 20 }}>
        <div className="orders-header">
          <div className="orders-title">📅 Today's Appointments ({byAppt.today.length})</div>
          <div className="chart-period">{todayStr} — Total: {byAppt.today.length} · <span style={{ color: '#22c55e' }}>{byAppt.statusT['Delivered'] || 0} Delivered</span> · <span style={{ color: '#eab308' }}>{byAppt.statusT['In-Transit'] || 0} In-Transit</span> · <span style={{ color: '#ef4444' }}>{byAppt.statusT['RTO'] || 0} RTO</span> · <span style={{ color: '#64748b', fontSize: 11 }}>RTO # = open returns (Status RTO, not yet received) for this City + Facility</span></div>
          <CSVButton makeRows={() => makeCSVRows(byAppt.today, 'Today\'s Appointments')} filename="appointments_today.csv" style={{ padding: '8px 20px', fontSize: 13 }} />
        </div>
        {renderTable(byAppt.today, todaySort)}
      </div>

      <div className="recent-orders" style={{ marginTop: 20 }}>
        <div className="orders-header">
          <div className="orders-title">📅 Tomorrow's Appointments ({byAppt.tomorrow.length})</div>
          <div className="chart-period">{tomorrowStr} — Total: {byAppt.tomorrow.length} · <span style={{ color: '#22c55e' }}>{byAppt.statusTm['Delivered'] || 0} Delivered</span> · <span style={{ color: '#eab308' }}>{byAppt.statusTm['In-Transit'] || 0} In-Transit</span> · <span style={{ color: '#ef4444' }}>{byAppt.statusTm['RTO'] || 0} RTO</span></div>
          <CSVButton makeRows={() => makeCSVRows(byAppt.tomorrow, 'Tomorrow\'s Appointments')} filename="appointments_tomorrow.csv" style={{ padding: '8px 20px', fontSize: 13 }} />
        </div>
        {renderTable(byAppt.tomorrow, tomorrowSort)}
      </div>

      <div className="recent-orders" style={{ marginTop: 20 }}>
        <div className="orders-header">
          <div className="orders-title">📅 Weekly Appointments (Next 7 Days) ({byAppt.week.length})</div>
          <div className="chart-period">{todayStr} → {formatDate(weekEnd)} — Total: {byAppt.week.length} · <span style={{ color: '#22c55e' }}>{byAppt.statusW['Delivered'] || 0} Delivered</span> · <span style={{ color: '#eab308' }}>{byAppt.statusW['In-Transit'] || 0} In-Transit</span> · <span style={{ color: '#ef4444' }}>{byAppt.statusW['RTO'] || 0} RTO</span></div>
          <CSVButton makeRows={() => makeCSVRows(byAppt.week, 'Weekly Appointments (Next 7 Days)')} filename="appointments_weekly.csv" style={{ padding: '8px 20px', fontSize: 13 }} />
        </div>
        {renderTable(byAppt.week, weekSort)}
      </div>
    </>
  )
}
