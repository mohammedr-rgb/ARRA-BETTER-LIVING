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
