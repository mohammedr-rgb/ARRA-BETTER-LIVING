import { useState, useMemo } from 'react'
import { num, parseDate, formatDate, uniqueByPO } from '../lib/utils'
import { CSVButton, DateRangePicker, EmptyState, ProfileSection } from '../components/ui'

export default function PerformanceTab({ data, platformFilter }) {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
  const [wowDateFrom, setWowDateFrom] = useState(formatDate(thirtyDaysAgo))
  const [wowDateTo, setWowDateTo] = useState(formatDate(today))
  const [wowPlatformFilter, setWowPlatformFilter] = useState('All')

  const wowPlatforms = useMemo(() => {
    const set = new Set()
    data.forEach(r => { if (r['Platform']) set.add(r['Platform']) })
    return ['All', ...Array.from(set).sort()]
  }, [data])

  const analysis = useMemo(() => {
    const filtered = platformFilter === 'All' ? data : data.filter(r => r['Platform'] === platformFilter)
    const poData = uniqueByPO(filtered)

    const leadDays = (a, b) => {
      const da = parseDate(a); const db = parseDate(b)
      if (!da || !db) return null
      return Math.round((db - da) / (1000 * 60 * 60 * 24))
    }

    const toNumKG = (v) => {
      const s = String(v).replace(/[^0-9.-]/g, '')
      const n = parseFloat(s)
      return isNaN(n) ? 0 : n
    }

    const pocMap = {}
    for (const r of poData) {
      const p = r['Platform']
      if (!p) continue
      if (!pocMap[p]) pocMap[p] = { platform: p, count: 0, aging: {} }
      pocMap[p].count++
      const aging = r['PO Aging'] || 'N/A'
      pocMap[p].aging[aging] = (pocMap[p].aging[aging] || 0) + 1
    }

    const poAgg = {}
    for (const r of filtered) {
      const po = r['PO Number']
      if (!po) continue
      if (!poAgg[po]) poAgg[po] = { transporter: r['Transporter'], charge: 0, tonnage: 0, value: 0 }
      poAgg[po].charge += toNumKG(r['Transport Charge'])
      poAgg[po].tonnage += toNumKG(r['Tonnage'])
      poAgg[po].value += toNumKG(r['PO Value with Tax'])
    }
    const transportMap = {}
    for (const agg of Object.values(poAgg)) {
      const t = agg.transporter
      if (!t) continue
      if (!transportMap[t]) transportMap[t] = { transporter: t, charge: 0, tonnage: 0, value: 0, count: 0 }
      transportMap[t].charge += agg.charge
      transportMap[t].tonnage += agg.tonnage
      transportMap[t].value += agg.value
      transportMap[t].count++
    }
    const transportData = Object.values(transportMap).map(x => ({
      ...x, count: x.count,
      costPerKG: x.tonnage ? (x.charge / x.tonnage) : 0,
      costPct: x.value ? (x.charge / x.value * 100) : 0,
    })).sort((a, b) => b.charge - a.charge)

    const allBooking = []; const allDelivery = []; const allTotal = []
    const leadMap = {}
    for (const r of poData) {
      const released = r['PO Released Date(MM-DD-YYYY)']
      const appt = r['Appointment Date(MM-DD-YYYY)']
      const delivered = r['Actual Delivery Date(MM-DD-YYYY)']
      const t1 = leadDays(released, appt)
      const t2 = leadDays(appt, delivered)
      if (t1 === null && t2 === null) continue
      if (t1 !== null && t1 >= 0) allBooking.push(t1)
      if (t2 !== null && t2 >= 0) allDelivery.push(t2)
      if (t1 !== null && t2 !== null && t1 >= 0 && t2 >= 0) allTotal.push(t1 + t2)
      const p = r['Platform']
      if (!p) continue
      if (!leadMap[p]) leadMap[p] = { platform: p, bookingDays: [], deliveryDays: [], totalDays: [] }
      if (t1 !== null && t1 >= 0) leadMap[p].bookingDays.push(t1)
      if (t2 !== null && t2 >= 0) leadMap[p].deliveryDays.push(t2)
      if (t1 !== null && t2 !== null && t1 >= 0 && t2 >= 0) leadMap[p].totalDays.push(t1 + t2)
    }
    const leadData = Object.values(leadMap).map(x => ({
      platform: x.platform,
      avgBooking: x.bookingDays.length ? Math.round(x.bookingDays.reduce((s, v) => s + v, 0) / x.bookingDays.length) : '—',
      avgDelivery: x.deliveryDays.length ? Math.round(x.deliveryDays.reduce((s, v) => s + v, 0) / x.deliveryDays.length) : '—',
      avgTotal: x.totalDays.length ? Math.round(x.totalDays.reduce((s, v) => s + v, 0) / x.totalDays.length) : '—',
      samples: x.totalDays.length,
    })).sort((a, b) => (b.avgTotal === '—' ? 0 : b.avgTotal) - (a.avgTotal === '—' ? 0 : a.avgTotal))
    const overallBooking = allBooking.length ? Math.round(allBooking.reduce((s, v) => s + v, 0) / allBooking.length) : null
    const overallDelivery = allDelivery.length ? Math.round(allDelivery.reduce((s, v) => s + v, 0) / allDelivery.length) : null

    const fillMap = {}
    for (const r of poData) {
      const p = r['Product']
      if (!p) continue
      if (!fillMap[p]) fillMap[p] = { product: p, poQty: 0, delQty: 0, tonnage: 0 }
      fillMap[p].poQty += num(r['PO Qty'])
      fillMap[p].delQty += num(r['Delivered QTY'])
      fillMap[p].tonnage += toNumKG(r['Dispatch Tonnage'])
    }
    const fillData = Object.values(fillMap).map(x => ({
      product: x.product,
      avgFinal: x.poQty ? Math.round(x.delQty / x.poQty * 100) : 0,
      gap: x.poQty ? 100 - Math.round(x.delQty / x.poQty * 100) : 0,
      samples: x.poQty,
      tonnage: x.tonnage,
    })).sort((a, b) => a.avgFinal - b.avgFinal)

    const rtoReasons = {}
    for (const r of poData) {
      if (r['Status'] !== 'RTO') continue
      const reason = r['RTO Reason']
      if (!reason) continue
      if (!rtoReasons[reason]) rtoReasons[reason] = { reason, count: 0, tonnage: 0, value: 0 }
      rtoReasons[reason].count++
      rtoReasons[reason].tonnage += toNumKG(r['RTO Tonnage (MT)'])
      rtoReasons[reason].value += toNumKG(r['RTO Value at Risk'])
    }
    const rtoData = Object.values(rtoReasons).sort((a, b) => b.count - a.count)

    const cityAvail = {}
    for (const r of poData) {
      const c = r['City']
      if (!c) continue
      if (!cityAvail[c]) cityAvail[c] = { city: c, totalPOQty: 0, totalDelQty: 0, poCount: 0 }
      cityAvail[c].totalPOQty += num(r['PO Qty'])
      cityAvail[c].totalDelQty += num(r['Delivered QTY'])
      cityAvail[c].poCount++
    }
    const cityFillData = Object.values(cityAvail).map(x => ({
      city: x.city,
      avgFinal: x.totalPOQty ? Math.round(x.totalDelQty / x.totalPOQty * 100) : null,
      samples: x.poCount,
    })).sort((a, b) => a.city.localeCompare(b.city))

    const totalPOQty = poData.reduce((s, r) => s + num(r['PO Qty']), 0)
    const totalDelQty = poData.reduce((s, r) => s + num(r['Delivered QTY']), 0)
    const overallFillRate = totalPOQty ? Math.round(totalDelQty / totalPOQty * 100) : null
    const totalCharge = transportData.reduce((s, x) => s + x.charge, 0)
    const totalTonnage = transportData.reduce((s, x) => s + x.tonnage, 0)
    const overallCostPerKG = totalTonnage ? totalCharge / totalTonnage : null

    return { pocMap, transportData, leadData, fillData, rtoData, cityFillData, overallBooking, overallDelivery, overallFillRate, overallCostPerKG }
  }, [data, platformFilter])

  const agings = ['New PO', 'Less than 7 days PO', 'Grater than 7 days', 'Grater than 15 days', 'More than 30 days', 'N/A']

  const perfCSVRows = () => {
    const header = 'Section,Metric,Value'
    const rows = []
    const add = (s, m, v) => rows.push(`${s},${m},${v}`)
    add('Overview', 'Avg Booking Lead Time', analysis.overallBooking !== null ? analysis.overallBooking + ' days' : '—')
    add('Overview', 'Avg Delivery Lead Time', analysis.overallDelivery !== null ? analysis.overallDelivery + ' days' : '—')
    add('Overview', 'Avg Final Fill Rate', analysis.overallFillRate !== null ? analysis.overallFillRate + '%' : '—')
    add('Overview', 'Avg Transport Cost/KG', analysis.overallCostPerKG !== null ? '₹' + analysis.overallCostPerKG.toFixed(2) : '—')
    Object.values(analysis.pocMap).sort((a, b) => b.count - a.count).forEach(p => add('PO Booking', p.platform, p.count + ' POs'))
    analysis.transportData.forEach(t => add('Transport', t.transporter, `₹${t.costPerKG.toFixed(2)}/KG, ${t.count} POs, ${t.costPct.toFixed(1)}% of value`))
    analysis.leadData.forEach(l => add('Lead Time', l.platform, `${l.avgTotal} days total (booking ${l.avgBooking}d, delivery ${l.avgDelivery}d)`))
    analysis.fillData.filter(x => x.samples > 1).slice(0, 20).forEach(f => add('Fill Rate', f.product, `Final ${f.avgFinal}%, gap ${f.gap}%`))
    analysis.cityFillData.forEach(c => add('City Fill', c.city, `Fill ${c.avgFinal}%, Samples ${c.samples}`))
    analysis.rtoData.forEach(r => add('RTO', r.reason, `${r.count} occurrences, ₹${Math.round(r.value).toLocaleString()} at risk`))
    return [header, ...rows]
  }

  const avgCostPerKG = analysis.transportData.length ? (analysis.transportData.reduce((s, x) => s + x.costPerKG, 0) / analysis.transportData.length).toFixed(2) : 'X'

  return (
    <>
      <header>
        <div>
          <h1>Supply Chain Performance</h1>
          <div className="date">Data-driven analysis & recommendations • Platform: All</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CSVButton makeRows={perfCSVRows} filename="performance_report.csv" />
          <ProfileSection />
        </div>
      </header>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">Avg Booking Lead Time</div>
            <div className="stat-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>📅</div>
          </div>
          <div className="stat-value">{analysis.overallBooking !== null ? analysis.overallBooking + ' days' : '—'}</div>
          <div className="stat-change" style={{ color: '#94a3b8' }}>PO Released → Appointment</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">Avg Delivery Lead Time</div>
            <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>🚚</div>
          </div>
          <div className="stat-value">{analysis.overallDelivery !== null ? analysis.overallDelivery + ' days' : '—'}</div>
          <div className="stat-change" style={{ color: '#94a3b8' }}>Appointment → Delivered</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">Avg Final Fill Rate</div>
            <div className="stat-icon" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>🎯</div>
          </div>
          <div className="stat-value">{analysis.overallFillRate !== null ? analysis.overallFillRate + '%' : '—'}</div>
          <div className="stat-change" style={{ color: '#eab308' }}>Overall final fill rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">Avg Transport Cost/KG</div>
            <div className="stat-icon" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>💰</div>
          </div>
          <div className="stat-value">{analysis.overallCostPerKG !== null ? '₹' + analysis.overallCostPerKG.toFixed(2) : '—'}</div>
          <div className="stat-change" style={{ color: '#94a3b8' }}>Across {analysis.transportData.length} carriers</div>
        </div>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">1. PO Booking Analysis — Aging & Freshness</div>
          <div className="chart-period">Root cause: delayed bookings reduce delivery reliability</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>Total POs</th>
              {agings.map(a => <th key={a}>{a}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.values(analysis.pocMap).sort((a, b) => b.count - a.count).map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.platform}</td>
                <td>{row.count}</td>
                {agings.map(a => <td key={a}>{row.aging[a] || 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(59,130,246,0.08)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#3b82f6', marginBottom: 8 }}>💡 Suggestions for PO Booking</div>
          <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
            <li><strong style={{ color: '#f1f5f9' }}>Reduce aging:</strong> Target 80%+ POs in Less than 7 days bucket. Currently high aging POs increase RTO risk.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Consolidate PO releases:</strong> Batch POs on fixed weekdays to streamline transporter scheduling and reduce booking lead time.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Align with platform cycles:</strong> Sync PO release with platform-specific demand cycles to avoid last-minute rushes.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Automate reorder triggers:</strong> Set min-stock alerts per product to automate PO generation before stockout.</li>
          </ul>
        </div>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">2. Transporter Cost Analysis — Charge Efficiency</div>
          <div className="chart-period">Root cause: uneven carrier costs impact margins</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Transporter</th>
              <th>POs Handled</th>
              <th>Total Charge</th>
              <th>Tonnage (KG)</th>
              <th>Cost/KG</th>
              <th>Cost as % of Value</th>
              <th>Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {analysis.transportData.length === 0 ? (
              <tr><td colSpan={7}><EmptyState /></td></tr>
            ) : analysis.transportData.map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.transporter}</td>
                <td>{row.count}</td>
                <td>₹{Math.round(row.charge).toLocaleString()}</td>
                <td>{Math.round(row.tonnage)}</td>
                <td style={{ fontWeight: 700, color: row.costPerKG > (analysis.transportData.reduce((s, x) => s + x.costPerKG, 0) / analysis.transportData.length) ? '#ef4444' : '#22c55e' }}>₹{row.costPerKG.toFixed(2)}</td>
                <td>{row.costPct.toFixed(1)}%</td>
                <td>
                  <span style={{ color: row.costPct <= 5 ? '#22c55e' : row.costPct <= 10 ? '#eab308' : '#ef4444', fontWeight: 600 }}>
                    {row.costPct <= 5 ? 'Good' : row.costPct <= 10 ? 'Average' : 'High'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(34,197,94,0.08)', borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>💡 Suggestion for Transport Cost</div>
          <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
            <li><strong style={{ color: '#f1f5f9' }}>Negotiate with high-cost carriers:</strong> Carriers above avg ₹{avgCostPerKG}/KG need rate renegotiation or volume-based discounts.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Consolidate tonnage:</strong> Combine smaller loads into full truckloads to reduce per-KG cost for Own Vehicle / long-haul routes.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Compare cost vs value:</strong> Transport cost &gt; 10% of PO value is a red flag — review pricing for high-value low-weight products.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Optimize route allocation:</strong> Assign high-volume city routes to lowest-cost reliable carriers.</li>
          </ul>
        </div>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">3. Lead Time Analysis — Booking-to-Delivery</div>
          <div className="chart-period">Root cause: long cycle times reduce fill rates</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>Avg Booking (days)</th>
              <th>Avg Delivery (days)</th>
              <th>Avg Total (days)</th>
              <th>Samples</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {analysis.leadData.length === 0 ? (
              <tr><td colSpan={6}><EmptyState /></td></tr>
            ) : analysis.leadData.map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.platform}</td>
                <td>{row.avgBooking === '—' ? '—' : <span style={{ color: row.avgBooking > 10 ? '#ef4444' : row.avgBooking > 5 ? '#eab308' : '#22c55e', fontWeight: 600 }}>{row.avgBooking}d</span>}</td>
                <td>{row.avgDelivery === '—' ? '—' : <span style={{ color: row.avgDelivery > 5 ? '#ef4444' : row.avgDelivery > 3 ? '#eab308' : '#22c55e', fontWeight: 600 }}>{row.avgDelivery}d</span>}</td>
                <td style={{ fontWeight: 700 }}>{row.avgTotal === '—' ? '—' : `${row.avgTotal}d`}</td>
                <td>{row.samples}</td>
                <td><span style={{ color: row.avgTotal === '—' ? '#64748b' : row.avgTotal <= 10 ? '#22c55e' : row.avgTotal <= 20 ? '#eab308' : '#ef4444', fontWeight: 600 }}>{row.avgTotal === '—' ? 'N/A' : row.avgTotal <= 10 ? 'Fast' : row.avgTotal <= 20 ? 'Moderate' : 'Slow'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(99,102,241,0.08)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#6366f1', marginBottom: 8 }}>💡 Suggestions for Lead Time Reduction</div>
          <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
            <li><strong style={{ color: '#f1f5f9' }}>Reduce booking lead time:</strong> Target &lt;3 days from PO release to appointment by pre-booking transporter slots.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Improve appointment compliance:</strong> Enforce appointment scheduling within 48h of PO release — late appointments cascade into delayed deliveries.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Platform-specific SLAs:</strong> Platforms with &gt;15 day total lead time need dedicated escalation — consider split delivery models.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Real-time tracking:</strong> Implement GPS tracking for high-value shipments to proactively manage delays.</li>
          </ul>
        </div>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">4. Availability & Fill Rate Analysis</div>
          <div className="chart-period">Root cause: fill rate drops from dispatch to delivery</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Final Fill %</th>
              <th>Drop-off Gap</th>
              <th>Tonnage (KG)</th>
              <th>Samples</th>
            </tr>
          </thead>
          <tbody>
            {analysis.fillData.filter(x => x.samples > 1).slice(0, 20).map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 700, color: row.avgFinal >= 90 ? '#22c55e' : row.avgFinal >= 70 ? '#eab308' : '#ef4444' }}>{row.avgFinal}%</td>
                <td><span style={{ color: row.gap > 10 ? '#ef4444' : row.gap > 5 ? '#eab308' : '#22c55e', fontWeight: 600 }}>{row.gap}%</span></td>
                <td style={{ fontWeight: 600 }}>{Math.round(row.tonnage).toLocaleString()}</td>
                <td>{row.samples}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(168,85,247,0.08)', borderRadius: 10, border: '1px solid rgba(168,85,247,0.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#a855f7', marginBottom: 8 }}>💡 Suggestions for Availability Improvement</div>
          <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
            <li><strong style={{ color: '#f1f5f9' }}>Close the dispatch-to-delivery gap:</strong> Products with &gt;10% drop-off need quality checks at dispatch — damage during transit is a key driver.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Safety stock for fill-rate losers:</strong> Keep 15-20% buffer stock for products with final fill rate &lt;80% to absorb variability.</li>
            <li><strong style={{ color: '#f1f5f9' }}>City-specific inventory planning:</strong> High RTO rate cities need separate stock allocation — one-size-fits-all fails.</li>
            <li><strong style={{ color: '#f1f5f9' }}>Improve packaging:</strong> Damage-related RTO (most common reason) can be reduced with better packaging and handling SOPs.</li>
          </ul>
        </div>
      </div>

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">5. Fill Rate by City — Availability Heatmap</div>
          <div className="chart-period">Root cause: city-level fill rate variance</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>City</th>
              <th>Final Fill Rate</th>
              <th>Samples</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {analysis.cityFillData.length === 0 ? (
              <tr><td colSpan={4}><EmptyState /></td></tr>
            ) : analysis.cityFillData.map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.city}</td>
                <td style={{ fontWeight: 700, color: row.avgFinal === null ? '#64748b' : row.avgFinal >= 90 ? '#22c55e' : row.avgFinal >= 70 ? '#eab308' : '#ef4444' }}>{row.avgFinal !== null ? row.avgFinal + '%' : '—'}</td>
                <td>{row.samples}</td>
                <td><span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: row.avgFinal === null ? 'rgba(100,116,139,0.2)' : row.avgFinal < 70 ? 'rgba(239,68,68,0.2)' : row.avgFinal < 90 ? 'rgba(234,179,8,0.2)' : 'rgba(34,197,94,0.2)', color: row.avgFinal === null ? '#64748b' : row.avgFinal < 70 ? '#ef4444' : row.avgFinal < 90 ? '#eab308' : '#22c55e' }}>{row.avgFinal === null ? '⚪ No Data' : row.avgFinal < 70 ? '🔴 Critical' : row.avgFinal < 90 ? '🟡 Monitor' : '🟢 Good'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {analysis.rtoData.length > 0 && (
        <div className="recent-orders" style={{ marginBottom: 20 }}>
          <div className="orders-header">
            <div className="orders-title">6. RTO Root Cause Analysis</div>
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
                const total = analysis.rtoData.reduce((s, r) => s + r.count, 0)
                return analysis.rtoData.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row.reason}</td>
                    <td>{row.count}</td>
                    <td>{Math.round(row.tonnage)}</td>
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
          <div style={{ marginTop: 16, padding: 16, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>💡 Suggestions for Fill Rate Improvement</div>
            <ul style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.8, paddingLeft: 20 }}>
              <li><strong style={{ color: '#f1f5f9' }}>Target #1 RTO reason:</strong> {analysis.rtoData.length ? `${analysis.rtoData[0].reason} (${analysis.rtoData[0].count} occurrences)` : 'N/A'} — implement corrective action plan immediately.</li>
              <li><strong style={{ color: '#f1f5f9' }}>Quality gates at dispatch:</strong> Add inspection checkpoint for products with history of damage-related returns.</li>
              <li><strong style={{ color: '#f1f5f9' }}>Transporter scorecard:</strong> Track fill rate performance per carrier and phase out low performers (&lt;80% final fill rate).</li>
              <li><strong style={{ color: '#f1f5f9' }}>Customer communication:</strong> Pre-delivery SMS/email with delivery window reduces rejection and RTO.</li>
              <li><strong style={{ color: '#f1f5f9' }}>Monthly business review:</strong> Review top-5 fill rate losers monthly with cross-functional team (warehouse, logistics, sales).</li>
            </ul>
          </div>
        </div>
      )}

      <div className="recent-orders" style={{ marginBottom: 20 }}>
        <div className="orders-header">
          <div className="orders-title">7. Week-on-Week City Performance</div>
          <div className="chart-period">Current vs Previous week</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <DateRangePicker from={wowDateFrom} to={wowDateTo} onFrom={setWowDateFrom} onTo={setWowDateTo} />
          <select value={wowPlatformFilter} onChange={e => setWowPlatformFilter(e.target.value)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
            {wowPlatforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <WoWCityTable data={data} dateFrom={wowDateFrom} dateTo={wowDateTo} platformFilter={wowPlatformFilter} />
      </div>
    </>
  )
}

function WoWCityTable({ data, dateTo, platformFilter }) {
  const wowData = useMemo(() => {
    const to = parseDate(dateTo)
    if (!to) return []
    const currStart = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 6)
    const prevStart = new Date(currStart.getFullYear(), currStart.getMonth(), currStart.getDate() - 7)

    const inRange = data.filter(r => {
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      if (!d) return false
      if (platformFilter !== 'All' && r['Platform'] !== platformFilter) return false
      return d >= prevStart && d <= to
    })

    const map = {}
    const currValueSet = {}; const currTonnageSet = {}; const prevValueSet = {}; const prevTonnageSet = {}
    inRange.forEach(r => {
      const c = r['City']; if (!c) return
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      const po = r['PO Number']
      if (!map[c]) {
        map[c] = { city: c, currOrders: new Set(), currValue: 0, currTonnage: 0, prevOrders: new Set(), prevValue: 0, prevTonnage: 0 }
        currValueSet[c] = new Set(); currTonnageSet[c] = new Set(); prevValueSet[c] = new Set(); prevTonnageSet[c] = new Set()
      }
      if (d >= currStart) {
        map[c].currOrders.add(po)
        if (!currValueSet[c].has(po)) { currValueSet[c].add(po); map[c].currValue += num(r['PO Value with Tax']) }
        if (!currTonnageSet[c].has(po)) { currTonnageSet[c].add(po); map[c].currTonnage += num(r['Tonnage']) }
      } else {
        map[c].prevOrders.add(po)
        if (!prevValueSet[c].has(po)) { prevValueSet[c].add(po); map[c].prevValue += num(r['PO Value with Tax']) }
        if (!prevTonnageSet[c].has(po)) { prevTonnageSet[c].add(po); map[c].prevTonnage += num(r['Tonnage']) }
      }
    })
    Object.values(map).forEach(x => { x.currOrders = x.currOrders.size; x.prevOrders = x.prevOrders.size })
    return Object.values(map).sort((a, b) => b.currOrders - a.currOrders)
  }, [data, dateTo, platformFilter])

  if (!wowData.length) return <EmptyState message="No data for week-over-week comparison." />

  const maxOrders = Math.max(...wowData.map(r => Math.max(r.currOrders, r.prevOrders)), 1)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>City</th>
            <th colSpan={2}>Orders</th>
            <th>Orders Change</th>
            <th colSpan={2}>Value</th>
            <th>Value Change</th>
            <th colSpan={2}>Tonnage</th>
            <th>Tonnage Change</th>
          </tr>
        </thead>
        <tbody>
          {wowData.map((row, i) => {
            const ordChange = row.prevOrders ? ((row.currOrders - row.prevOrders) / row.prevOrders * 100).toFixed(1) : null
            const valChange = row.prevValue ? ((row.currValue - row.prevValue) / row.prevValue * 100).toFixed(1) : null
            const tonChange = row.prevTonnage ? ((row.currTonnage - row.prevTonnage) / row.prevTonnage * 100).toFixed(1) : null

            const ChangeBadge = ({ change }) => {
              if (change === null) return <span style={{ color: '#64748b' }}>—</span>
              const isUp = change >= 0
              return (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: isUp ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: isUp ? '#22c55e' : '#ef4444',
                  padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                }}>
                  <span>{isUp ? '▲' : '▼'}</span>
                  <span>{Math.abs(change)}%</span>
                </span>
              )
            }

            const MiniBar = ({ curr, prev, max }) => {
              const cw = max ? (curr / max * 100) : 0
              const pw = max ? (prev / max * 100) : 0
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#3b82f6', fontWeight: 600 }}>{curr}</span>
                    <span style={{ color: '#64748b' }}>{prev}</span>
                  </div>
                  <div style={{ height: 6, background: '#1e293b', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ width: `${pw}%`, height: '100%', background: '#475569', borderRadius: 3, position: 'absolute', left: 0 }} />
                    <div style={{ width: `${cw}%`, height: '100%', background: '#3b82f6', borderRadius: 3, position: 'absolute', left: 0, opacity: 0.8 }} />
                  </div>
                </div>
              )
            }

            return (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.city}</td>
                <td><MiniBar curr={row.currOrders} prev={row.prevOrders} max={maxOrders} /></td>
                <td style={{ fontSize: 11, color: '#64748b' }}>Curr / Prev</td>
                <td><ChangeBadge change={ordChange} /></td>
                <td style={{ fontWeight: 600, fontSize: 13 }}>₹{Math.round(row.currValue / 1e3).toLocaleString()}K</td>
                <td style={{ color: '#64748b', fontSize: 12 }}>₹{Math.round(row.prevValue / 1e3).toLocaleString()}K</td>
                <td><ChangeBadge change={valChange} /></td>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{Math.round(row.currTonnage)} KG</td>
                <td style={{ color: '#64748b', fontSize: 12 }}>{Math.round(row.prevTonnage)} KG</td>
                <td><ChangeBadge change={tonChange} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
