import { useState, useMemo } from 'react'
import { num, uniqueByPO, parseDate, formatDate, csvEscape } from '../lib/utils'
import { TooltipRow, StatCard, DateRangePicker, RangePresets, ProfileSection, CSVButton } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { PONumberLink } from '../components/PONumberLink'
import { computeMasterFinance, inr } from '../lib/invoiceFin'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const PAID_KEYWORDS = ['paid', 'received', 'done', 'complete', 'credited', 'success', 'cleared', 'settled', 'yes']

function receivedFor(r) {
  const ps = (r['Payment status'] || '').trim()
  if (!ps) return 0
  const n = num(ps)
  if (n > 0) return n
  const low = ps.toLowerCase()
  if (PAID_KEYWORDS.some(k => low.includes(k))) return num(r['Invoice Value'])
  return 0
}

const iso = (d) => (d instanceof Date && !isNaN(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '—')

export default function FinanceTab({ data, onOpenPO }) {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
  const [dateFrom, setDateFrom] = useState(formatDate(thirtyDaysAgo))
  const [dateTo, setDateTo] = useState(formatDate(today))

  const masterPO = useMemo(() => uniqueByPO(data), [data])
  const mfin = useMemo(() => computeMasterFinance({ poData: masterPO, today: new Date() }), [masterPO])

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

  const masterCsvRows = () => {
    if (!mfin) return []
    const head = ['PO Number', 'Entity', 'Invoices Recorded', 'Net Payable', 'Payment Amount', 'Outstanding', 'Due Date', 'Payment Status', 'Last Payment Date', 'Class']
    const lines = mfin.invoices.map(x => [x.po, x.entity, Math.round(x.billed), Math.round(x.netPay), Math.round(x.paid), Math.round(x.outstd), iso(x.due), x.payStatus, iso(x.lastPay), x.cls].map(v => csvEscape(v)).join(','))
    return [head.join(','), ...lines]
  }

  return (
    <>
      <header>
        <div>
          <h1>Finance Overview</h1>
          <div className="date">{financeMetrics.totalOrders} POs • Credit period 30 days • {financeMetrics.entityWise.length} entities</div>
        </div>
        <ProfileSection />
      </header>

      {mfin && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="orders-title" style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
              📊 Master PO Finance
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div className="chart-period" title="Master PO data sheet (columns AU–BG). POs with Invoices recorded > 0. Due Date drives overdue; paid = Payment amount > 0 or Payment Status Paid/Partially Paid.">
                as of {mfin.date} • {mfin.count} invoiced POs • Net Payable {inr(mfin.netPayable)}
              </div>
              <CSVButton makeRows={masterCsvRows} filename="master_po_finance.csv" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                ⬇ Master PO Finance CSV
              </CSVButton>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
            Source = Master PO data (columns AU–BG). Billed = <b style={{ color: '#e2e8f0' }}>Invoices recorded</b>. Net Payable = <b style={{ color: '#e2e8f0' }}>Net Payable Amount</b>. Paid = Payment amount. Outstanding = Outstanding payment. Overdue by Due Date; paid when Payment amount &gt; 0 or Payment Status = Paid/Partially Paid. (Not scoped by the date filter below — covers all invoiced POs.)
          </div>

          <div className="stats-grid">
            <StatCard label="Invoices Recorded (Billed)" icon="🧾" color="#3b82f6" value={inr(mfin.billed)} change={mfin.count + ' invoiced POs'} />
            <StatCard label="Net Payable" icon="🧮" color="#a78bfa" value={inr(mfin.netPayable)} change="Net Payable Amount" />
            <StatCard label="Paid" icon="✅" color="#22c55e" value={inr(mfin.paid)} change={mfin.paidCount + ' POs'} />
            <StatCard label="Outstanding" icon="⏳" color="#fbbf24" value={inr(mfin.outstanding)} change="Outstanding payment" />
            <StatCard
              label="Overdue" icon="🔴" color="#ef4444"
              value={mfin.overdue.count}
              valueColor={mfin.overdue.count > 0 ? '#ef4444' : '#22c55e'}
              change={mfin.overdue.count > 0 ? inr(mfin.overdue.amount) + ' overdue' : 'No overdue'}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Overdue (Due Date &lt; today, unpaid)</div>
                  {['0-10', '11-20', '21-30', '30+'].map(a => (
                    <TooltipRow key={a} label={a + ' days'} value={inr(mfin.overdueAge[a]) + ' (' + mfin.overdueAgeCount[a] + ')'} valueColor={mfin.overdueAge[a] > 0 ? '#ef4444' : '#64748b'} />
                  ))}
                </>
              }
            />
            <StatCard
              label="Deductions" icon="➖" color="#f97316"
              value={inr(mfin.deductions.total)}
              change={'PR ' + inr(mfin.deductions.purchaseReturn) + ' · Other Debit ' + inr(mfin.deductions.otherDebit)}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Deductions from Net Payable</div>
                  <TooltipRow label="Purchase Return" value={inr(mfin.deductions.purchaseReturn)} valueColor="#f97316" />
                  <TooltipRow label="Brand Discount" value={inr(mfin.deductions.brandDiscount)} valueColor="#f97316" />
                  <TooltipRow label="Other Debit" value={inr(mfin.deductions.otherDebit)} valueColor="#f97316" />
                  <TooltipRow label="Other Adjustments" value={inr(mfin.deductions.otherAdj)} valueColor="#f97316" />
                  <TooltipRow label="TDS/TCS" value={inr(mfin.deductions.tds)} valueColor="#f97316" />
                  <TooltipRow label="Total" value={inr(mfin.deductions.total)} valueColor="#e2e8f0" />
                </>
              }
            />
          </div>

          <div className="recent-orders" style={{ marginTop: 16 }}>
            <div className="orders-header">
              <div className="orders-title">⏳ Pending Details <span style={{ color: '#64748b', fontWeight: 500 }}>— outstanding per Master PO data: Overdue + Not Due</span></div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 700, marginBottom: 8 }}>Overdue by Age</div>
                <table>
                  <thead><tr><th>Bucket</th><th>Amount</th><th># POs</th></tr></thead>
                  <tbody>
                    {['0-10', '11-20', '21-30', '30+'].map(a => (
                      <tr key={a}>
                        <td style={{ padding: '4px 8px', color: '#94a3b8' }}>{a} days</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: mfin.overdueAge[a] > 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>{inr(mfin.overdueAge[a])}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>{mfin.overdueAgeCount[a]}</td>
                      </tr>
                    ))}
                    <tr><td style={{ padding: '4px 8px', fontWeight: 700, borderTop: '1px solid rgba(148,163,184,0.2)' }}>Total Overdue</td><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: '#ef4444', borderTop: '1px solid rgba(148,163,184,0.2)' }}>{inr(mfin.overdue.amount)}</td><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, borderTop: '1px solid rgba(148,163,184,0.2)' }}>{mfin.overdue.count}</td></tr>
                  </tbody>
                </table>
              </div>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 13, color: '#06b6d4', fontWeight: 700, marginBottom: 8 }}>Not Due by Window</div>
                <table>
                  <thead><tr><th>Window</th><th>Amount</th><th># POs</th></tr></thead>
                  <tbody>
                    {['0-10', '11-20', '21-30', '30+'].map(w => (
                      <tr key={w}>
                        <td style={{ padding: '4px 8px', color: '#94a3b8' }}>{w} days</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: mfin.notdueWin[w] > 0 ? '#06b6d4' : '#64748b', fontWeight: 600 }}>{inr(mfin.notdueWin[w])}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>{mfin.notdueWinCount[w]}</td>
                      </tr>
                    ))}
                    <tr><td style={{ padding: '4px 8px', fontWeight: 700, borderTop: '1px solid rgba(148,163,184,0.2)' }}>Total Not Due</td><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: '#06b6d4', borderTop: '1px solid rgba(148,163,184,0.2)' }}>{inr(mfin.notDue.amount)}</td><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, borderTop: '1px solid rgba(148,163,184,0.2)' }}>{mfin.notDue.count}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="recent-orders" style={{ marginTop: 16 }}>
            <div className="orders-header">
              <div className="orders-title">Receivables by Entity</div>
              <div className="chart-period">Master PO data • billed vs paid vs outstanding</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Entity</th><th>POs</th><th>Billed</th><th>Net Payable</th><th>Paid</th><th>Outstanding</th><th>Overdue</th><th>Not Due</th>
                </tr>
              </thead>
              <tbody>
                {mfin.entities.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{e.entity}</td>
                    <td>{e.count}</td>
                    <td style={{ textAlign: 'right' }}>{inr(e.billed)}</td>
                    <td style={{ textAlign: 'right', color: '#a78bfa' }}>{inr(e.netPay)}</td>
                    <td style={{ textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{inr(e.paid)}</td>
                    <td style={{ textAlign: 'right' }}>{inr(e.outstanding)}</td>
                    <td style={{ textAlign: 'right', color: e.overdue > 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>{inr(e.overdue)}</td>
                    <td style={{ textAlign: 'right' }}>{inr(e.notdue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="recent-orders" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                🗂 All Master PO Finance <span style={{ color: '#64748b', fontWeight: 500 }}>— {mfin.count} invoiced POs</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['PO', 'Entity', 'Invoices Recorded', 'Net Payable', 'Paid', 'Outstanding', 'Due Date', 'Payment Status', 'Last Payment Date', 'Class'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: ['PO', 'Entity', 'Payment Status', 'Class'].includes(h) ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mfin.invoices.map(x => (
                    <tr key={x.po}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{x.po}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>{x.entity}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(x.billed)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#a78bfa', textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(x.netPay)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: x.paid > 0 ? '#22c55e' : '#64748b', textAlign: 'right', whiteSpace: 'nowrap' }}>{x.paid > 0 ? inr(x.paid) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: x.cls === 'OVERDUE' ? '#ef4444' : x.outstd > 0 ? '#fbbf24' : '#64748b', fontWeight: x.outstd > 0 ? 700 : 400, textAlign: 'right', whiteSpace: 'nowrap' }}>{x.outstd > 0 ? inr(x.outstd) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(x.due)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontSize: 11, whiteSpace: 'nowrap' }}>{x.payStatus ? <span style={{ color: x.payStatus === 'Paid' ? '#22c55e' : '#94a3b8' }}>{x.payStatus}</span> : <span style={{ color: '#475569' }}>—</span>}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(x.lastPay)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontSize: 11, fontWeight: 600, color: x.cls === 'OVERDUE' ? '#ef4444' : x.cls === 'NOT_DUE' ? '#fbbf24' : '#22c55e', whiteSpace: 'nowrap' }}>{x.cls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
