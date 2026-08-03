import { useState, useMemo } from 'react'
import { num, parseDate, formatDate, sumPOField } from '../lib/utils'
import { CSVButton, DateRangePicker, EmptyState, ProfileSection } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const CHART_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#eab308', '#f97316', '#06b6d4', '#ef4444', '#8b5cf6']

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

  const chartData = useMemo(() => reportData.slice(0, 8).map(r => ({
    name: r.platform.length > 12 ? r.platform.slice(0, 10) + '...' : r.platform,
    Orders: r.orders,
    Delivered: r.delivered,
    RTO: r.rto,
    'Fill Rate': r.fillRate
  })), [reportData])

  const valuePieData = useMemo(() => reportData.slice(0, 6).map(r => ({
    name: r.platform,
    value: Math.round(r.value)
  })), [reportData])

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

      <div className="charts-row" style={{ marginBottom: 20 }}>
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Platform Comparison</div>
            <div className="chart-period">Orders, Deliveries & RTO</div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <ReTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="Orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Delivered" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="RTO" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Value Distribution</div>
            <div className="chart-period">PO value by platform</div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={valuePieData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine
              >
                {valuePieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                formatter={(value) => ['₹' + value.toLocaleString(), 'Value']}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            </PieChart>
          </ResponsiveContainer>
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
