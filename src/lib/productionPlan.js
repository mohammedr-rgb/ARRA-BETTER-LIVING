import { num, parseMMDDDate, csvEscape, MONTH_NAMES } from './utils'

export const SWIGGY_MRP = {
  "GEM'S GOLD Cold Pressed Groundnut oil 500.0 ml": 180,
  "GEM'S GOLD Cold Pressed Groundnut oil Bottle 1.0 ltr": 300,
  "GEM'S GOLD Cold Pressed Groundnut oil Bottle 2.0 ltr": 549,
  "GEM'S GOLD Cold Pressed Groundnut oil Pouch 1.0 ltr": 290,
  "GEM'S GOLD Dosa Spray 200.0 ml": 219,
}

export const BLINKIT_MRP = {
  "n.t.h Cold Pressed Extra Virgin Olive Oil Spray(Bottle) 200 ml": 299,
  "n.t.h Cold Pressed Groundnut Oil(Bottle) 1 ltr": 449,
  "N.t.h Extra Virgin Olive Oil(Bottle) 1 ltr": 1399,
  "GEM'S GOLD Cold Pressed Mustard oil Bottle 1.0 ltr": 349,
  "GEM'S GOLD Cold Pressed Groundnut oil Bottle 1.0 ltr": 449,
  "GEM'S GOLD Cold Pressed Sesame Oil 1.0 ltr": 275,
}

export function boxTypeFor(platform, city) {
  if (platform === 'Swiggy') return city === 'CHENNAI' || city === 'COIMBATORE' ? 'Normal Box' : 'White Box'
  if (platform === 'Blinkit') return 'White Box'
  return ''
}

export function mrpFor(platform, product, fallback) {
  if (platform === 'Swiggy') return SWIGGY_MRP[product] || fallback
  if (platform === 'Blinkit') return BLINKIT_MRP[product] || fallback
  return fallback
}

export function buildProductionPlan(data) {
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

  const combo = {}
  last3MonthOrders.forEach(r => {
    const city = (r['City'] || 'Unknown').trim()
    const platform = r['Platform'] || 'Unknown'
    const product = r['Product']
    if (!product) return
    const key = `${city}||${platform}||${product}`
    if (!combo[key]) combo[key] = { city, platform, product, qty: 0, boxes: 0, tonnage: 0, mrp: num(r['MRP']) }
    const cell = combo[key]
    cell.qty += num(r['PO Qty'])
    cell.boxes += num(r['Box Count'])
    cell.tonnage += num(r['Tonnage'])
  })

  const periodLabel = `${MONTH_NAMES[prev3.getMonth()]}–${MONTH_NAMES[prev1.getMonth()]}`
  const planMonths = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(thisYear, now.getMonth() + i, 1)
    planMonths.push({ label: MONTH_NAMES[d.getMonth()] })
  }

  const rows = Object.values(combo).map(r => {
    const perUnitBoxes = r.qty ? r.boxes / r.qty : 0
    const monthlyPlan = Math.round(r.qty / 3 * 0.9)
    return {
      city: r.city,
      platform: r.platform,
      product: r.product,
      mrp: mrpFor(r.platform, r.product, r.mrp),
      boxType: boxTypeFor(r.platform, r.city),
      salesQty: r.qty,
      salesTonnage: Math.round(r.tonnage),
      salesBoxes: r.boxes,
      planQty: monthlyPlan,
      planTonnage: Math.round(monthlyPlan * (r.qty ? r.tonnage / r.qty : 0)),
      planBoxes: Math.round(monthlyPlan * perUnitBoxes),
    }
  }).filter(x => x.salesQty > 0).sort((a, b) => b.planQty - a.planQty)

  const totals = rows.reduce((s, r) => ({
    salesQty: s.salesQty + r.salesQty,
    planQty: s.planQty + r.planQty,
    planTonnage: s.planTonnage + r.planTonnage,
    planBoxes: s.planBoxes + r.planBoxes,
  }), { salesQty: 0, planQty: 0, planTonnage: 0, planBoxes: 0 })

  return { period: periodLabel, planMonths, rows, totals }
}

export function planCSVRows(planData) {
  const rows = ['Production Plan — ' + planData.planMonths[0].label]
  rows.push(`Based on ${planData.period} sales • 90% production target`)
  rows.push('')
  rows.push(`City,Platform,Box Type,Product,MRP,${planData.planMonths.map(m => `${m.label} Plan Qty`).join(',')},${planData.planMonths.map(m => `${m.label} Plan Boxes`).join(',')},Total Plan Qty,Total Plan Boxes`)
  planData.rows.forEach(r => {
    rows.push([
      r.city, r.platform, r.boxType, r.product, r.mrp,
      ...planData.planMonths.map(() => r.planQty),
      ...planData.planMonths.map(() => r.planBoxes),
      r.planQty * 3, r.planBoxes * 3,
    ].map(x => csvEscape(String(x))).join(','))
  })
  rows.push('')
  rows.push(`TOTAL,,, ,,${planData.planMonths.map(() => planData.totals.planQty).join(',')},${planData.planMonths.map(() => planData.totals.planBoxes).join(',')},${planData.totals.planQty * 3},${planData.totals.planBoxes * 3}`)
  return rows
}
