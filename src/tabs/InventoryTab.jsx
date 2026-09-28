import { useMemo, useState, Fragment } from 'react'
import {
  num, parseMMDDDate, csvEscape, MONTH_NAMES, productSummary,
  getPurchaseDate, getPurchaseEntity, getPurchaseInvoiceNo, getPurchaseProduct,
  getPurchaseCost, getPurchaseTonnage, getPurchaseQty, getPurchaseBox, getPurchaseValue,
} from '../lib/utils'
import { CSVButton, ProfileSection, StatCard } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { buildProductionPlan, planCSVRows, groupRowsByBoxType, totalsFor } from '../lib/productionPlan'

const BOX_CHIP_COLORS = { 'White Box': '#22c55e', 'Standard Box': '#3b82f6' }

const OIL_PRODUCTS = [
  'Groundnut oil',
  'Sunflower oil',
  'Mustard oil',
  'Sesame Oil',
  'Nithyam Puja Oil',
  'Olive Oil',
  'Coconut Oil',
]

// Extra keyword aliases (besides the label itself) that should map to a label.
const OIL_LABEL_ALIASES = {
  'Groundnut oil': ['dosa spray', 'gems gold', 'gem gold', 'gemsgold'],
}

const normalizeProductName = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const matchOilLabel = (product) => {
  const s = normalizeProductName(product)
  for (const label of OIL_PRODUCTS) {
    const base = normalizeProductName(label)
    if (s.includes(base) || s.includes(base.replace(/ oil$/, ''))) return label
    const aliases = OIL_LABEL_ALIASES[label]
    if (aliases && aliases.some(a => s.includes(normalizeProductName(a)))) return label
  }
  return null
}

