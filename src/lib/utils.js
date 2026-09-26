export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const statusFilters = ['All', 'Active', 'Delivered', 'RTO']

import * as XLSX from 'xlsx'

export function num(val) {
  const cleaned = String(val).replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

export const toNumKG = num

export function parseCSV(text) {
  const s = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const records = []
  let row = []
  let field = ''
  let inQuotes = false
  const pushField = () => { row.push(field.trim()); field = '' }
  const pushRow = () => { if (row.some(v => v !== '')) records.push(row); row = [] }
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') pushField()
      else if (ch === '\n') { pushField(); pushRow() }
      else field += ch
    }
  }
  pushField()
  if (row.length) pushRow()
  if (records.length < 2) return []
  const headers = records[0].map(h => h.replace(/\s*\n\s*/g, ' '))
  return records.slice(1)
    .filter(vals => vals.length >= headers.length)
    .map(vals => {
      const r = {}
      headers.forEach((h, idx) => { r[h] = vals[idx] ? vals[idx].replace(/^#REF!$/, '') : '' })
      return r
    })
}

export function csvEscape(v) {
  const s = String(v ?? '')
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvNum(v) {
  const s = String(v ?? '').trim()
  if (!s || s === '—' || s === '-') return ''
  const n = parseFloat(s.replace(/[^0-9.-]/g, ''))
  return isFinite(n) ? String(n) : ''
}

export function downloadCSV(rows, filename) {
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadXLSX(aoa, filename, sheetName = 'Sheet1') {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName)
  XLSX.writeFile(wb, filename)
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
export const PURCHASE_GST_RATE = 0.05

function getFieldCI(row, candidates) {
  if (!row) return ''
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') return row[c]
  }
  const keys = Object.keys(row || {})
  const normMap = {}
  for (const k of keys) {
    const norm = String(k).toLowerCase().replace(/\s+/g, ' ').replace(/[()_-]/g, '').trim()
    normMap[norm] = k
  }
  for (const c of candidates) {
    const normC = String(c).toLowerCase().replace(/\s+/g, ' ').replace(/[()_-]/g, '').trim()
    const matchKey = normMap[normC]
    if (matchKey && row[matchKey] !== undefined && row[matchKey] !== null && String(row[matchKey]).trim() !== '') {
      return row[matchKey]
    }
  }
  for (const c of candidates) {
    const normC = String(c).toLowerCase().replace(/\s+/g, ' ').replace(/[()_-]/g, '').trim()
    for (const k of keys) {
      const normK = String(k).toLowerCase().replace(/\s+/g, ' ').replace(/[()_-]/g, '').trim()
      if (normK.includes(normC) || normC.includes(normK)) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
          return row[k]
        }
      }
    }
  }
  return ''
}

export function getPurchaseDate(row) {
  return getFieldCI(row, [
    'Purchase Date(MM-DD-YYYY)',
    'Purchase Date(MM-DD-YYYY',
    'Purchase Date (MM-DD-YYYY)',
    'Purchase Date',
    'Purchase_Date'
  ]) || ''
}

export function getPurchaseEntity(row) {
  return getFieldCI(row, [
    'Purchase Entity',
    'Purchase entity',
    'Purchase Vendor',
    'Entity'
  ]) || ''
}

export function getPurchaseInvoiceNo(row) {
  return getFieldCI(row, [
    'Purchase Invoice Number',
    'Purchase Invoice No',
    'Purchase Inv No',
    'Purchase Inv Number',
    'PURCHASE INV NO',
    'Purchase Invoice'
  ]) || ''
}

export function getPurchaseProduct(row) {
  return getFieldCI(row, [
    'Purchase Products',
    'Purchase Product',
    'Purchase Item',
    'Purchase Description'
  ]) || ''
}

export function getPurchaseCost(row) {
  return num(getFieldCI(row, [
    'Purchase Cost',
    'Purchase cost',
    'Purchase Rate',
    'Purchase Price'
  ]))
}

export function getPurchaseTonnage(row) {
  return num(getFieldCI(row, [
    'Purchase Tonnage',
    'Purchase tonnage',
    'Purchase Tonnage(KG)',
    'Purchase Tonnage (KG)'
  ]))
}

export function getPurchaseQty(row) {
  return num(getFieldCI(row, [
    'Purchase  QTY',
    'Purchase QTY',
    'Purchase Qty',
    'Purchase qty',
    'Purchase Quantity',
    'Purchase quantity'
  ]))
}

export function getPurchaseBox(row) {
  return num(getFieldCI(row, [
    'Purchase Box',
    'Purchase box',
    'Purchase Boxes',
    'Purchase Box Count'
  ]))
}

export function getPurchaseValue(row) {
  const direct = num(getFieldCI(row, [
    'Purchase  Values',
    'Purchase Values',
    'Purchase Value',
    'Purchase  Value',
    'Purchase Amount'
  ]))
  if (direct > 0) return direct
  const cost = getPurchaseCost(row)
  const qty = getPurchaseQty(row)
  if (cost > 0 && qty > 0) return cost * qty
  return 0
}

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
  const dateKey = list.find(k => {
    const l = String(k).toLowerCase()
    return l.includes('purchase') && l.includes('date')
  }) || null
  return { costKey, qtyKey, valueKey, dateKey, allKeys: list }
}

