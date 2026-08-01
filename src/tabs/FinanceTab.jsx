import { useMemo } from 'react'
import { num, uniqueByPO } from '../lib/utils'
import { useSort, applySort } from '../lib/useSort'
import { TooltipRow, StatCard, EmptyState, SortTh } from '../components/ui'

export default function FinanceTab({ data }) {
  const poData = useMemo(() => uniqueByPO(data), [data])
  const poSort = useSort()

  const poAccessors = {
    po: r => r['PO Number'],
    entity: r => r['Entity'],
    invoice: r => r['Invoice No'],
    value: r => num(r['PO Value with Tax']),
    dn: r => num(r['DN amount']),
    fs: r => num(r['Final Settlement']),
    overdue: r => r['Payment Overdue Alert'],
  }

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
      if (overdue.toLowerCase().includes('overdue') || overdue.toLowerCase().includes('yes')) {
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
      if (overdue.toLowerCase().includes('overdue') || overdue.toLowerCase().includes('yes')) {
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

  return (
    <>
      <header>
        <div>
          <h1>Finance Overview</h1>
          <div className="date">{financeMetrics.totalOrders} POs • Credit period 30 days • {financeMetrics.entityWise.length} entities</div>
        </div>
      </header>

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
          <div className="chart-period">All POs</div>
        </div>
        <table>
          <thead>
            <tr>
              <SortTh label="PO #" k="po" sort={poSort} />
              <SortTh label="Entity" k="entity" sort={poSort} />
              <SortTh label="Invoice" k="invoice" sort={poSort} />
              <SortTh label="PO Value" k="value" sort={poSort} />
              <SortTh label="DN Amount" k="dn" sort={poSort} />
              <SortTh label="Final Settlement" k="fs" sort={poSort} />
              <SortTh label="Overdue Alert" k="overdue" sort={poSort} />
            </tr>
          </thead>
          <tbody>
            {poData.length === 0 ? (
              <tr><td colSpan={7}><EmptyState /></td></tr>
            ) : applySort(poData, poSort, poAccessors).map((r, i) => {
              const dn = num(r['DN amount'])
              const fs = num(r['Final Settlement'])
              return (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r['PO Number']}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['Entity']}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r['Invoice No'] || '—'}</td>
                  <td style={{ textAlign: 'right' }}>₹{num(r['PO Value with Tax']).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{dn ? `₹${dn.toLocaleString()}` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{fs ? `₹${fs.toLocaleString()}` : '—'}</td>
                  <td><span style={{ color: (r['Payment Overdue Alert'] || '').toLowerCase().includes('overdue') ? '#ef4444' : '#64748b', fontSize: 12 }}>{r['Payment Overdue Alert'] || '—'}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
