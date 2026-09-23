import { useMemo } from 'react'
import { num, parseMMDDDate, csvEscape, MONTH_NAMES, productSummary } from '../lib/utils'
import { CSVButton, ProfileSection } from '../components/ui'
import { buildProductionPlan, planCSVRows } from '../lib/productionPlan'

export default function InventoryTab({ data }) {

  const productData = useMemo(() => productSummary(data), [data])

  const platformMonthData = useMemo(() => {
    const map = {}
    const monthSet = new Set()
    data.forEach(r => {
      const p = r['Platform'] || 'Unknown'
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
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
    })
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

  const planData = useMemo(() => buildProductionPlan(data), [data])

  const reportCSVRows = () => {
    const rows = ['Production Plan Report']
    rows.push(`Period,${planData.period} Sales → ${planData.planMonths.map(m => m.label).join('/')} Plan`)
    rows.push('')
    rows.push(`City,Platform,Box Type,Product,MRP,Sales Qty (3M),Plan Qty/Month,Plan Tonnage KG,Plan Boxes,${planData.planMonths.map(m => `${m.label} Plan Qty`).join(',')},${planData.planMonths.map(m => `${m.label} Plan Boxes`).join(',')},Total Plan Qty`)
    planData.rows.forEach(r => {
      rows.push([
        r.city, r.platform, r.boxType, r.product, r.mrp, r.salesQty, r.planQty, r.planTonnage, r.planBoxes,
        ...planData.planMonths.map(() => r.planQty),
        ...planData.planMonths.map(() => r.planBoxes),
        r.planQty * 3,
      ].map(x => csvEscape(String(x))).join(','))
    })
    rows.push('')
    rows.push(`TOTAL,,, ,,${planData.totals.salesQty},${planData.totals.planQty},${planData.totals.planTonnage},${planData.totals.planBoxes},${planData.planMonths.map(() => planData.totals.planQty).join(',')},${planData.planMonths.map(() => planData.totals.planBoxes).join(',')},${planData.totals.planQty * 3}`)
    return rows
  }

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
          <CSVButton makeRows={reportCSVRows} filename="production_plan_report.csv" />
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
            <div className="chart-period">Tonnage (KG) • Invoice Value</div>
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

      {planData.rows.length > 0 && (
        <div className="recent-orders" style={{ marginTop: 20 }}>
          <div className="orders-header">
            <div className="orders-title">Production Plan — {planData.planMonths[0].label}</div>
            <div className="chart-period">Based on {planData.period} sales • 90% production target</div>
            <CSVButton makeRows={() => planCSVRows(planData)} filename="production_plan.csv">⬇ Download Plan</CSVButton>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ verticalAlign: 'middle' }}>City</th>
                  <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Platform</th>
                  <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Box Type</th>
                  <th rowSpan={2} style={{ verticalAlign: 'middle', minWidth: 220 }}>Product</th>
                  <th rowSpan={2} style={{ verticalAlign: 'middle' }}>MRP</th>
                  {planData.planMonths.map(m => (
                    <th key={m.label} colSpan={2} style={{ textAlign: 'center' }}>{m.label}</th>
                  ))}
                  <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Total Plan Qty</th>
                  <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Total Plan Boxes</th>
                </tr>
                <tr>
                  {planData.planMonths.flatMap(m => [
                    <th key={'q' + m.label}>Plan Qty</th>,
                    <th key={'b' + m.label}>Boxes</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {planData.rows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.city}</td>
                    <td>{row.platform}</td>
                    <td>{row.boxType || '—'}</td>
                    <td style={{ fontWeight: 600, maxWidth: 220 }}>{row.product}</td>
                    <td style={{ color: '#94a3b8' }}>₹{row.mrp}</td>
                    {planData.planMonths.flatMap(m => [
                      <td key={'q' + m.label} style={{ fontWeight: 600, color: '#3b82f6', textAlign: 'center' }}>{row.planQty}</td>,
                      <td key={'b' + m.label} style={{ textAlign: 'center' }}>{row.planBoxes}</td>,
                    ])}
                    <td style={{ fontWeight: 700, textAlign: 'center' }}>{row.planQty * 3}</td>
                    <td style={{ fontWeight: 700, textAlign: 'center' }}>{row.planBoxes * 3}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(59,130,246,0.12)' }}>
                  <td colSpan={5} style={{ fontWeight: 700 }}>Total</td>
                  {planData.planMonths.flatMap(m => [
                    <td key={'q' + m.label} style={{ fontWeight: 700, textAlign: 'center', color: '#3b82f6' }}>{planData.totals.planQty}</td>,
                    <td key={'b' + m.label} style={{ fontWeight: 700, textAlign: 'center' }}>{planData.totals.planBoxes}</td>,
                  ])}
                  <td style={{ fontWeight: 700, textAlign: 'center' }}>{planData.totals.planQty * 3}</td>
                  <td style={{ fontWeight: 700, textAlign: 'center' }}>{planData.totals.planBoxes * 3}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
