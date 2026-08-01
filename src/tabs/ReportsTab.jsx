import { useState, useMemo } from 'react'
import { num, parseDate, formatDate, sumPOField } from '../lib/utils'
import { CSVButton, DateRangePicker, EmptyState, ProfileSection } from '../components/ui'

export default function ReportsTab({ data, platformFilter }) {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
  const [dateFrom, setDateFrom] = useState(formatDate(thirtyDaysAgo))
  const [dateTo, setDateTo] = useState(formatDate(today))

  const reportData = useMemo(() => {
    const map = {}
    for (const r of data) {
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      if (!d) continue
      if (d < parseDate(dateFrom) || d > parseDate(dateTo)) continue
      if (platformFilter !== 'All' && r['Platform'] !== platformFilter) continue
      const p = r['Platform'] || 'Unknown'
      if (!map[p]) map[p] = { platform: p, rows: [], orders: new Set(), delivered: 0, rto: 0, inTransit: 0, tonnage: 0, value: 0 }
      map[p].rows.push(r)
      map[p].orders.add(r['PO Number'])
      map[p].tonnage += num(r['Tonnage'])
      if (r['Status'] === 'Delivered') map[p].delivered++
      else if (r['Status'] === 'RTO') map[p].rto++
      else if (['In-Transit', 'Pending', 'Processing'].includes(r['Status'] || '')) map[p].inTransit++
    }
    return Object.values(map).map(r => ({
      platform: r.platform,
      orders: r.orders.size,
      delivered: r.delivered,
      rto: r.rto,
      inTransit: r.inTransit,
      tonnage: r.tonnage,
      value: sumPOField(r.rows, 'PO Value with Tax'),
      fillRate: (r.delivered + r.rto) ? Math.round(r.delivered / (r.delivered + r.rto) * 100) : 0,
    })).sort((a, b) => b.orders - a.orders)
  }, [data, dateFrom, dateTo, platformFilter])

  const reportCSVRows = () => {
    const header = 'Platform,Orders,Delivered,RTO,In-Transit,Fill Rate%,Tonnage (KG),Value'
    const rows = reportData.map(r =>
      `${r.platform},${r.orders},${r.delivered},${r.rto},${r.inTransit},${r.fillRate},${Math.round(r.tonnage)},${Math.round(r.value)}`
    )
    return [header, ...rows]
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
        <DateRangePicker from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo} />
        <div style={{ marginLeft: 'auto' }}>
          <CSVButton makeRows={reportCSVRows} filename={`platform_report_${dateFrom}_to_${dateTo}.csv`} />
        </div>
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
            {reportData.length === 0 ? (
              <tr><td colSpan={8}><EmptyState /></td></tr>
            ) : reportData.map((r, i) => (
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
