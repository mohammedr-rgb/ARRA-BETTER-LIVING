import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { toNumKG, parseMMDDDate, uniqueByPO } from '../lib/utils'
import { useSort, applySort } from '../lib/useSort'
import { EmptyState, ProfileSection, SortTh } from '../components/ui'

const REASONS_COLORS = ['#ef4444', '#f97316', '#eab308', '#a855f7', '#3b82f6', '#22c55e', '#06b6d4', '#8b5cf6']

export default function RTOTab({ data }) {
  const poData = useMemo(() => uniqueByPO(data), [data])
  const rtoPOs = useMemo(() => poData.filter(r => r['Status'] === 'RTO'), [poData])
  const rtoSort = useSort()

  const rtoAccessors = {
    po: r => r['PO Number'],
    apptdate: r => parseMMDDDate(r['Appointment Date(MM-DD-YYYY)']),
    city: r => r['City'],
    platform: r => r['Platform'],
    product: r => r['Product'],
    reason: r => r['RTO Reason'],
    tonnage: r => toNumKG(r['RTO Tonnage (MT)']),
    value: r => toNumKG(r['RTO Value at Risk']),
  }

  const rtoMetrics = useMemo(() => {
    const totalRTO = rtoPOs.length
    const totalPO = poData.length
    const rtoRate = totalPO ? (totalRTO / totalPO * 100).toFixed(1) : 0
    const tonnageLost = rtoPOs.reduce((s, r) => s + toNumKG(r['RTO Tonnage (MT)']), 0)
    const valueLost = rtoPOs.reduce((s, r) => s + toNumKG(r['RTO Value at Risk']), 0)
    return { totalRTO, rtoRate: parseFloat(rtoRate), tonnageLost, valueLost }
  }, [rtoPOs, poData.length])

  const cityRTO = useMemo(() => {
    const map = {}
    rtoPOs.forEach(r => {
      const c = r['City']; if (!c) return
      if (!map[c]) map[c] = { city: c, rto: 0, tonnage: 0, value: 0 }
      map[c].rto++
      map[c].tonnage += toNumKG(r['RTO Tonnage (MT)'])
      map[c].value += toNumKG(r['RTO Value at Risk'])
    })
    return Object.values(map).sort((a, b) => b.rto - a.rto)
  }, [rtoPOs])

  const platformRTO = useMemo(() => {
    const map = {}
    rtoPOs.forEach(r => {
      const p = r['Platform'] || 'Unknown'
      if (!map[p]) map[p] = { platform: p, rto: 0, tonnage: 0, value: 0, reasons: {} }
      map[p].rto++
      map[p].tonnage += toNumKG(r['RTO Tonnage (MT)'])
      map[p].value += toNumKG(r['RTO Value at Risk'])
      const reason = r['RTO Reason'] || 'Unknown'
      map[p].reasons[reason] = (map[p].reasons[reason] || 0) + 1
    })
    return Object.values(map).sort((a, b) => b.rto - a.rto)
  }, [rtoPOs])

  const rtoReasons = useMemo(() => {
    const map = {}
    rtoPOs.forEach(r => {
      const reason = r['RTO Reason'] || 'Not Specified'
      if (!map[reason]) map[reason] = { reason, count: 0, tonnage: 0, value: 0 }
      map[reason].count++
      map[reason].tonnage += toNumKG(r['RTO Tonnage (MT)'])
      map[reason].value += toNumKG(r['RTO Value at Risk'])
    })
    return Object.values(map).sort((a, b) => b.count - a.count)
  }, [rtoPOs])

  return (
    <>
      <header>
        <div>
          <h1>Returns (RTO) Analysis</h1>
          <div className="date">{rtoPOs.length} returned orders out of {poData.length} total • Platform: All</div>
        </div>
        <ProfileSection />
      </header>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ borderLeft: '3px solid #ef4444' }}>
          <div className="stat-label">RTO Orders</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>{rtoMetrics.totalRTO}</div>
          <div className="stat-change">of {poData.length} total POs</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #f97316' }}>
          <div className="stat-label">RTO Rate</div>
          <div className="stat-value" style={{ color: '#f97316' }}>{rtoMetrics.rtoRate}%</div>
          <div className="stat-change">percentage returned</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #eab308' }}>
          <div className="stat-label">Tonnage Lost</div>
          <div className="stat-value" style={{ color: '#eab308' }}>{Math.round(rtoMetrics.tonnageLost).toLocaleString()} KG</div>
          <div className="stat-change">total return tonnage</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '3px solid #ef4444' }}>
          <div className="stat-label">Value at Risk</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>₹{Math.round(rtoMetrics.valueLost).toLocaleString()}</div>
          <div className="stat-change">financial exposure</div>
        </div>
      </div>

      {rtoReasons.length > 0 && (
        <div className="charts-row" style={{ marginBottom: 20 }}>
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title">RTO by Reason</div>
              <div className="chart-period">Return cause distribution</div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={rtoReasons}
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={60}
                  dataKey="count"
                  nameKey="reason"
                  label={({ reason, percent }) => `${String(reason).slice(0, 18)} ${(percent * 100).toFixed(0)}%`}
                  labelLine
                >
                  {rtoReasons.map((e, i) => (
                    <Cell key={i} fill={REASONS_COLORS[i % REASONS_COLORS.length]} />
                  ))}
                </Pie>
                <ReTooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload
                    return (
                      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '12px 16px', fontSize: 13, maxWidth: 260 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6, color: '#f1f5f9' }}>{row.reason}</div>
                        <div style={{ color: '#94a3b8' }}>Occurrences: <span style={{ color: '#ef4444', fontWeight: 600 }}>{row.count}</span></div>
                        <div style={{ color: '#94a3b8' }}>Value at Risk: <span style={{ color: '#ef4444', fontWeight: 600 }}>₹{Math.round(row.value).toLocaleString()}</span></div>
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} formatter={(value) => <span style={{ color: '#94a3b8' }}>{String(value).slice(0, 24)}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title">RTO by City</div>
              <div className="chart-period">Return concentration</div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cityRTO}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="city" stroke="#64748b" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
                <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                <ReTooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload
                    return (
                      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6, color: '#f1f5f9' }}>{row.city}</div>
                        <div style={{ color: '#94a3b8' }}>RTO Orders: <span style={{ color: '#ef4444', fontWeight: 600 }}>{row.rto}</span></div>
                        <div style={{ color: '#94a3b8' }}>Value at Risk: <span style={{ color: '#ef4444', fontWeight: 600 }}>₹{Math.round(row.value).toLocaleString()}</span></div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="rto" fill="#ef4444" radius={[6, 6, 0, 0]} name="RTO orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">RTO by City</div>
          <div className="chart-period">Highest return cities</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>City</th>
              <th>RTO Orders</th>
              <th>Tonnage Lost (KG)</th>
              <th>Value at Risk</th>
            </tr>
          </thead>
          <tbody>
            {cityRTO.length === 0 ? (
              <tr><td colSpan={4}><EmptyState /></td></tr>
            ) : cityRTO.map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.city}</td>
                <td style={{ fontWeight: 600, color: '#ef4444' }}>{row.rto}</td>
                <td>{Math.round(row.tonnage).toLocaleString()}</td>
                <td style={{ color: '#ef4444', fontWeight: 600 }}>₹{Math.round(row.value).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">RTO by Platform</div>
          <div className="chart-period">Platform-wise return analysis</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>RTO Orders</th>
              <th>Tonnage Lost (KG)</th>
              <th>Value at Risk</th>
              <th>Top RTO Reason</th>
            </tr>
          </thead>
          <tbody>
            {platformRTO.length === 0 ? (
              <tr><td colSpan={5}><EmptyState /></td></tr>
            ) : platformRTO.map((row, i) => {
              const topReason = Object.entries(row.reasons).sort((a, b) => b[1] - a[1])[0]
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{row.platform}</td>
                  <td style={{ fontWeight: 600, color: '#ef4444' }}>{row.rto}</td>
                  <td>{Math.round(row.tonnage).toLocaleString()}</td>
                  <td style={{ color: '#ef4444', fontWeight: 600 }}>₹{Math.round(row.value).toLocaleString()}</td>
                  <td style={{ fontSize: 12, color: '#94a3b8' }}>{topReason ? `${topReason[0]} (${topReason[1]})` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rtoReasons.length > 0 && (
        <div className="recent-orders" style={{ marginBottom: 20 }}>
          <div className="orders-header">
            <div className="orders-title">RTO Root Cause Analysis</div>
            <div className="chart-period">Top reasons for returns</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>RTO Reason</th>
                <th>Occurrences</th>
                <th>Tonnage Lost (KG)</th>
                <th>Value at Risk</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const total = rtoReasons.reduce((s, r) => s + r.count, 0)
                return rtoReasons.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row.reason}</td>
                    <td style={{ color: '#ef4444', fontWeight: 600 }}>{row.count}</td>
                    <td>{Math.round(row.tonnage).toLocaleString()}</td>
                    <td style={{ color: '#ef4444', fontWeight: 600 }}>₹{Math.round(row.value).toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${total ? row.count / total * 100 : 0}%`, height: '100%', background: '#ef4444', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{total ? (row.count / total * 100).toFixed(1) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>
          <div style={{ marginTop: 12, padding: 16, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>RTO Reduction Suggestions</div>
            <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
              {rtoReasons.length > 0 && <li><strong style={{ color: '#f1f5f9' }}>Target #{1} reason:</strong> {rtoReasons[0].reason} ({rtoReasons[0].count} occurrences) — implement corrective action plan.</li>}
              <li><strong style={{ color: '#f1f5f9' }}>Improve packaging:</strong> Damage-related RTO can be reduced with better packaging and handling SOPs.</li>
              <li><strong style={{ color: '#f1f5f9' }}>Customer communication:</strong> Pre-delivery SMS/email with delivery window reduces rejection and RTO.</li>
              <li><strong style={{ color: '#f1f5f9' }}>City-specific stock allocation:</strong> High RTO rate cities need separate stock allocation.</li>
            </ul>
          </div>
        </div>
      )}

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">Recent RTO Orders</div>
          <div className="chart-period">Last 50 returned orders</div>
        </div>
        <table>
          <thead>
            <tr>
              <SortTh label="PO #" k="po" sort={rtoSort} />
              <SortTh label="Appt Date" k="apptdate" sort={rtoSort} />
              <SortTh label="City" k="city" sort={rtoSort} />
              <SortTh label="Platform" k="platform" sort={rtoSort} />
              <SortTh label="Product" k="product" sort={rtoSort} />
              <SortTh label="RTO Reason" k="reason" sort={rtoSort} />
              <SortTh label="Tonnage Lost" k="tonnage" sort={rtoSort} />
              <SortTh label="Value at Risk" k="value" sort={rtoSort} />
            </tr>
          </thead>
          <tbody>
            {rtoPOs.length === 0 ? (
              <tr><td colSpan={8}><EmptyState /></td></tr>
            ) : applySort(rtoPOs, rtoSort, rtoAccessors).slice(0, 50).map((r, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r['PO Number']}</td>
                <td style={{ fontSize: 12, color: '#94a3b8' }}>{r['Appointment Date(MM-DD-YYYY)'] || '—'}</td>
                <td>{r['City'] || '—'}</td>
                <td>{r['Platform'] || '—'}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['Product'] || '—'}</td>
                <td style={{ color: '#ef4444' }}>{r['RTO Reason'] || '—'}</td>
                <td>{Math.round(toNumKG(r['RTO Tonnage (MT)'])).toLocaleString()} KG</td>
                <td style={{ color: '#ef4444', fontWeight: 600 }}>₹{Math.round(toNumKG(r['RTO Value at Risk'])).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
