import { useMemo } from 'react'
import { uniqueByPO, csvEscape } from '../lib/utils'
import { TooltipRow, StatCard, ProfileSection, CSVButton } from '../components/ui'
import { computeMasterFinance, inr } from '../lib/invoiceFin'

const iso = (d) => (d instanceof Date && !isNaN(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '—')

export default function FinanceTab({ data }) {
  const masterPO = useMemo(() => uniqueByPO(data), [data])
  const mfin = useMemo(() => computeMasterFinance({ poData: masterPO, today: new Date() }), [masterPO])

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
          <div className="date">{mfin ? `${mfin.count} invoiced POs • Credit period 30 days • ${mfin.entities.length} entities` : 'Loading…'}</div>
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
    </>
  )
}
