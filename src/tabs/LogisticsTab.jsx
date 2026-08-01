import { useState, useMemo } from 'react'
import { num, parseDate, formatDate, sumPOField } from '../lib/utils'
import { DateRangePicker, RangePresets, ProfileSection } from '../components/ui'
import { DataTable } from '../components/DataTable'

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

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
        <RangePresets onFrom={setDateFrom} onTo={setDateTo} />
        <DateRangePicker from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo} />
      </div>

      <div className="recent-orders" style={{ marginTop: 0 }}>
        <div className="orders-header">
          <div className="orders-title">Transporter-wise Performance</div>
          <div className="chart-period">{dateFrom} to {dateTo}</div>
        </div>
        <DataTable
          columns={[
            { key: 'carrier', label: 'Transporter', accessor: r => r.carrier, render: r => <span style={{ fontWeight: 600 }}>{r.carrier}</span> },
            { key: 'totalPO', label: 'POs Handled', accessor: r => r.totalPO, align: 'right' },
            { key: 'inTransit', label: 'In-Transit', accessor: r => r.inTransit, align: 'right', render: r => <span style={{ color: '#3b82f6', fontWeight: 600 }}>{r.inTransit}</span> },
            { key: 'delivered', label: 'Delivered', accessor: r => r.delivered, align: 'right', render: r => <span style={{ color: '#22c55e', fontWeight: 600 }}>{r.delivered}</span> },
            { key: 'rto', label: 'RTO', accessor: r => r.rto, align: 'right', render: r => <span style={{ color: '#ef4444', fontWeight: 600 }}>{r.rto}</span> },
            {
              key: 'deliveryRate', label: 'Delivery Rate', accessor: r => (r.totalPO ? Math.min(100, r.delivered / r.totalPO * 100) : 0), align: 'right',
              render: r => {
                const rate = r.totalPO ? Math.min(100, r.delivered / r.totalPO * 100) : 0
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                    <div style={{ width: 60, height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${rate}%`, height: '100%', background: rate >= 70 ? '#22c55e' : rate >= 40 ? '#eab308' : '#ef4444', borderRadius: 3 }} />
                    </div>
                    <span style={{ color: rate >= 70 ? '#22c55e' : rate >= 40 ? '#eab308' : '#ef4444', fontWeight: 600, fontSize: 13 }}>{rate.toFixed(1)}%</span>
                  </div>
                )
              }
            },
            {
              key: 'rtoRate', label: 'RTO Rate', accessor: r => (r.totalPO ? r.rto / r.totalPO * 100 : 0), align: 'right',
              render: r => { const rate = r.totalPO ? (r.rto / r.totalPO * 100) : 0; return <span style={{ color: rate > 10 ? '#ef4444' : '#94a3b8', fontWeight: 600 }}>{rate.toFixed(1)}%</span> }
            },
            { key: 'tonnage', label: 'Tonnage', accessor: r => Math.round(r.tonnage), align: 'right', render: r => Math.round(r.tonnage).toLocaleString() + ' KG' },
            { key: 'transportCharge', label: 'Transport Cost', accessor: r => r.transportCharge, align: 'right', render: r => '₹' + Math.round(r.transportCharge).toLocaleString() },
            { key: 'costPerKg', label: 'Cost/KG', accessor: r => (r.tonnage ? r.transportCharge / r.tonnage : null), align: 'right', render: r => r.tonnage ? <span style={{ color: '#a855f7', fontWeight: 600 }}>{(r.transportCharge / r.tonnage).toFixed(2)}</span> : '—' },
            { key: 'totalValue', label: 'Total Value', accessor: r => r.totalValue, align: 'right', render: r => '₹' + Math.round(r.totalValue).toLocaleString() },
          ]}
          rows={carrierData}
          pageSize={10}
          filename="transporter_performance.csv"
          emptyMessage="No carriers in this range"
        />
      </div>
    </>
  )
}
