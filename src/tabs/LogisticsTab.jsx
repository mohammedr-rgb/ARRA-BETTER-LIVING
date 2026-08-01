import { useState, useMemo } from 'react'
import { num, parseDate, formatDate, sumPOField } from '../lib/utils'
import { DateRangePicker, EmptyState, ProfileSection } from '../components/ui'

export default function LogisticsTab({ data }) {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
  const [dateFrom, setDateFrom] = useState(formatDate(thirtyDaysAgo))
  const [dateTo, setDateTo] = useState(formatDate(today))

  const carrierData = useMemo(() => {
    const byCarrier = {}
    for (const r of data) {
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      if (!d) continue
      if (d < parseDate(dateFrom) || d > parseDate(dateTo)) continue
      const c = r['Transporter'] || 'Not Assigned'
      if (!byCarrier[c]) byCarrier[c] = { carrier: c, rows: [], totalPO: new Set(), delivered: new Set(), rto: new Set(), inTransit: 0, tonnage: 0, transportCharge: 0 }
      byCarrier[c].rows.push(r)
      byCarrier[c].totalPO.add(r['PO Number'])
      byCarrier[c].tonnage += num(r['Tonnage'])
      byCarrier[c].transportCharge += num(r['Transport Charge'])
      const status = r['Status'] || ''
      if (status === 'Delivered') byCarrier[c].delivered.add(r['PO Number'])
      else if (status === 'RTO') byCarrier[c].rto.add(r['PO Number'])
      else if (['In-Transit', 'Pending', 'Processing'].includes(status)) byCarrier[c].inTransit++
    }
    return Object.values(byCarrier).map(x => ({
      carrier: x.carrier,
      totalPO: x.totalPO.size,
      delivered: x.delivered.size,
      rto: x.rto.size,
      inTransit: x.inTransit,
      tonnage: x.tonnage,
      totalValue: sumPOField(x.rows, 'PO Value with Tax'),
      transportCharge: x.transportCharge,
    })).sort((a, b) => b.totalPO - a.totalPO)
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <DateRangePicker from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo} />
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
            {carrierData.length === 0 ? (
              <tr><td colSpan={11}><EmptyState /></td></tr>
            ) : carrierData.map((row, i) => {
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