export default function InventoryTab({ data }) {
  const [purchaseSubView, setPurchaseSubView] = useState('lines') // 'lines', 'entity', 'product'
  const [selectedMonths, setSelectedMonths] = useState(() => {
    const now = new Date()
    return new Set([now.getFullYear() * 12 + now.getMonth()])
  })

  const monthOptions = useMemo(() => {
    const map = {}
    data.forEach(r => {
      const d = parseMMDDDate(r['Invoice Date (MM-DD-YYYY)']) || parseMMDDDate(getPurchaseDate(r))
      if (!d) return
      const mk = d.getFullYear() * 12 + d.getMonth()
      if (!map[mk]) map[mk] = `${MONTH_NAMES[mk % 12]} ${String(Math.floor(mk / 12)).slice(2)}`
    })
    return Object.entries(map).sort((a, b) => Number(b[0]) - Number(a[0])).map(([mk, label]) => ({ mk: Number(mk), label }))
  }, [data])

  const toggleMonth = (mk) => {
    setSelectedMonths(prev => {
      const next = new Set(prev)
      if (next.has(mk)) next.delete(mk)
      else next.add(mk)
      return next
    })
  }

  const resetMonths = () => setSelectedMonths(new Set())

  const periodData = useMemo(() => {
    if (!selectedMonths.size) return data
    return data.filter(r => {
      const d = parseMMDDDate(r['Invoice Date (MM-DD-YYYY)'])
      return d && selectedMonths.has(d.getFullYear() * 12 + d.getMonth())
    })
  }, [data, selectedMonths])

  const scopeLabel = useMemo(() => {
    if (!selectedMonths.size) return 'All months'
    return [...selectedMonths]
      .sort((a, b) => a - b)
      .map(mk => MONTH_NAMES[mk % 12] + ' ' + String(Math.floor(mk / 12)).slice(2))
      .join(', ')
  }, [selectedMonths])


  const productData = useMemo(() => productSummary(periodData), [periodData])

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
    periodData.forEach(r => {
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
  }, [periodData])

  const oilRows = useMemo(() => {
    const acc = {}
    OIL_PRODUCTS.forEach(l => { acc[l.toLowerCase()] = { product: l, qty: 0, tonnage: 0 } })
    for (const r of periodData) {
      const label = matchOilLabel(r['Product'])
      if (!label) continue
      const key = label.toLowerCase()
      if (!acc[key]) acc[key] = { product: label, qty: 0, tonnage: 0 }
      acc[key].qty += num(r['PO Qty'])
      acc[key].tonnage += num(r['Tonnage'])
    }
    return OIL_PRODUCTS.map(l => acc[l.toLowerCase()])
  }, [periodData])

  const otherRows = useMemo(() => {
    const map = {}
    for (const r of periodData) {
      if (matchOilLabel(r['Product'])) continue
      const p = r['Product'] || 'Unknown'
      if (!map[p]) map[p] = { product: p, qty: 0, tonnage: 0 }
      map[p].qty += num(r['PO Qty'])
      map[p].tonnage += num(r['Tonnage'])
    }
    return Object.values(map).sort((a, b) => b.tonnage - a.tonnage)
  }, [periodData])

  const inventoryTotals = useMemo(() => ({
    qty: productData.reduce((s, r) => s + r.qty, 0),
    tonnage: productData.reduce((s, r) => s + r.tonnage, 0),
    boxes: productData.reduce((s, r) => s + r.boxes, 0),
    value: productData.reduce((s, r) => s + r.value, 0),
  }), [productData])

  const inventoryStats = [
    { label: 'Total Qty', icon: '🧴', color: '#3b82f6', value: inventoryTotals.qty.toLocaleString() },
    { label: 'Total Tonnage', icon: '⚖️', color: '#eab308', value: Math.round(inventoryTotals.tonnage).toLocaleString() + ' KG' },
    { label: 'Total Boxes', icon: '📦', color: '#a855f7', value: inventoryTotals.boxes.toLocaleString() },
    { label: 'Total Value', icon: '₹', color: '#22c55e', value: '₹' + Math.round(inventoryTotals.value).toLocaleString() },
  ]


  const inventoryCSVRows = () => {
    const rows = ['Inventory Summary']
    rows.push('')
    rows.push('Product,Total Qty,Tonnage KG,Boxes,Total Value')
    productData.forEach(r => {
      rows.push(csvEscape(r.product) + ',' + r.qty + ',' + Math.round(r.tonnage) + ',' + r.boxes + ',' + Math.round(r.value))
    })
    rows.push('TOTAL,' + productData.reduce((s, r) => s + r.qty, 0) + ',' + Math.round(productData.reduce((s, r) => s + r.tonnage, 0)) + ',' + productData.reduce((s, r) => s + r.boxes, 0) + ',' + Math.round(productData.reduce((s, r) => s + r.value, 0)))
    rows.push('')

    // Product & City-wise breakdown
    rows.push('Product & City-wise Summary')
    rows.push('')
    rows.push('Product,City,Qty,Tonnage KG,Boxes,Value')
    const poQtyMap = {}
    const poValueMap = {}
    for (const r of periodData) {
      const po = r['PO Number']; if (!po) continue
      poQtyMap[po] = (poQtyMap[po] || 0) + num(r['PO Qty'])
      const v = num(r['PO Value with Tax'])
      if (v > 0 && v > (poValueMap[po] || 0)) poValueMap[po] = v
    }
    const pcMap = {}
    for (const r of periodData) {
      const p = r['Product']; if (!p) continue
      const c = r['City'] || 'Unknown'
      const po = r['PO Number']
      const key = p + '||' + c
      if (!pcMap[key]) pcMap[key] = { product: p, city: c, qty: 0, tonnage: 0, boxes: 0, value: 0 }
      pcMap[key].qty += num(r['PO Qty'])
      pcMap[key].tonnage += num(r['Tonnage'])
      pcMap[key].boxes += num(r['Box Count'])
      const share = po && poQtyMap[po] ? num(r['PO Qty']) / poQtyMap[po] : 0
      pcMap[key].value += (poValueMap[po] || 0) * share
    }
    const pcRows = Object.values(pcMap).sort((a, b) => a.product.localeCompare(b.product) || b.value - a.value)
    pcRows.forEach(r => {
      rows.push([csvEscape(r.product), csvEscape(r.city), Math.round(r.qty), Math.round(r.tonnage), Math.round(r.boxes), Math.round(r.value)].join(','))
    })
    rows.push('TOTAL,' + Math.round(pcRows.reduce((s, r) => s + r.qty, 0)) + ',' + Math.round(pcRows.reduce((s, r) => s + r.tonnage, 0)) + ',' + Math.round(pcRows.reduce((s, r) => s + r.boxes, 0)) + ',' + Math.round(pcRows.reduce((s, r) => s + r.value, 0)))
    rows.push('')

    rows.push('Invoice-wise Details')
    rows.push('Invoice No,Invoice Date,Product,Platform,PO Number,PO Qty,Tonnage KG,Box Count,Invoice Value')
    const detail = [...periodData]
      .filter(r => (r['Invoice No'] || '').trim())
      .sort((a, b) => String(a['Invoice Date (MM-DD-YYYY)'] || '').localeCompare(String(b['Invoice Date (MM-DD-YYYY)'] || '')))
    detail.forEach(r => {
      rows.push([r['Invoice No'], r['Invoice Date (MM-DD-YYYY)'], r['Product'], r['Platform'], r['PO Number'], num(r['PO Qty']), Math.round(num(r['Tonnage'])), Math.round(num(r['Box Count'])), num(r['Invoice Value'])].map(x => csvEscape(String(x ?? ''))).join(','))
    })
    return rows
  }

  const oilCSVRows = () => {
    const rows = ['Overall Product wise summary']
    rows.push('')
    rows.push('Product,Qty,Tonnage KG')
    oilRows.forEach(r => {
      rows.push(csvEscape(r.product) + ',' + r.qty + ',' + Math.round(r.tonnage))
    })
    rows.push('TOTAL,' + oilRows.reduce((s, r) => s + r.qty, 0) + ',' + Math.round(oilRows.reduce((s, r) => s + r.tonnage, 0)))
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

  // ========================================================
  // PURCHASE DATA (COLUMNS B TO J - GID 1664329820)
  // ========================================================
  const purchaseRows = useMemo(() => {
    const list = []
    let sno = 1
    for (const r of data || []) {
      const date = getPurchaseDate(r)
      const entity = getPurchaseEntity(r)
      const invoice = getPurchaseInvoiceNo(r)
      const product = getPurchaseProduct(r)
      const cost = getPurchaseCost(r)
      const tonnage = getPurchaseTonnage(r)
      const qty = getPurchaseQty(r)
      const box = getPurchaseBox(r)
      const value = getPurchaseValue(r)

      const hasAny = Boolean(date || entity || invoice || product || cost > 0 || tonnage > 0 || qty > 0 || box > 0 || value > 0)
      if (!hasAny) continue

      if (selectedMonths.size > 0) {
        const d = parseMMDDDate(date) || parseMMDDDate(r['Invoice Date (MM-DD-YYYY)'])
        if (!d || !selectedMonths.has(d.getFullYear() * 12 + d.getMonth())) {
          continue
        }
      }

      const unitTonnage = tonnage
      const totalRowTonnage = (unitTonnage > 0 && qty > 0) ? Math.round(unitTonnage * qty * 100) / 100 : (unitTonnage || 0)

      list.push({
        sno: sno++,
        date: date || '—',
        entity: entity || 'General / Direct',
        invoice: invoice || '—',
        product: product || '—',
        cost: cost || (qty > 0 && value > 0 ? Math.round(value / qty) : 0),
        unitTonnage: unitTonnage || 0,
        tonnage: totalRowTonnage,
        qty: qty || 0,
        box: box || 0,
        value: value || 0,
        ratePerKg: totalRowTonnage > 0 ? Math.round((value / totalRowTonnage) * 100) / 100 : 0,
        raw: r,
      })
    }
    return list
  }, [data, selectedMonths])

  const purchaseMetrics = useMemo(() => {
    let totalTonnage = 0
    let totalValue = 0
    let totalQty = 0
    let totalBoxes = 0
    const invoices = new Set()
    const entities = new Map()
    const products = new Map()

    for (const r of purchaseRows) {
      totalTonnage += r.tonnage
      totalValue += r.value
      totalQty += r.qty
      totalBoxes += r.box

      if (r.invoice && r.invoice !== '—') invoices.add(r.invoice)

      const ent = r.entity
      if (!entities.has(ent)) {
        entities.set(ent, { entity: ent, tonnage: 0, value: 0, qty: 0, boxes: 0, invoices: new Set() })
      }
      const eData = entities.get(ent)
      eData.tonnage += r.tonnage
      eData.value += r.value
      eData.qty += r.qty
      eData.boxes += r.box
      if (r.invoice && r.invoice !== '—') eData.invoices.add(r.invoice)

      const prod = r.product
      if (!products.has(prod)) {
        products.set(prod, { product: prod, tonnage: 0, value: 0, qty: 0, boxes: 0, lines: 0 })
      }
      const pData = products.get(prod)
      pData.tonnage += r.tonnage
      pData.value += r.value
      pData.qty += r.qty
      pData.boxes += r.box
      pData.lines += 1
    }

    const entityList = [...entities.values()]
      .map(e => ({
        ...e,
        invoiceCount: e.invoices.size,
        avgRate: e.tonnage ? Math.round((e.value / e.tonnage) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.tonnage - a.tonnage)

    const productList = [...products.values()]
      .map(p => ({
        ...p,
        avgRate: p.tonnage ? Math.round((p.value / p.tonnage) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.tonnage - a.tonnage)

    return {
      lines: purchaseRows.length,
      tonnage: Math.round(totalTonnage),
      value: Math.round(totalValue),
      qty: Math.round(totalQty),
      boxes: Math.round(totalBoxes),
      uniqueInvoices: invoices.size,
      uniqueEntities: entities.size,
      avgRatePerKg: totalTonnage ? Math.round((totalValue / totalTonnage) * 100) / 100 : 0,
      entities: entityList,
      products: productList,
    }
  }, [purchaseRows])

  const purchaseCSVRows = () => {
    const rows = ['Purchase Details (Columns B to J)']
    rows.push('')
    rows.push('S.No,Purchase Date(MM-DD-YYYY),Purchase Entity,Purchase Invoice Number,Purchase Products,Purchase Cost,Unit Tonnage(KG),Purchase QTY,Total Tonnage(KG) [G*H],Purchase Box,Purchase Values,Rate / KG (₹)')
    purchaseRows.forEach(r => {
      rows.push([
        r.sno,
        csvEscape(r.date),
        csvEscape(r.entity),
        csvEscape(r.invoice),
        csvEscape(r.product),
        r.cost,
        r.unitTonnage,
        r.qty,
        r.tonnage,
        r.box,
        r.value,
        r.ratePerKg,
      ].join(','))
    })
    rows.push('')
    rows.push(`TOTAL,,${purchaseMetrics.uniqueEntities} Entities,${purchaseMetrics.uniqueInvoices} Invoices,,${purchaseMetrics.tonnage},${purchaseMetrics.qty},${purchaseMetrics.boxes},${purchaseMetrics.value},${purchaseMetrics.avgRatePerKg}`)
    return rows
  }

  const purchaseColumns = [
    {
      key: 'sno',
      label: 'S.No',
      align: 'center',
      accessor: r => r.sno,
      render: r => <span style={{ color: '#64748b', fontSize: 11 }}>{r.sno}</span>,
    },
    {
      key: 'date',
      label: 'Purchase Date (B)',
      accessor: r => r.date,
      render: r => <span style={{ color: '#cbd5e1', fontSize: 12 }}>{r.date}</span>,
    },
    {
      key: 'entity',
      label: 'Purchase Entity (C)',
      accessor: r => r.entity,
      render: r => <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{r.entity}</span>,
    },
    {
      key: 'invoice',
      label: 'Invoice No (D)',
      accessor: r => r.invoice,
      render: r => <span style={{ fontFamily: 'monospace', color: '#38bdf8', fontSize: 12 }}>{r.invoice}</span>,
    },
    {
      key: 'product',
      label: 'Purchase Product (E)',
      accessor: r => r.product,
      render: r => <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.product}</span>,
    },
    {
      key: 'cost',
      label: 'Cost ₹ (F)',
      align: 'right',
      accessor: r => r.cost,
      render: r => r.cost ? '₹' + Number(r.cost).toLocaleString() : '—',
    },
    {
      key: 'unitTonnage',
      label: 'Unit Tonnage (G)',
      align: 'right',
      accessor: r => r.unitTonnage,
      render: r => r.unitTonnage ? Number(r.unitTonnage).toFixed(2) + ' KG' : '—',
    },
    {
      key: 'qty',
      label: 'QTY (H)',
      align: 'right',
      accessor: r => r.qty,
      render: r => r.qty ? Number(r.qty).toLocaleString() : '—',
    },
    {
      key: 'tonnage',
      label: 'Total Tonnage KG (G × H)',
      align: 'right',
      accessor: r => r.tonnage,
      render: r => <span style={{ fontWeight: 700, color: '#f97316' }}>{r.tonnage ? Number(r.tonnage).toLocaleString() + ' KG' : '—'}</span>,
    },
    {
      key: 'box',
      label: 'Box (I)',
      align: 'right',
      accessor: r => r.box,
      render: r => r.box ? Number(r.box).toLocaleString() : '—',
    },
    {
      key: 'value',
      label: 'Purchase Value ₹ (J)',
      align: 'right',
      accessor: r => r.value,
      render: r => <span style={{ fontWeight: 700, color: '#22c55e' }}>{'₹' + Number(r.value).toLocaleString()}</span>,
    },
    {
      key: 'ratePerKg',
      label: 'Rate / KG (₹)',
      align: 'right',
      accessor: r => r.ratePerKg,
      render: r => {
        const rate = r.ratePerKg
        if (!rate) return <span style={{ color: '#64748b' }}>—</span>
        return <span style={{ fontWeight: 600, color: '#c084fc' }}>{'₹' + Number(rate).toFixed(2)}</span>
      },
    },
  ]

  const entityColumns = [
    {
      key: 'entity',
      label: 'Purchase Entity (Supplier)',
      accessor: r => r.entity,
      render: r => <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{r.entity}</span>,
    },
    {
      key: 'invoiceCount',
      label: 'Invoices',
      align: 'right',
      accessor: r => r.invoiceCount,
      render: r => <span style={{ color: '#38bdf8', fontWeight: 600 }}>{r.invoiceCount}</span>,
    },
    {
      key: 'qty',
      label: 'Total QTY',
      align: 'right',
      accessor: r => r.qty,
      render: r => r.qty.toLocaleString(),
    },
    {
      key: 'tonnage',
      label: 'Total Tonnage (KG)',
      align: 'right',
      accessor: r => r.tonnage,
      render: r => <span style={{ fontWeight: 600 }}>{r.tonnage.toLocaleString()} KG</span>,
    },
    {
      key: 'boxes',
      label: 'Boxes',
      align: 'right',
      accessor: r => r.boxes,
      render: r => r.boxes.toLocaleString(),
    },
    {
      key: 'value',
      label: 'Total Purchase Spend (₹)',
      align: 'right',
      accessor: r => r.value,
      render: r => <span style={{ color: '#22c55e', fontWeight: 700 }}>₹{r.value.toLocaleString()}</span>,
    },
    {
      key: 'avgRate',
      label: 'Avg Cost / KG (₹)',
      align: 'right',
      accessor: r => r.avgRate,
      render: r => <span style={{ color: '#c084fc', fontWeight: 700 }}>₹{r.avgRate.toFixed(2)}</span>,
    },
  ]

  const purchaseProductColumns = [
    {
      key: 'product',
      label: 'Purchase Product',
      accessor: r => r.product,
      render: r => <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{r.product}</span>,
    },
    {
      key: 'lines',
      label: 'Line Items',
      align: 'right',
      accessor: r => r.lines,
      render: r => <span style={{ color: '#94a3b8' }}>{r.lines}</span>,
    },
    {
      key: 'qty',
      label: 'Total QTY',
      align: 'right',
      accessor: r => r.qty,
      render: r => r.qty.toLocaleString(),
    },
    {
      key: 'tonnage',
      label: 'Total Tonnage (KG)',
      align: 'right',
      accessor: r => r.tonnage,
      render: r => <span style={{ fontWeight: 600 }}>{r.tonnage.toLocaleString()} KG</span>,
    },
    {
      key: 'boxes',
      label: 'Boxes',
      align: 'right',
      accessor: r => r.boxes,
      render: r => r.boxes.toLocaleString(),
    },
    {
      key: 'value',
      label: 'Total Purchase Spend (₹)',
      align: 'right',
      accessor: r => r.value,
      render: r => <span style={{ color: '#22c55e', fontWeight: 700 }}>₹{r.value.toLocaleString()}</span>,
    },
    {
      key: 'avgRate',
      label: 'Avg Cost / KG (₹)',
      align: 'right',
      accessor: r => r.avgRate,
      render: r => <span style={{ color: '#c084fc', fontWeight: 700 }}>₹{r.avgRate.toFixed(2)}</span>,
    },
  ]

  return (
    <>
      <header>
        <div>
          <h1>Inventory</h1>
          <div className="date">{productData.length} unique products • {scopeLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.5 }}>PERIOD</span>
            <button
              onClick={resetMonths}
              style={{ padding: '4px 10px', borderRadius: 16, border: '1px solid ' + (selectedMonths.size === 0 ? '#3b82f6' : '#334155'), background: selectedMonths.size === 0 ? 'rgba(59,130,246,0.15)' : '#1e293b', color: selectedMonths.size === 0 ? '#3b82f6' : '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              All
            </button>
            {monthOptions.map(m => {
              const on = selectedMonths.has(m.mk)
              return (
                <button
                  key={m.mk}
                  onClick={() => toggleMonth(m.mk)}
                  style={{ padding: '4px 10px', borderRadius: 16, border: '1px solid ' + (on ? '#22c55e' : '#334155'), background: on ? 'rgba(34,197,94,0.15)' : '#1e293b', color: on ? '#22c55e' : '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
          <ProfileSection />
        </div>
      </header>

      <div className="stats-grid" style={{ marginTop: 0 }}>
        {inventoryStats.map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-header">
              <div className="stat-label">{s.label}</div>
              <div className="stat-icon" style={{ background: `${s.color}26`, color: s.color }}>{s.icon}</div>
            </div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      {/* ======================================================== */}
      {/* PURCHASE OVERVIEW & TABLES (COLUMNS B TO J)              */}
      {/* ======================================================== */}
      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 14,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🛒</span>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
                Purchase Overview &amp; Cost Analysis (Columns B to J)
              </h2>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
              Source Sheet: gid=1664329820 • Columns: Date (B), Entity (C), Invoice (D), Product (E), Cost (F), Tonnage (G), QTY (H), Box (I), Value (J) • {scopeLabel}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <a
              href="https://docs.google.com/spreadsheets/d/14riCGmsLkuomzSETNSITLulbWyl7hono2U4NMRowpdI/edit?gid=1664329820#gid=1664329820"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: '#38bdf8',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              📊 Open Sheet (gid 1664329820)
            </a>
            <CSVButton makeRows={purchaseCSVRows} filename="purchase_records_b_to_j.csv" />
          </div>
        </div>

        {/* Purchase KPI Cards */}
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <StatCard
            label="Total Purchase Value"
            icon="💰"
            color="#22c55e"
            value={'₹' + purchaseMetrics.value.toLocaleString()}
            change={`Col J • ${purchaseMetrics.lines} Line Items`}
            changeColor="#22c55e"
          />
          <StatCard
            label="Total Purchase Tonnage"
            icon="⚖️"
            color="#f97316"
            value={purchaseMetrics.tonnage.toLocaleString() + ' KG'}
            change={`Col G (Unit Tonnage) × Col H (QTY)`}
            changeColor="#38bdf8"
          />
          <StatCard
            label="Total Purchase QTY"
            icon="🧴"
            color="#3b82f6"
            value={purchaseMetrics.qty.toLocaleString() + ' Units'}
            change={`Col H Quantity`}
            changeColor="#3b82f6"
          />
          <StatCard
            label="Avg Cost per KG"
            icon="🎯"
            color="#a855f7"
            value={'₹' + purchaseMetrics.avgRatePerKg.toFixed(2) + ' / KG'}
            change={`Total Spend ÷ Total KG`}
            changeColor="#a855f7"
          />
          <StatCard
            label="Purchase Invoices"
            icon="🧾"
            color="#06b6d4"
            value={purchaseMetrics.uniqueInvoices.toLocaleString()}
            change={`Col D Unique Invoices`}
            changeColor="#06b6d4"
          />
          <StatCard
            label="Purchase Entities"
            icon="🏢"
            color="#eab308"
            value={purchaseMetrics.uniqueEntities.toLocaleString()}
            change={`Col C Suppliers / Vendors`}
            changeColor="#eab308"
          />
        </div>

        {/* View Switcher / Sub-tabs */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          background: '#1e293b',
          padding: '10px 14px',
          borderRadius: '12px 12px 0 0',
          border: '1px solid #334155',
          borderBottom: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Purchase View:</span>
            {[
              { id: 'lines', label: `📑 Detailed Invoices (${purchaseRows.length})` },
              { id: 'entity', label: `🏢 By Entity (${purchaseMetrics.entities.length})` },
              { id: 'product', label: `🧴 By Product (${purchaseMetrics.products.length})` },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setPurchaseSubView(t.id)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid ' + (purchaseSubView === t.id ? '#3b82f6' : '#334155'),
                  background: purchaseSubView === t.id ? '#3b82f6' : '#0f172a',
                  color: purchaseSubView === t.id ? '#ffffff' : '#94a3b8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Showing {purchaseSubView === 'lines' ? `${purchaseRows.length} line items` : purchaseSubView === 'entity' ? `${purchaseMetrics.entities.length} entities` : `${purchaseMetrics.products.length} products`}
          </div>
        </div>

        {/* Table Container */}
        <div style={{
          background: '#1e293b',
          borderRadius: '0 0 12px 12px',
          border: '1px solid #334155',
          overflow: 'hidden',
          marginBottom: 10,
        }}>
          {purchaseSubView === 'lines' && (
            <DataTable
              columns={purchaseColumns}
              rows={purchaseRows}
              pageSize={15}
              filename="purchase_detailed_records.csv"
              emptyMessage="No purchase records found in the selected period"
            />
          )}

          {purchaseSubView === 'entity' && (
            <DataTable
              columns={entityColumns}
              rows={purchaseMetrics.entities}
              pageSize={10}
              filename="purchase_by_entity.csv"
              emptyMessage="No entity summary found"
            />
          )}

          {purchaseSubView === 'product' && (
            <DataTable
              columns={purchaseProductColumns}
              rows={purchaseMetrics.products}
              pageSize={10}
              filename="purchase_by_product.csv"
              emptyMessage="No product summary found"
            />
          )}

          {/* Totals Summary Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            background: '#0f172a',
            borderTop: '2px solid #334155',
            padding: '12px 18px',
            fontSize: 13,
          }}>
            <div style={{ color: '#94a3b8', fontWeight: 600 }}>
              Purchase Total: <span style={{ color: '#f1f5f9' }}>{purchaseRows.length} Line Items</span> • <span style={{ color: '#f1f5f9' }}>{purchaseMetrics.uniqueInvoices} Invoices</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <span style={{ color: '#94a3b8', marginRight: 6 }}>Total QTY:</span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>{purchaseMetrics.qty.toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: '#94a3b8', marginRight: 6 }}>Total Weight:</span>
                <span style={{ color: '#eab308', fontWeight: 700 }}>{purchaseMetrics.tonnage.toLocaleString()} KG</span>
              </div>
              <div>
                <span style={{ color: '#94a3b8', marginRight: 6 }}>Total Boxes:</span>
                <span style={{ color: '#a855f7', fontWeight: 700 }}>{purchaseMetrics.boxes.toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: '#94a3b8', marginRight: 6 }}>Total Spend:</span>
                <span style={{ color: '#22c55e', fontWeight: 700 }}>₹{purchaseMetrics.value.toLocaleString()}</span>
              </div>
              <div style={{
                padding: '3px 10px',
                background: 'rgba(168,85,247,0.15)',
                border: '1px solid rgba(168,85,247,0.4)',
                borderRadius: 8,
              }}>
                <span style={{ color: '#94a3b8', marginRight: 6 }}>Avg Rate:</span>
                <span style={{ color: '#c084fc', fontWeight: 800, fontSize: 13 }}>₹{purchaseMetrics.avgRatePerKg.toFixed(2)} / KG</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="recent-orders" style={{ marginTop: 20 }}>
        <div className="orders-header">
          <div className="orders-title">Overall Product wise summary</div>
          <div className="chart-period">Qty &amp; Tonnage (KG) • {scopeLabel}</div>
          <CSVButton makeRows={oilCSVRows} filename="oil_products_summary.csv" />
        </div>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Qty</th>
              <th>Tonnage (KG)</th>
            </tr>
          </thead>
          <tbody>
            {oilRows.map((row, i) => (
              <tr key={i}>
                <td>{row.product}</td>
                <td>{row.qty}</td>
                <td>{Math.round(row.tonnage)}</td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(59,130,246,0.08)', fontWeight: 700 }}>
              <td style={{ borderTop: '2px solid #334155' }}>TOTAL</td>
              <td style={{ borderTop: '2px solid #334155' }}>{oilRows.reduce((s, r) => s + r.qty, 0).toLocaleString()}</td>
              <td style={{ borderTop: '2px solid #334155' }}>{Math.round(oilRows.reduce((s, r) => s + r.tonnage, 0)).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
            Other products not in oils list — {Math.round(otherRows.reduce((s, r) => s + r.tonnage, 0)).toLocaleString()} KG ({otherRows.length} products)
          </summary>
          <div style={{ marginTop: 10, maxHeight: 240, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Tonnage (KG)</th>
                </tr>
              </thead>
              <tbody>
                {otherRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.product}</td>
                    <td>{row.qty}</td>
                    <td>{Math.round(row.tonnage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="recent-orders" style={{ marginTop: 20 }}>
        <div className="orders-header">
          <div className="orders-title">Product-wise Summary</div>
          <div className="chart-period">By Tonnage (KG) • Total Qty • Boxes • Value • City-wise breakdown in CSV</div>
          <CSVButton makeRows={inventoryCSVRows} filename="inventory_summary.csv" />
        </div>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Total Qty ({inventoryTotals.qty.toLocaleString()})</th>
              <th>Tonnage (KG) ({Math.round(inventoryTotals.tonnage).toLocaleString()})</th>
              <th>Boxes ({inventoryTotals.boxes.toLocaleString()})</th>
              <th>Total Value (₹{Math.round(inventoryTotals.value).toLocaleString()})</th>
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
            <tr style={{ background: 'rgba(59,130,246,0.08)', fontWeight: 700 }}>
              <td style={{ borderTop: '2px solid #334155' }}>TOTAL</td>
              <td style={{ borderTop: '2px solid #334155' }}>{productData.reduce((s, r) => s + r.qty, 0).toLocaleString()}</td>
              <td style={{ borderTop: '2px solid #334155' }}>{Math.round(productData.reduce((s, r) => s + r.tonnage, 0)).toLocaleString()}</td>
              <td style={{ borderTop: '2px solid #334155' }}>{productData.reduce((s, r) => s + r.boxes, 0).toLocaleString()}</td>
              <td style={{ borderTop: '2px solid #334155' }}>₹{Math.round(productData.reduce((s, r) => s + r.value, 0)).toLocaleString()}</td>
            </tr>
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
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#f1f5f9', textAlign: 'right' }}>₹{r.mrp}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#f1f5f9', textAlign: 'right' }}>{r.salesQty}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#3b82f6', textAlign: 'right', fontWeight: 600 }}>{r.planQty}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#f1f5f9', textAlign: 'right' }}>{r.planBoxes}</td>
                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #1e293b', color: '#f1f5f9', textAlign: 'right' }}>{r.planTonnage}</td>
                          </tr>
                        ))}
                        <tr style={{ background: 'rgba(139,92,246,0.08)', fontWeight: 700 }}>
                          <td style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#a78bfa' }}>SUBTOTAL {section.boxType}</td>
                          <td colSpan={2} style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#94a3b8' }}></td>
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
                    <td colSpan={3} style={{ padding: '8px 10px', borderTop: '2px solid #334155', color: '#94a3b8' }}></td>
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
