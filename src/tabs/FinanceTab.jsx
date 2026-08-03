import { useState, useMemo } from 'react'
import { num, uniqueByPO, parseDate, formatDate } from '../lib/utils'
import { TooltipRow, StatCard, DateRangePicker, RangePresets, ProfileSection } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { PONumberLink } from '../components/PONumberLink'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const CHART_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#eab308', '#f97316', '#06b6d4', '#ef4444', '#8b5cf6']

export default function FinanceTab({ data, onOpenPO }) {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
  const [dateFrom, setDateFrom] = useState(formatDate(thirtyDaysAgo))
  const [dateTo, setDateTo] = useState(formatDate(today))

  const filteredData = useMemo(() => {
    const from = parseDate(dateFrom)
    const to = parseDate(dateTo)
    if (!from || !to) return data
    return data.filter(r => {
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      if (!d) return true
      return d >= from && d <= to
    })
  }, [data, dateFrom, dateTo])

  const poData = useMemo(() => uniqueByPO(filteredData), [filteredData])

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
      const isOverdue = ['overdue', 'yes'].includes(overdue.trim().toLowerCase())
      if (isOverdue) {
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
      if (isOverdue) {
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

  const entityChartData = useMemo(() => financeMetrics.entityWise.slice(0, 8).map(e => ({
    name: e.entity.length > 14 ? e.entity.slice(0, 12) + '...' : e.entity,
    'PO Value': Math.round(e.poValue),
    'DN Amount': Math.round(e.dn),
    'Settlement': Math.round(e.fs),
  })), [financeMetrics])

  const settlementPieData = useMemo(() => {
    const settled = financeMetrics.totalFS
    const pending = Math.max(0, financeMetrics.pendingSettlement)
    return [
      { name: 'Settled', value: Math.round(settled) },
      { name: 'Pending', value: Math.round(pending) },
    ].filter(d => d.value > 0)
  }, [financeMetrics])

  return (
    <>
      <header>
        <div>
          <h1>Finance Overview</h1>
          <div className="date">{financeMetrics.totalOrders} POs • Credit period 30 days • {financeMetrics.entityWise.length} entities</div>
        </div>
        <ProfileSection />
      </header>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
        <RangePresets onFrom={setDateFrom} onTo={setDateTo} />
        <DateRangePicker from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo} />
      </div>

      <div className="stats-grid">
        <StatCard
          label="Total PO Value" icon="💰" color="#3b82f6"
          value={'₹' + financeMetrics.totalPOValue.toLocaleString()} change="▲ PO Value with Tax" changeColor="#22c55e"
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>PO Value Summary</div>
              <TooltipRow label="Total" value={'₹' + financeMetrics.totalPOValue.toLocaleString()} valueColor="#3b82f6" />
              <TooltipRow label="Avg per PO" value={'₹' + financeMetrics.avgOrderValue.toLocaleString()} valueColor="#22c55e" />
            </>
          }
        />
        <StatCard
          label="Avg Order Value" icon="📊" color="#a855f7"
          value={'₹' + financeMetrics.avgOrderValue.toLocaleString()} change="Average PO value"
        />
        <StatCard
          label="Pending Settlement" icon="📋" color="#ef4444"
          value={'₹' + financeMetrics.pendingSettlement.toLocaleString()}
          valueColor={financeMetrics.pendingSettlement > 0 ? '#ef4444' : '#22c55e'}
          change="DN − Final Settlement"
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Settlement Details</div>
              <TooltipRow label="DN Amount" value={'₹' + financeMetrics.totalDN.toLocaleString()} valueColor="#3b82f6" />
              <TooltipRow label="Final Settlement" value={'₹' + financeMetrics.totalFS.toLocaleString()} valueColor="#22c55e" />
              <TooltipRow label="Pending" value={'₹' + financeMetrics.pendingSettlement.toLocaleString()} valueColor={financeMetrics.pendingSettlement > 0 ? '#ef4444' : '#22c55e'} />
            </>
          }
        />
        <StatCard
          label="Payment Overdue" icon="🔴" color="#eab308"
          value={financeMetrics.overdueCount}
          valueColor={financeMetrics.overdueCount > 0 ? '#ef4444' : '#22c55e'}
          change={financeMetrics.overdueCount > 0 ? 'POs with overdue alerts' : 'No overdue'}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Overdue POs</div>
              {financeMetrics.overduePOs.length === 0 ? <div style={{ fontSize: 12, color: '#94a3b8' }}>None</div> : financeMetrics.overduePOs.slice(0, 10).map(po => (
                <div key={po} style={{ fontSize: 11, fontFamily: 'monospace', color: '#ef4444' }}>{po}</div>
              ))}
              {financeMetrics.overduePOs.length > 10 && <div style={{ fontSize: 11, color: '#94a3b8' }}>...and {financeMetrics.overduePOs.length - 10} more</div>}
            </>
          }
          tooltipStyle={{ maxHeight: 260, overflowY: 'auto', whiteSpace: 'normal' }}
        />
        <StatCard
          label="Invoices Issued" icon="📄" color="#22c55e"
          value={financeMetrics.invoiceCount} change={`Of ${financeMetrics.totalOrders} POs`} changeColor="#94a3b8"
        />
      </div>

      <div className="charts-row" style={{ marginBottom: 20 }}>
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Entity-wise Value</div>
            <div className="chart-period">PO Value, DN & Settlement</div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={entityChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <ReTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                formatter={(value) => ['₹' + value.toLocaleString(), '']}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="PO Value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="DN Amount" fill="#a855f7" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Settlement" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Settlement Status</div>
            <div className="chart-period">Settled vs Pending</div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={settlementPieData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine
              >
                {settlementPieData.map((entry, index) => (
                  <Cell key={index} fill={index === 0 ? '#22c55e' : '#ef4444'} />
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
          <div className="chart-period">All POs • click a row for details</div>
        </div>
        <DataTable
          columns={[
            { key: 'po', label: 'PO #', accessor: r => r['PO Number'], render: r => <PONumberLink row={r} onOpenPO={onOpenPO} /> },
            { key: 'entity', label: 'Entity', accessor: r => r['Entity'], render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r['Entity']}</span> },
            { key: 'invoice', label: 'Invoice', accessor: r => r['Invoice No'] || '—', render: r => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r['Invoice No'] || '—'}</span> },
            { key: 'value', label: 'PO Value', accessor: r => num(r['PO Value with Tax']), align: 'right', render: r => '₹' + num(r['PO Value with Tax']).toLocaleString() },
            { key: 'dn', label: 'DN Amount', accessor: r => num(r['DN amount']), align: 'right', render: r => num(r['DN amount']) ? '₹' + num(r['DN amount']).toLocaleString() : '—' },
            { key: 'fs', label: 'Final Settlement', accessor: r => num(r['Final Settlement']), align: 'right', render: r => num(r['Final Settlement']) ? '₹' + num(r['Final Settlement']).toLocaleString() : '—' },
            { key: 'overdue', label: 'Overdue Alert', accessor: r => r['Payment Overdue Alert'] || '—', render: r => <span style={{ color: (r['Payment Overdue Alert'] || '').toLowerCase().includes('overdue') ? '#ef4444' : '#64748b', fontSize: 12 }}>{r['Payment Overdue Alert'] || '—'}</span> },
          ]}
          rows={poData}
          pageSize={10}
          filename="finance_po_settlement.csv"
          onRowClick={onOpenPO}
          emptyMessage="No POs"
        />
      </div>
    </>
  )
}
