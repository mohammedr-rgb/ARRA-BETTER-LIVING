import { useState, useMemo, useEffect } from 'react'
import { num, uniqueByPO, parseDate, formatDate, csvEscape } from '../lib/utils'
import { TooltipRow, StatCard, DateRangePicker, RangePresets, ProfileSection, CSVButton } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { PONumberLink } from '../components/PONumberLink'
import { fetchFinanceSheets, inr } from '../lib/invoiceFin'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const PAID_KEYWORDS = ['paid', 'received', 'done', 'complete', 'credited', 'success', 'cleared', 'settled', 'yes']

export function receivedFor(r) {
  const ps = (r['Payment status'] || '').trim()
  if (!ps) return 0
  const n = num(ps)
  if (n > 0) return n
  const low = ps.toLowerCase()
  if (PAID_KEYWORDS.some(k => low.includes(k))) return num(r['Invoice Value'])
  return 0
}

const iso = (d) => (d instanceof Date && !isNaN(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '—')
const daysLate = (d, today) => (d instanceof Date && !isNaN(d) ? Math.max(0, Math.round((today - d) / 86400000)) : 0)

const AGE_ORDER = ['0-15', '16-30', '31-60', '60+']
const WIN_ORDER = ['0-7', '8-15', '16-30', '30+']
const BUCKET_COLORS = { '0-15': '#22c55e', '16-30': '#eab308', '31-60': '#f97316', '60+': '#ef4444' }

export default function FinanceTab({ data, onOpenPO }) {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
  const [dateFrom, setDateFrom] = useState(formatDate(thirtyDaysAgo))
  const [dateTo, setDateTo] = useState(formatDate(today))

  // ---------------- INVOICE RECEIVABLES (live from sheets) ----------------
  const [fin, setFin] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadFin = () => {
    setIsRefreshing(true)
    setError(null)
    fetchFinanceSheets()
      .then(f => { setFin(f); setLoading(false); setIsRefreshing(false) })
      .catch(e => { setLoading(false); setIsRefreshing(false); setError(e.message || 'Failed to load finance sheets') })
  }

  useEffect(() => { loadFin() }, [])

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
    let totalPOValue = 0, totalDN = 0, totalFS = 0, overdueCount = 0, invoiceCount = 0, totalInvoiceValue = 0, receivedAmount = 0
    const overduePOs = []
    const entityMap = {}
    for (const r of poData) {
      const val = num(r['PO Value with Tax'])
      const dn = num(r['DN amount'])
      const fs = num(r['Final Settlement'])
      const iv = num(r['Invoice Value'])
      const recv = receivedFor(r)
      const overdue = r['Payment Overdue Alert'] || ''
      totalPOValue += val
      totalDN += dn
      totalFS += fs
      totalInvoiceValue += iv
      receivedAmount += recv
      const isOverdue = ['overdue', 'yes'].includes(overdue.trim().toLowerCase())
      if (isOverdue) {
        overdueCount++
        overduePOs.push(r['PO Number'])
      }
      if (r['Invoice No']) invoiceCount++
      const e = r['Entity'] || 'Unknown'
      if (!entityMap[e]) entityMap[e] = { entity: e, orders: 0, poValue: 0, dn: 0, fs: 0, invoices: 0, overdueCount: 0, invoiceValue: 0, received: 0 }
      entityMap[e].orders++
      entityMap[e].poValue += val
      entityMap[e].dn += dn
      entityMap[e].fs += fs
      entityMap[e].invoiceValue += iv
      entityMap[e].received += recv
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
      totalInvoiceValue: Math.round(totalInvoiceValue),
      receivedAmount: Math.round(receivedAmount),
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

  const overdueAgeData = useMemo(() => fin
    ? AGE_ORDER.filter(k => fin.overdueAge[k]).map(k => ({ name: k + ' days', Amount: Math.round(fin.overdueAge[k]), fill: BUCKET_COLORS[k] }))
    : [], [fin])

  const notdueWinData = useMemo(() => fin
    ? WIN_ORDER.filter(k => fin.notdueWin[k]).map(k => ({ name: k + ' days', Amount: Math.round(fin.notdueWin[k]) }))
    : [], [fin])

  const overdueCsvRows = () => {
    if (!fin) return []
    const head = ['Invoice Number', 'Entity', 'Amount', 'Due Date', 'Days Overdue', 'Aging Bucket', 'Zoho Status', 'In Swiggy Report', 'Swiggy Outstanding']
    const lines = fin.overdueList.map(x => [x.num, x.entity, x.total, iso(x.due), daysLate(x.due, new Date(fin.date)), '', x.status, x.inSw ? 'Yes' : 'No', x.swOutstd ?? ''].map(v => csvEscape(v)).join(','))
    return [head.join(','), ...lines]
  }

  const chaseColumns = [
    { key: 'inv', label: 'Invoice', accessor: r => r.num, render: r => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.num}</span> },
    { key: 'entity', label: 'Entity', accessor: r => r.entity },
    { key: 'amt', label: 'Amount', accessor: r => r.total, align: 'right', render: r => inr(r.total) },
    { key: 'due', label: 'Due Date', accessor: r => r.due, render: r => iso(r.due) },
    { key: 'days', label: 'Days Overdue', accessor: r => daysLate(r.due, new Date(fin.date)), align: 'right', render: r => {
      const d = daysLate(r.due, new Date(fin.date))
      const b = d <= 15 ? '0-15' : d <= 30 ? '16-30' : d <= 60 ? '31-60' : '60+'
      return <span style={{ color: BUCKET_COLORS[b], fontWeight: 600 }}>{d}</span>
    } },
    { key: 'inSw', label: 'In Swiggy Report', accessor: r => r.inSw ? 'Yes' : 'No', render: r => <span style={{ color: r.inSw ? '#22c55e' : '#eab308', fontSize: 12 }}>{r.inSw ? 'Yes' : 'No'}</span> },
    { key: 'status', label: 'Zoho Status', accessor: r => r.status, render: r => <span style={{ fontSize: 12, color: '#94a3b8' }}>{r.status}</span> },
  ]

  return (
    <>
      <header>
        <div>
          <h1>Finance Overview</h1>
          <div className="date">{financeMetrics.totalOrders} POs • Credit period 30 days • {financeMetrics.entityWise.length} entities</div>
        </div>
        <ProfileSection />
      </header>

      {/* ---------------- INVOICE RECEIVABLES SECTION ---------------- */}
      {loading ? (
        <div className="recent-orders">
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading invoice receivables...</div>
        </div>
      ) : error ? (
        <div className="recent-orders" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
          <div style={{ color: '#ef4444', fontSize: 13, padding: 8 }}>
            Failed to load finance sheets: {error} — <a href="#" onClick={e => { e.preventDefault(); loadFin() }} style={{ color: '#3b82f6' }}>retry</a>
          </div>
        </div>
      ) : fin && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="orders-title" style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
              📒 Invoice Receivables — Swiggy Entities
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="chart-period">as of {fin.date} • {fin.masterCount} invoices • {fin.swCount} in Swiggy report</div>
              <button onClick={loadFin} disabled={isRefreshing} style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isRefreshing ? 0.6 : 1 }}>
                ↻ {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="stats-grid">
            <StatCard
              label="Billed" icon="🧾" color="#3b82f6"
              value={inr(fin.totals.billed)} change={fin.counts.billed + ' invoices'}
            />
            <StatCard
              label="Paid" icon="✅" color="#22c55e"
              value={inr(fin.totals.paid)} change={fin.collectionPct.toFixed(1) + '% collected'}
              changeColor="#22c55e"
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Collected</div>
                  <TooltipRow label="Invoices paid" value={fin.counts.paid + ' of ' + fin.counts.billed} valueColor="#22c55e" />
                  <TooltipRow label="Collection rate" value={fin.collectionPct.toFixed(1) + '%'} valueColor="#22c55e" />
                </>
              }
            />
            <StatCard
              label="Pending" icon="⏳" color="#a855f7"
              value={inr(fin.totals.pending)} change={fin.counts.pending + ' invoices'}
            />
            <StatCard
              label="Overdue" icon="🔴" color="#ef4444"
              value={inr(fin.totals.overdue)} change={fin.counts.overdue + ' invoices past due'}
              valueColor="#ef4444"
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Overdue aging</div>
                  {AGE_ORDER.filter(k => fin.overdueAge[k]).map(k => (
                    <TooltipRow key={k} label={k + ' days'} value={inr(fin.overdueAge[k])} valueColor={BUCKET_COLORS[k]} />
                  ))}
                </>
              }
            />
            <StatCard
              label="Not Due" icon="📅" color="#06b6d4"
              value={inr(fin.totals.notdue)} change={fin.counts.notdue + ' invoices due ahead'}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Due in next</div>
                  {WIN_ORDER.filter(k => fin.notdueWin[k]).map(k => (
                    <TooltipRow key={k} label={k + ' days'} value={inr(fin.notdueWin[k])} valueColor="#06b6d4" />
                  ))}
                </>
              }
            />
            <StatCard
              label="Actual Received (Bank)" icon="💸" color="#f97316"
              value={inr(fin.bank.total)} change={fin.bank.rows + ' bank credits (NEFT/RTGS)'}
              valueColor={fin.bank.total > 0 ? '#22c55e' : '#94a3b8'}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Bank statement (Payment statement tab)</div>
                  {fin.bank.byEntity && Object.entries(fin.bank.byEntity).sort((a, b) => b[1] - a[1]).map(([e, v]) => (
                    <TooltipRow key={e} label={e} value={inr(v)} valueColor="#f97316" />
                  ))}
                  <TooltipRow label="Swiggy payment report" value={inr(fin.paymentTotal)} valueColor="#3b82f6" />
                  <TooltipRow label="Zoho marks paid" value={inr(fin.totals.paid)} valueColor="#eab308" />
                  <TooltipRow label="Zoho paid not in bank" value={inr(fin.zohoPaidNotInBank)} valueColor="#ef4444" />
                </>
              }
            />
          </div>

          {fin.overdueList.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#ef44441a', color: '#ef4444', border: '1px solid #ef444440' }}>
                🔴 {fin.counts.overdue} overdue invoices — {inr(fin.totals.overdue)} to chase
              </span>
              <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#eab3081a', color: '#eab308', border: '1px solid #eab30840' }}>
                ⏰ {fin.paidLateCount} invoices ({inr(fin.paidLateValue)}) were paid late
              </span>
              <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#3b82f61a', color: '#3b82f6', border: '1px solid #3b82f640' }}>
                ⚠️ {fin.unconfirmedPaid.length} invoices ({inr(fin.unconfirmedPaid.reduce((s, x) => s + x.total, 0))}) paid in Zoho but not in Swiggy report
              </span>
            </div>
          )}

          {fin.bank.flags.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <div style={{ width: '100%', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                Bank reconciliation flags ({fin.bank.matchedPayments}/{fin.bank.rows + fin.bank.flags.filter(f => f.kind === 'not_in_bank').length} credits matched vs payment report)
              </div>
              {fin.bank.flags.map((f, i) => (
                <span key={i} title={f.ref} style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: f.kind === 'not_in_bank' ? '#ef44441a' : '#eab3081a', color: f.kind === 'not_in_bank' ? '#ef4444' : '#eab308', border: '1px solid ' + (f.kind === 'not_in_bank' ? '#ef444440' : '#eab30840') }}>
                  {f.kind === 'not_in_bank' ? '🔴' : '⚠️'} {f.entity} {inr(f.amount)} on {f.date} — {f.kind === 'not_in_bank' ? 'in Swiggy report, no bank credit' : 'bank credit not in Swiggy report'}
                </span>
              ))}
            </div>
          )}

          <div className="charts-row" style={{ marginTop: 16 }}>
            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title">Overdue Aging</div>
                <div className="chart-period">invoices past due date</div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={overdueAgeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <ReTooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                    formatter={(value) => [inr(value), '']}
                  />
                  <Bar dataKey="Amount" radius={[4, 4, 0, 0]}>
                    {overdueAgeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title">Due Ahead</div>
                <div className="chart-period">pending invoices by due window</div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={notdueWinData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <ReTooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                    formatter={(value) => [inr(value), '']}
                  />
                  <Bar dataKey="Amount" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="recent-orders" style={{ marginTop: 16 }}>
            <div className="orders-header">
              <div className="orders-title">Receivables by Entity</div>
              <div className="chart-period">Zoho master • billed vs paid vs outstanding</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Invoices</th>
                  <th>Billed</th>
                  <th>Paid</th>
                  <th>Pending</th>
                  <th>Overdue</th>
                  <th>Not Due</th>
                  <th>Coll %</th>
                </tr>
              </thead>
              <tbody>
                {fin.entities.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{e.entity}</td>
                    <td>{e.count} <span style={{ color: '#64748b', fontSize: 11 }}>({e.inSw} in Swiggy)</span></td>
                    <td style={{ textAlign: 'right' }}>{inr(e.billed)}</td>
                    <td style={{ textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{inr(e.paid)}</td>
                    <td style={{ textAlign: 'right' }}>{inr(e.pending)}</td>
                    <td style={{ textAlign: 'right', color: e.overdue > 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>{inr(e.overdue)}</td>
                    <td style={{ textAlign: 'right' }}>{inr(e.notdue)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: e.coll < 30 ? '#ef4444' : e.coll < 50 ? '#eab308' : '#22c55e' }}>{e.coll.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="recent-orders" style={{ marginTop: 16 }}>
            <div className="orders-header">
              <div className="orders-title">🚨 Overdue Chase List</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 12 }}>
                <div className="chart-period">{fin.overdueList.length} invoices</div>
                <CSVButton makeRows={overdueCsvRows} filename="overdue_chase_list.csv" />
              </div>
            </div>
            <DataTable
              columns={chaseColumns}
              rows={fin.overdueList}
              pageSize={10}
              filename="overdue_chase_list.csv"
              emptyMessage="No overdue invoices"
            />
          </div>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '4px 0 20px' }} />

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
        <StatCard
          label="Total Invoice Value" icon="🧾" color="#06b6d4"
          value={'₹' + financeMetrics.totalInvoiceValue.toLocaleString()}
          change="Sum of Invoice Value" changeColor="#94a3b8"
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Invoice Summary</div>
              <TooltipRow label="Invoice Value" value={'₹' + financeMetrics.totalInvoiceValue.toLocaleString()} valueColor="#06b6d4" />
              <TooltipRow label="PO Value" value={'₹' + financeMetrics.totalPOValue.toLocaleString()} valueColor="#3b82f6" />
              <TooltipRow label="Invoices Issued" value={financeMetrics.invoiceCount + ' of ' + financeMetrics.totalOrders + ' POs'} valueColor="#22c55e" />
            </>
          }
        />
        <StatCard
          label="Received Amount" icon="✅" color="#f97316"
          value={'₹' + financeMetrics.receivedAmount.toLocaleString()}
          valueColor={financeMetrics.receivedAmount > 0 ? '#22c55e' : '#94a3b8'}
          change={financeMetrics.receivedAmount > 0 ? 'From Payment status column' : 'No payments recorded yet'}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Received Amount</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Sum of amounts in the "Payment status" column of the source sheet (e.g. "Received 50,000"). Empty or "Paid" without amount counts ₹0.</div>
              <TooltipRow label="Received" value={'₹' + financeMetrics.receivedAmount.toLocaleString()} valueColor="#22c55e" />
              <TooltipRow label="Outstanding" value={'₹' + Math.max(0, financeMetrics.totalInvoiceValue - financeMetrics.receivedAmount).toLocaleString()} valueColor="#ef4444" />
            </>
          }
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
              <th>Invoice Value</th>
              <th>Received</th>
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
                  <td style={{ textAlign: 'right' }}>₹{Math.round(row.invoiceValue).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: row.received > 0 ? '#22c55e' : '#94a3b8', fontWeight: 600 }}>₹{Math.round(row.received).toLocaleString()}</td>
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
            { key: 'invvalue', label: 'Invoice Value', accessor: r => num(r['Invoice Value']), align: 'right', render: r => num(r['Invoice Value']) ? '₹' + num(r['Invoice Value']).toLocaleString() : '—' },
            { key: 'received', label: 'Received', accessor: r => receivedFor(r), align: 'right', render: r => receivedFor(r) ? '₹' + receivedFor(r).toLocaleString() : '—' },
            { key: 'dn', label: 'DN Amount', accessor: r => num(r['DN amount']), align: 'right', render: r => num(r['DN amount']) ? '₹' + num(r['DN amount']).toLocaleString() : '—' },
            { key: 'fs', label: 'Final Settlement', accessor: r => num(r['Final Settlement']), align: 'right', render: r => num(r['Final Settlement']) ? '₹' + num(r['Final Settlement']).toLocaleString() : '—' },
            { key: 'pstatus', label: 'Payment Status', accessor: r => r['Payment status'] || '—', render: r => <span style={{ color: (r['Payment status'] || '').trim() ? '#22c55e' : '#64748b', fontSize: 12 }}>{r['Payment status'] || '—'}</span> },
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