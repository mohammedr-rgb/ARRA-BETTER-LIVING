export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const statusFilters = ['All', 'Active', 'Delivered', 'RTO']

export function num(val) {
  const cleaned = String(val).replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

export const toNumKG = num

export function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = []
    let current = ''
    let inQuotes = false
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { vals.push(current.trim()); current = ''; continue }
      current += ch
    }
    vals.push(current.trim())
    if (vals.length < headers.length || vals.every(v => !v)) continue
    const row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] ? vals[idx].replace(/^#REF!$/, '') : '' })
    rows.push(row)
  }
  return rows
}

export function csvEscape(v) {
  const s = String(v ?? '')
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCSV(rows, filename) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function uniqueByPO(arr) {
  const seen = new Set()
  return arr.filter(r => {
    const po = r['PO Number']
    if (!po || seen.has(po)) return false
    seen.add(po)
    return true
  })
}

export function sumField(arr, field) {
  return arr.reduce((s, r) => s + num(r[field]), 0)
}

export function productSummary(rows) {
  const poQty = {}
  const poValue = {}
  for (const r of rows) {
    const po = r['PO Number']; if (!po) continue
    poQty[po] = (poQty[po] || 0) + num(r['PO Qty'])
    const v = num(r['PO Value with Tax'])
    if (v > 0 && v > (poValue[po] || 0)) poValue[po] = v
  }
  const map = {}
  for (const r of rows) {
    const p = r['Product']
    if (!p) continue
    if (!map[p]) map[p] = { product: p, qty: 0, tonnage: 0, boxes: 0, value: 0 }
    map[p].qty += num(r['PO Qty'])
    map[p].tonnage += num(r['Tonnage'])
    map[p].boxes += num(r['Box Count'])
    const po = r['PO Number']
    const share = po && poQty[po] ? num(r['PO Qty']) / poQty[po] : 0
    map[p].value += (poValue[po] || 0) * share
  }
  return Object.values(map).sort((a, b) => b.tonnage - a.tonnage)
}

export function sumPOField(arr, field) {
  const map = {}
  for (const r of arr) {
    const po = r['PO Number']
    if (!po) continue
    const v = num(r[field])
    if (v > 0 && v > (map[po] || 0)) map[po] = v
  }
  return Object.values(map).reduce((s, v) => s + v, 0)
}

// --- Purchase Value (line-item) helpers ---
// Correct logic: SUM over every line item of (Purchase Cost × Purchase QTY).
// This must NOT use sumPOField/uniqueByPO (max-per-PO dedup) because each
// line has its own purchase cost. Blank/missing values count as 0.
export const PURCHASE_GST_RATE = 0.05

function getFieldCI(row, candidates) {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') return row[c]
  }
  // case-insensitive fallback
  const keys = Object.keys(row || {})
  const lower = {}
  keys.forEach(k => { lower[String(k).toLowerCase().trim()] = k })
  for (const c of candidates) {
    const k = lower[String(c).toLowerCase().trim()]
    if (k && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k]
  }
  return ''
}

// Fuzzy detection: find actual sheet keys for purchase cost/qty/value (handles
// variants like "Purchase Cost (₹)", trailing spaces, column J, etc.)
export function detectPurchaseColumns(rows) {
  const keys = new Set()
  ;(rows || []).forEach(r => Object.keys(r || {}).forEach(k => keys.add(k)))
  const list = [...keys]
  const costKey = list.find(k => {
    const l = String(k).toLowerCase()
    return l.includes('purchase') && (l.includes('cost') || l.includes('rate') || l.includes('price')) && !l.includes('value') && !l.includes('amount')
  }) || null
  const qtyKey = list.find(k => {
    const l = String(k).toLowerCase()
    return l.includes('purchase') && (l.includes('qty') || l.includes('quantity') || l.includes('qnty'))
  }) || null
  const valueKey = list.find(k => {
    const l = String(k).toLowerCase()
    return l.includes('purchase') && (l.includes('value') || l.includes('amount'))
  }) || null
  return { costKey, qtyKey, valueKey, allKeys: list }
}

export function purchaseCostOf(row) {
  // exact candidates first, then fuzzy key containing purchase+cost/rate/price
  const exact = num(getFieldCI(row, ['Purchase Cost', 'Purchase cost', 'Purchase Rate', 'Purchase Price']))
  if (exact > 0) return exact
  const keys = Object.keys(row || {})
  for (const k of keys) {
    const l = String(k).toLowerCase()
    if (l.includes('purchase') && (l.includes('cost') || l.includes('rate') || l.includes('price'))) {
      const v = num(row[k])
      if (v > 0) return v
    }
  }
  return 0
}

export function purchaseQtyOf(row) {
  const exact = num(getFieldCI(row, ['Purchase QTY', 'Purchase Qty', 'Purchase qty', 'Purchase Quantity', 'Purchase quantity', 'Purchase QT']))
  if (exact > 0) return exact
  const keys = Object.keys(row || {})
  for (const k of keys) {
    const l = String(k).toLowerCase()
    if (l.includes('purchase') && (l.includes('qty') || l.includes('quantity') || l.includes('qnty'))) {
      const v = num(row[k])
      if (v > 0) return v
    }
  }
  return 0
}

export function purchaseLineValue(row) {
  const computed = purchaseCostOf(row) * purchaseQtyOf(row)
  if (computed > 0) return computed
  // Fallback: precomputed per-line Purchase Value / Amount column (e.g. sheet column J).
  // Line-item sum only — never dedup by PO.
  const keys = Object.keys(row || {})
  for (const k of keys) {
    const l = String(k).toLowerCase()
    if (l.includes('purchase') && (l.includes('value') || l.includes('amount'))) {
      const v = num(row[k])
      if (v > 0) return v
    }
  }
  return 0
}

export function sumPurchaseBase(arr) {
  return (arr || []).reduce((s, r) => s + purchaseLineValue(r), 0)
}

export function sumPurchaseWithGST(arr, rate = PURCHASE_GST_RATE) {
  return sumPurchaseBase(arr) * (1 + rate)
}

export function purchaseStats(arr, rate = PURCHASE_GST_RATE) {
  const rows = arr || []
  let populated = 0
  let blank = 0
  let base = 0
  for (const r of rows) {
    const v = purchaseLineValue(r)
    base += v
    if (v > 0) populated++
    else blank++
  }
  return {
    lines: rows.length,
    populated,
    blank,
    base,
    withGST: base * (1 + rate),
    gstRate: rate,
  }
}

export function parseDate(str) {
  if (!str) return null
  const parts = str.split('-')
  if (parts.length !== 3) return null
  const a = parseInt(parts[0], 10)
  const b = parseInt(parts[1], 10)
  const year = parseInt(parts[2], 10)
  let day, month
  if (b >= 1 && b <= 12) {
    day = a
    month = b - 1
  } else {
    day = b
    month = a - 1
  }
  return new Date(year, month, day)
}

export function parseMMDDDate(str) {
  if (!str) return null
  const parts = str.split('-')
  if (parts.length !== 3) return null
  return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10))
}

export function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}-${dd}-${yyyy}`
}

export function mdmToISO(mdm) {
  const p = String(mdm).split('-')
  if (p.length !== 3) return ''
  return `${p[2]}-${p[0]}-${p[1]}`
}

export function isoToMdm(iso) {
  const p = String(iso).split('-')
  if (p.length !== 3) return ''
  return `${p[1]}-${p[2]}-${p[0]}`
}
