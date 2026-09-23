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

export function parseDate(str) {
  if (!str) return null
  const parts = str.split('-')
  if (parts.length !== 3) return null
  const month = parseInt(parts[0], 10) - 1
  const day = parseInt(parts[1], 10)
  const year = parseInt(parts[2], 10)
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
