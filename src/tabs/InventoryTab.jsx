import { useState, useMemo } from 'react'
import { num, parseMMDDDate, csvEscape, MONTH_NAMES, productSummary } from '../lib/utils'
import { CSVButton, ProfileSection } from '../components/ui'

export default function InventoryTab({ data }) {
  const [hoverSku, setHoverSku] = useState(null)
  const [planPlatform] = useState('All')
  const [planCity] = useState('All')

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

  const planData = useMemo(() => {
    const now = new Date()
    const thisYear = now.getFullYear()
    const prev3 = new Date(thisYear, now.getMonth() - 3, 1)
    const prev2 = new Date(thisYear, now.getMonth() - 2, 1)
    const prev1 = new Date(thisYear, now.getMonth() - 1, 1)

    const last3MonthOrders = data.filter(r => {
      const d = parseMMDDDate(r['DATE(MM-DD-YYYY)'])
      if (!d) return false
      return (d.getMonth() === prev1.getMonth() && d.getFullYear() === prev1.getFullYear()) || (d.getMonth() === prev2.getMonth() && d.getFullYear() === prev2.getFullYear()) || (d.getMonth() === prev3.getMonth() && d.getFullYear() === prev3.getFullYear())
    })

    const poQty = {}
    const poValue = {}
    last3MonthOrders.forEach(r => {
      const po = r['PO Number']; if (!po) return
      poQty[po] = (poQty[po] || 0) + num(r['PO Qty'])
      const v = num(r['PO Value with Tax'])
      if (v > 0 && v > (poValue[po] || 0)) poValue[po] = v
    })

    const skuMap = {}
    last3MonthOrders.forEach(r => {
      const p = r['Product']
      if (!p) return
      if (!skuMap[p]) skuMap[p] = { product: p, salesQty: 0, salesTonnage: 0, salesBoxes: 0, transportCharge: 0, totalValue: 0, combo: {} }
      const sku = skuMap[p]
      sku.salesQty += num(r['PO Qty'])
      sku.salesTonnage += num(r['Tonnage'])
      sku.salesBoxes += num(r['Box Count'])
      sku.transportCharge += num(r['Transport Charge'])
      const po = r['PO Number']
      const share = po && poQty[po] ? num(r['PO Qty']) / poQty[po] : 0
      sku.totalValue += (poValue[po] || 0) * share
      const c = r['City'] || 'Unknown'
      const pl = r['Platform'] || 'Unknown'
      if (!sku.combo[c]) sku.combo[c] = {}
      if (!sku.combo[c][pl]) sku.combo[c][pl] = { qty: 0, boxes: 0 }
      sku.combo[c][pl].qty += num(r['PO Qty'])
      sku.combo[c][pl].boxes += num(r['Box Count'])
    })

    const nextMonth = (prev1.getMonth() + 1) % 12
    const nextMonthName = MONTH_NAMES[nextMonth]
    const periodLabel = `${MONTH_NAMES[prev3.getMonth()]}–${MONTH_NAMES[prev1.getMonth()]}`

    const platformOptions = [...new Set(Object.values(skuMap).flatMap(s => Object.keys(s.combo).flatMap(c => Object.keys(s.combo[c]))))]
    const cityOptions = [...new Set(Object.values(skuMap).flatMap(s => Object.keys(s.combo)))]

    const baseItems = Object.values(skuMap).map(r => {
      const perUnitTonnage = r.salesQty ? r.salesTonnage / r.salesQty : 0
      const perUnitBoxes = r.salesQty ? r.salesBoxes / r.salesQty : 0
      const perUnitCharge = r.salesQty ? r.transportCharge / r.salesQty : 0
      return {
        product: r.product,
        salesQty: r.salesQty,
        salesTonnage: Math.round(r.salesTonnage),
        salesBoxes: r.salesBoxes,
        transportCharge: Math.round(r.transportCharge),
        totalValue: Math.round(r.totalValue),
        perUnitTonnage,
        perUnitBoxes,
        perUnitCharge,
        combo: r.combo,
      }
    })

    return { month: periodLabel, nextMonth: nextMonthName, baseItems, platformOptions, cityOptions }
  }, [data])

  const planItems = useMemo(() => {
    const filterQty = (sku) => {
      let qty = 0
      for (const c in sku.combo) {
        for (const pl in sku.combo[c]) {
          if (planPlatform !== 'All' && pl !== planPlatform) continue
          if (planCity !== 'All' && c !== planCity) continue
          qty += sku.combo[c][pl].qty
        }
      }
      return qty
    }
    const platformQty = (sku) => {
      const map = {}
      for (const c in sku.combo) {
        for (const pl in sku.combo[c]) {
          if (planCity !== 'All' && c !== planCity) continue
          map[pl] = (map[pl] || 0) + sku.combo[c][pl].qty
        }
      }
      return Object.entries(map).sort((a, b) => b[1] - a[1])
    }
    const cityQty = (sku) => {
      const map = {}
      for (const c in sku.combo) {
        if (planPlatform !== 'All') continue
        for (const pl in sku.combo[c]) {
          map[c] = (map[c] || 0) + sku.combo[c][pl].qty
        }
      }
      if (planPlatform !== 'All') {
        for (const c in sku.combo) {
          if (sku.combo[c][planPlatform]) map[c] = (map[c] || 0) + sku.combo[c][planPlatform].qty
        }
      }
      return Object.entries(map).sort((a, b) => b[1] - a[1])
    }
    return planData.baseItems.map(r => {
      const qty = filterQty(r)
      const planQty = Math.round(qty * 0.95)
      const platforms = platformQty(r)
      const cities = cityQty(r)
      return {
        product: r.product,
        salesQty: qty,
        salesTonnage: Math.round(r.salesTonnage),
        salesBoxes: r.salesBoxes,
        totalValue: Math.round(r.totalValue),
        planQty,
        planTonnage: Math.round(planQty * r.perUnitTonnage),
        planBoxes: Math.round(planQty * r.perUnitBoxes),
        planTransport: Math.round(planQty * r.perUnitCharge),
        perUnitCharge: r.perUnitCharge.toFixed(2),
        platforms,
        cities,
      }
    }).filter(x => x.salesQty > 0).sort((a, b) => b.planQty - a.planQty)
  }, [planData, planPlatform, planCity])

  const reportCSVRows = () => {
    const rows = ['Production Plan Report']
    rows.push('Period,' + planData.month + ' Sales → ' + planData.nextMonth + ' Plan')
    rows.push('')
    if (planData.baseItems && planData.baseItems.length) {
      rows.push('SKU,Sales Qty,Plan Qty,Plan Tonnage KG,Plan Boxes,Cost/Unit,Total Value,Platforms,Cities')
      let gQty = 0, gTon = 0, gBox = 0, gVal = 0
      planData.baseItems.forEach(r => {
        const planQty = Math.round(r.salesQty * 0.95)
        rows.push(`${csvEscape(r.product)},${r.salesQty},${planQty},${Math.round(planQty * r.perUnitTonnage)},${Math.round(planQty * r.perUnitBoxes)},${r.perUnitCharge.toFixed(2)},${r.totalValue}`)
        gQty += planQty; gTon += Math.round(planQty * r.perUnitTonnage); gBox += Math.round(planQty * r.perUnitBoxes); gVal += r.totalValue
      })
      rows.push('')
      rows.push(`GRAND TOTAL,${gQty},${gTon},${gBox},,${gVal}`)
    }
    return rows
  }

  const planCSVRows = () => {
    const rows = ['Production Plan Report']
    rows.push('Period,' + planData.month + ' Sales → ' + planData.nextMonth + ' Plan (2-week stock arrangement)')
    rows.push('')
    rows.push('CITY WISE × PRODUCT WISE × PLATFORM WISE')
    const weekKeys = ['Week 1', 'Week 2', 'Week 3', 'Week 4']
    const splitWeeks = q => {
      const b = Math.floor(q / 4)
      const r = q % 4
      return weekKeys.map((_, i) => b + (i < r ? 1 : 0))
    }
    const weekCols = weekKeys.flatMap(w => [w + ' Plan Qty', w + ' Plan Boxes'])
    rows.push('City,Product,Platform,Sales Qty (3M),Plan Qty (95%),Plan Boxes,' + weekCols.join(','))
    const detail = []
    const prodTotals = {}
    const prodBoxes = {}
    for (const r of planData.baseItems) {
      prodBoxes[r.product] = Math.round(r.salesQty * 0.95 * r.perUnitBoxes)
      for (const c in r.combo) {
        for (const pl in r.combo[c]) {
          const cell = r.combo[c][pl]
          if (cell.qty <= 0) continue
          const planQty = Math.round(cell.qty * 0.95)
          const planBoxes = Math.round(planQty * r.perUnitBoxes)
          const wkQty = splitWeeks(planQty)
          const wkBoxes = splitWeeks(planBoxes)
          const cols = []
          weekKeys.forEach((_, i) => cols.push(wkQty[i], wkBoxes[i]))
          detail.push([c, r.product, pl, cell.qty, planQty, planBoxes].concat(cols))
          prodTotals[r.product] = (prodTotals[r.product] || 0) + cell.qty
        }
      }
    }
    detail.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]))
    detail.forEach(d => rows.push(d.map(x => csvEscape(String(x))).join(',')))
    rows.push('')
    rows.push('PRODUCT SUMMARY (UNIQUE PRODUCT - OVERALL PLAN COUNT)')
    rows.push('Product,Total Sales Qty (3M),Total Plan Qty (95%),Total Plan Boxes,' + weekCols.join(','))
    Object.entries(prodTotals).sort((a, b) => b[1] - a[1]).forEach(([p, q]) => {
      const pq = Math.round(q * 0.95)
      const wkQty = splitWeeks(pq)
      const wkBoxes = splitWeeks(prodBoxes[p] || 0)
      const cols = []
      weekKeys.forEach((_, i) => cols.push(wkQty[i], wkBoxes[i]))
      rows.push(`${csvEscape(p)},${q},${pq},${prodBoxes[p] || 0},${cols.join(',')}`)
    })
    rows.push('')
    rows.push('WEEK WISE PLAN')
    rows.push('Week,Plan Qty (95%),Plan Boxes')
    const weekQty = [0, 0, 0, 0]
    const weekBoxes = [0, 0, 0, 0]
    for (const r of planData.baseItems) {
      const pq = Math.round(r.salesQty * 0.95)
      const pb = Math.round(pq * r.perUnitBoxes)
      splitWeeks(pq).forEach((v, i) => { weekQty[i] += v })
      splitWeeks(pb).forEach((v, i) => { weekBoxes[i] += v })
    }
    weekKeys.forEach((wk, i) => rows.push(`${wk},${weekQty[i]},${weekBoxes[i]}`))
    const grand = Object.values(prodTotals).reduce((s, v) => s + v, 0)
    const grandBoxes = Object.values(prodBoxes).reduce((s, v) => s + v, 0)
    rows.push('')
    rows.push(`GRAND TOTAL,${grand},${Math.round(grand * 0.95)},${grandBoxes}`)
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

      {planItems.length > 0 && (() => {
        const t = planItems.reduce((s, r) => ({
          salesQty: s.salesQty + r.salesQty,
          planQty: s.planQty + r.planQty,
          planTonnage: s.planTonnage + r.planTonnage,
          planBoxes: s.planBoxes + r.planBoxes,
          totalValue: s.totalValue + r.totalValue,
        }), { salesQty: 0, planQty: 0, planTonnage: 0, planBoxes: 0, totalValue: 0 })
        return (
          <div className="recent-orders" style={{ marginTop: 20 }}>
            <div className="orders-header">
              <div className="orders-title">Production Plan — {planData.nextMonth}</div>
              <div className="chart-period">Based on {planData.month} sales • 5% lower projection</div>
              <CSVButton makeRows={planCSVRows} filename="production_plan.csv">⬇ Download Plan</CSVButton>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>{planData.month} Sales</th>
                    <th>Plan Qty</th>
                    <th>Plan Tonnage</th>
                    <th>Plan Boxes</th>
                    <th>Cost/Unit</th>
                    <th>Value</th>
                    <th>Platforms</th>
                    <th>Cities</th>
                  </tr>
                </thead>
                <tbody>
                  {planItems.map((row, i) => {
                    const pct = planItems.length ? (row.planQty / planItems[0].planQty * 100) : 0
                    return (
                      <tr key={i}>
                        <td style={{ position: 'relative', fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onMouseEnter={() => setHoverSku(row.product)} onMouseLeave={() => setHoverSku(null)}>{row.product}
                          {hoverSku === row.product && (
                            <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: 4, background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '8px 12px', zIndex: 9999, maxWidth: 420, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                              <span style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 600, wordBreak: 'break-word', whiteSpace: 'normal' }}>{row.product}</span>
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 50, height: 5, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: '#3b82f6', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 13 }}>{row.salesQty}</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600, color: '#3b82f6' }}>{row.planQty}</td>
                        <td>{row.planTonnage} KG</td>
                        <td>{row.planBoxes}</td>
                        <td style={{ fontSize: 12, color: '#94a3b8' }}>₹{row.perUnitCharge}</td>
                        <td style={{ fontSize: 12, color: '#94a3b8' }}>₹{row.totalValue.toLocaleString()}</td>
                        <td style={{ fontSize: 11, color: '#3b82f6', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.platforms.map(([n, q]) => `${n} (${q})`).join(' • ')}</td>
                        <td style={{ fontSize: 11, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.cities.map(([n, q]) => `${n} (${q})`).join(' • ')}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(59,130,246,0.12)' }}>
                    <td style={{ fontWeight: 700 }}>Total</td>
                    <td style={{ fontWeight: 700 }}>{t.salesQty}</td>
                    <td style={{ fontWeight: 700, color: '#3b82f6' }}>{t.planQty}</td>
                    <td style={{ fontWeight: 700 }}>{t.planTonnage} KG</td>
                    <td style={{ fontWeight: 700 }}>{t.planBoxes}</td>
                    <td>—</td>
                    <td style={{ fontWeight: 700 }}>₹{t.totalValue.toLocaleString()}</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}
    </>
  )
}
