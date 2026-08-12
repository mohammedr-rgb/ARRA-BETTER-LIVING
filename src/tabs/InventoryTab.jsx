import { useMemo, Fragment } from 'react'
import { num, parseMMDDDate, csvEscape, MONTH_NAMES, productSummary } from '../lib/utils'
import { CSVButton, ProfileSection } from '../components/ui'
import { buildProductionPlan, planCSVRows, groupRowsByBoxType, totalsFor } from '../lib/productionPlan'

const BOX_CHIP_COLORS = { 'White Box': '#22c55e', 'Standard Box': '#3b82f6' }

export default function InventoryTab({ data }) {
  const productData = useMemo(() => productSummary(data), [data])

  const productionPlan = useMemo(() => buildProductionPlan(data), [data])
  const planSections = useMemo(() => groupRowsByBoxType(productionPlan.rows), [productionPlan])
  const boxTypeSummary = useMemo(() => Object.entries(productionPlan.boxTypeTotals).map(([name, v]) => ({
    name: name === '(Unlabelled)' ? 'Unlabelled' : name,
    boxes: v.planBoxes,
    qty: v.planQty,
  })), [productionPlan])

  const planStats = [
    { label: 'Plan Qty', icon: '🧴', color: '#3b82f6', value: productionPlan.totals.planQty.toLocaleString() },
    { label: 'Plan Boxes', icon: '📦', color: '#a855f7', value: productionPlan.totals.planBoxes.toLocaleString() },
    { label: 'Plan Tonnage', icon: '⚖️', color: '#eab308', value: productionPlan.totals.planTonnage.toLocaleString() + ' KG' },
    { label: 'Avg Monthly Sales Qty', icon: '📈', color: '#22c55e', value: Math.round(productionPlan.totals.salesQty / 3).toLocaleString() },
  ]

  const platformMonthData = useMemo(() => {
    const map = {}
    const monthSet = new Set()
    data.forEach(r => {
      const p = r['Platform'] || 'Unknown'
      const d = parseMMDDDate(r['Invoice Date (MM-DD-YYYY)'])
      if (!d) return
      const mk = `${d.getFullYear()}-${d.getMonth()}`
      monthSet.add(mk)
      if (!map[p]) map[p] = {}
      if (!map[p][mk]) map[p][mk] = { tonnage: 0, poValues: {} }
      map[p][mk].tonnage += num(r['Tonnage'])
      const po = r['PO Number']
      const iv = num(r['Invoice Value'])
      if (po && iv > 0) map[p][mk].poValues[po] = iv
    })
    const months = [...monthSet].sort().map(mk => {
      const [y, m] = mk.split('-').map(Number)
      return { key: mk, label: `${MONTH_NAMES[m]} ${String(y).slice(2)}` }
    }).filter(x => !x.label.startsWith('May'))
    const platforms = Object.keys(map).sort()
    const rows = platforms.map(p => {
      let totalTonnage = 0, totalValue = 0
      const cells = months.map(m => {
        const c = map[p][m.key]
        const value = c ? Object.values(c.poValues).reduce((s, v) => s + v, 0) : 0
        totalTonnage += c ? c.tonnage : 0
        totalValue += value
        return c ? { tonnage: Math.round(c.tonnage), value: Math.round(value) } : null
      })
      return { platform: p, cells, totalTonnage, totalValue }
    })
    const grand = rows.reduce((s, r) => ({
      totalTonnage: s.totalTonnage + r.totalTonnage,
      totalValue: s.totalValue + r.totalValue,
    }), { totalTonnage: 0, totalValue: 0 })
    const monthTotals = months.map((m, i) => rows.reduce((s, r) => {
      const c = r.cells[i]
      return { tonnage: s.tonnage + (c ? c.tonnage : 0), value: s.value + (c ? c.value : 0) }
    }, { tonnage: 0, value: 0 }))
    return { months, rows, grand, monthTotals }
  }, [data])

  const platformMonthCSVRows = () => {
    const rows = ['Platform & Month-wise Sales']
    rows.push('')
    rows.push('Platform,' + platformMonthData.months.map(m => `${m.label} Tonnage`).join(',') + ',' + platformMonthData.months.map(m => `${m.label} Value`).join(',') + ',Total Tonnage,Total Value')
    platformMonthData.rows.forEach(r => {
      rows.push(csvEscape(r.platform) + ',' + r.cells.map(c => c ? c.tonnage : '').join(',') + ',' + r.cells.map(c => c ? c.value : '').join(',') + ',' + r.totalTonnage + ',' + r.totalValue)
    })
    rows.push('TOTAL,' + platformMonthData.monthTotals.map(m => m.tonnage).join(',') + ',' + platformMonthData.monthTotals.map(m => m.value).join(',') + ',' + platformMonthData.grand.totalTonnage + ',' + platformMonthData.grand.totalValue)
    return rows
  }

  return (
    <>
      <header>
        <div>
          <h1>Inventory</h1>
          <div className="date">{productData.length} unique products • Platform: All</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ProfileSection />
        </div>
      </header>

      <div className="recent-orders" style={{ marginTop: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Total Qty</th>
              <th>Tonnage (KG)</th>
              <th>Boxes</th>
              <th>Total Value</th>
            </tr>
          </thead>
          <tbody>
            {productData.map((row, i) => (
              <tr key={i}>
                <td>{row.product}</td>
                <td>{row.qty}</td>
                <td>{Math.round(row.tonnage)}</td>
                <td>{row.boxes}</td>
                <td>₹{Math.round(row.value).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {platformMonthData.rows.length > 0 && (
        <div className="recent-orders" style={{ marginTop: 20 }}>
          <div className="orders-header">
            <div className="orders-title">Platform &amp; Month-wise Sales</div>
            <div className="chart-period">By Invoice Date • Tonnage (KG) • Invoice Value</div>
            <CSVButton makeRows={platformMonthCSVRows} filename="platform_month_sales.csv" />
          </div>
          <table>
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Platform</th>
                {platformMonthData.months.map(m => (
                  <th key={m.key} colSpan={2} style={{ textAlign: 'center' }}>{m.label}</th>
                ))}
                <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Total Tonnage</th>
                <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Total Value</th>
              </tr>
              <tr>
                {platformMonthData.months.flatMap(m => [
                  <th key={'c' + m.key}>Tonnage</th>,
                  <th key={'v' + m.key}>Value</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {platformMonthData.rows.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{row.platform}</td>
                  {row.cells.flatMap((c, j) => [
                    <td key={'t' + j}>{c ? c.tonnage : '—'}</td>,
                    <td key={'v' + j}>{c ? '₹' + c.value.toLocaleString() : '—'}</td>,
                  ])}
                  <td style={{ fontWeight: 600 }}>{row.totalTonnage}</td>
                  <td style={{ fontWeight: 600 }}>₹{row.totalValue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'rgba(59,130,246,0.12)' }}>
                <td style={{ fontWeight: 700 }}>Grand Total</td>
                {platformMonthData.monthTotals.flatMap((m, j) => [
                  <td key={'t' + j} style={{ fontWeight: 700 }}>{m.tonnage}</td>,
                  <td key={'v' + j} style={{ fontWeight: 700 }}>₹{m.value.toLocaleString()}</td>,
                ])}
                <td style={{ fontWeight: 700 }}>{platformMonthData.grand.totalTonnage}</td>
                <td style={{ fontWeight: 700 }}>₹{platformMonthData.grand.totalValue.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="recent-orders" style={{ marginTop: 20 }}>
        <div className="orders-header">
          <div className="orders-title">Production Plan — {productionPlan.planMonth}</div>
          <div className="chart-period" style={{ marginLeft: 12, flexWrap: 'wrap' }}>
            Automated from {productionPlan.period} sales (3-month avg × 0.95) • recalculates on every data refresh
          </div>
          <CSVButton makeRows={() => planCSVRows(productionPlan)} filename={'production_plan_' + productionPlan.planMonth.toLowerCase() + '.csv'}>⬇ Download Plan</CSVButton>
        </div>

        {productionPlan.rows.length > 0 ? (
          <>
            <div className="stats-grid" style={{ marginTop: 0 }}>
              {planStats.map(s => (
                <div className="stat-card" key={s.label} style={{ position: 'relative' }}>
                  <div className="stat-header">
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-icon" style={{ background: `${s.color}26`, color: s.color }}>{s.icon}</div>
                  </div>
                  <div className="stat-value">{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {boxTypeSummary.map(c => {
                const color = BOX_CHIP_COLORS[c.name] || '#a78bfa'
                return (
                  <span key={c.name} style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: `${color}1a`, color, border: `1px solid ${color}40` }}>
                    {c.name}: {c.boxes} boxes • {c.qty} qty
                  </span>
                )
              })}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: 900, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1e293b' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #334155', color: '#94a3b8', fontWeight: 600 }}>Box Type</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #334155', color: '#94a3b8', fontWeight: 600 }}>Product</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #334155', color: '#94a3b8', fontWeight: 600 }}>Platform</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #334155', color: '#94a3b8', fontWeight: 600 }}>City</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '2px solid #334155', color: '#94a3b8', fontWeight: 600 }}>MRP</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '2px solid #334155', color: '#94a3b8', fontWeight: 600 }}>Sales Qty ({productionPlan.period})</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '2px solid #334155', color: '#94a3b8', fontWeight: 600 }}>Plan Qty ({productionPlan.planMonth})</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '2px solid #334155', color: '#94a3b8', fontWeight: 600 }}>Plan Boxes</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '2px solid #334155', color: '#94a3b8', fontWeight: 600 }}>Plan Tonnage (KG)</th>
                  </tr>
                </thead>
                <tbody>
                  {planSections.map(section => {
                    const sub = totalsFor(section.rows)
                    return (
                      <Fragment key={section.boxType}>
                        {section.rows.map((r, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(30,41,59,0.5)' }}>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#f1f5f9' }}>{r.boxType || '(Unlabelled)'}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#f1f5f9', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>{r.platform}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>{r.city}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#f1f5f9', textAlign: 'right' }}>₹{r.mrp}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#f1f5f9', textAlign: 'right' }}>{r.salesQty}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#3b82f6', textAlign: 'right', fontWeight: 600 }}>{r.planQty}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#f1f5f9', textAlign: 'right' }}>{r.planBoxes}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#f1f5f9', textAlign: 'right' }}>{r.planTonnage}</td>
                          </tr>
                        ))}
                        <tr style={{ background: 'rgba(139,92,246,0.08)', fontWeight: 700 }}>
                          <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#a78bfa' }}>SUBTOTAL {section.boxType}</td>
                          <td colSpan={3} style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#94a3b8' }}></td>
                          <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#94a3b8' }}></td>
                          <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#f1f5f9', textAlign: 'right' }}>{sub.salesQty}</td>
                          <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#3b82f6', textAlign: 'right' }}>{sub.planQty}</td>
                          <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#f1f5f9', textAlign: 'right' }}>{sub.planBoxes}</td>
                          <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#f1f5f9', textAlign: 'right' }}>{sub.planTonnage}</td>
                        </tr>
                      </Fragment>
                    )
                  })}
                  <tr style={{ background: 'rgba(59,130,246,0.08)', fontWeight: 700 }}>
                    <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#f1f5f9' }}>TOTAL</td>
                    <td colSpan={4} style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#94a3b8' }}></td>
                    <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#f1f5f9', textAlign: 'right' }}>{productionPlan.totals.salesQty}</td>
                    <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#3b82f6', textAlign: 'right' }}>{productionPlan.totals.planQty}</td>
                    <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#f1f5f9', textAlign: 'right' }}>{productionPlan.totals.planBoxes}</td>
                    <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#f1f5f9', textAlign: 'right' }}>{productionPlan.totals.planTonnage}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No production plan data available</div>
        )}
      </div>

    </>
  )
}