export function detectBDateColumn(rows) {
  const keyOrder = []
  const seen = new Set()
  ;(rows || []).forEach(r => Object.keys(r || {}).forEach(k => { if (!seen.has(k)) { seen.add(k); keyOrder.push(k) } }))
  const parseRate = (k) => {
    let ok = 0, total = 0
    for (const r of (rows || [])) {
      const v = r[k]
      if (v === undefined || v === null || String(v).trim() === '') continue
      total++
      if (parseMMDDDate(String(v).trim())) ok++
    }
    return total ? ok / total : 0
  }
  const bKey = keyOrder.length > 1 ? keyOrder[1] : null
  if (bKey && parseRate(bKey) >= 0.3) return { bKey }
  const dateKeys = keyOrder.filter(k => String(k).toLowerCase().includes('date'))
    .map(k => ({ k, rate: parseRate(k) }))
    .filter(x => x.rate > 0)
    .sort((a, b) => b.rate - a.rate)
  if (dateKeys.length) return { bKey: dateKeys[0].k }
  return { bKey: null }
}

export function bDateOf(row, bKey) {
  if (bKey && row[bKey] !== undefined && row[bKey] !== null && String(row[bKey]).trim() !== '') return row[bKey]
  return purchaseDateOf(row)
}

export function purchaseDateOf(row) {
  return getPurchaseDate(row)
}

export function purchaseCostOf(row) {
  return getPurchaseCost(row)
}

export function purchaseQtyOf(row) {
  return getPurchaseQty(row)
}

export function purchaseLineValue(row) {
  return getPurchaseValue(row)
}

export function sumPurchaseBase(arr) {
  return (arr || []).reduce((s, r) => s + getPurchaseValue(r), 0)
}

export function sumPurchaseWithGST(arr, rate = PURCHASE_GST_RATE) {
  return sumPurchaseBase(arr) * (1 + rate)
}

export function sumPurchaseUnique(arr) {
  return (arr || []).reduce((s, r) => s + getPurchaseValue(r), 0)
}

export function purchaseStats(arr, rate = PURCHASE_GST_RATE) {
  const rows = arr || []
  let populated = 0
  let blank = 0
  let base = 0
  for (const r of rows) {
    const v = getPurchaseValue(r)
    base += v
    if (v > 0) populated++
    else blank++
  }
  return { lines: rows.length, populated, blank, base, withGST: base * (1 + rate), gstRate: rate }
}

export function parseDate(str) {
  if (!str) return null
  const parts = String(str).trim().replace(/\//g, '-').split('-')
  if (parts.length === 3) {
    if (parts[0].length === 4) return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
    if (parts[2].length === 4) return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10))
  }
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

export function parseMMDDDate(str) {
  if (!str) return null
  const cleaned = String(str).trim()
  if (!cleaned) return null
  const parts = cleaned.replace(/\//g, '-').split('-')
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10) - 1
      const d = parseInt(parts[2], 10)
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d)
    }
    if (parts[2].length === 4) {
      const y = parseInt(parts[2], 10)
      const p0 = parseInt(parts[0], 10)
      const p1 = parseInt(parts[1], 10)
      if (p0 > 12) {
        return new Date(y, p1 - 1, p0)
      }
      return new Date(y, p0 - 1, p1)
    }
  }
  const d = new Date(cleaned)
  return isNaN(d.getTime()) ? null : d
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

export function loadCSVFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result
        resolve(parseCSV(text))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
