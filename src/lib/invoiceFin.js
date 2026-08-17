import { parseCSV } from './utils'

export const FINANCE_SHEET_ID = '14riCGmsLkuomzSETNSITLulbWyl7hono2U4NMRowpdI'
export const SHEET_URLS = {
  zoho: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=361334241`,
  swiggyInvoice: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=549163658`,
  swiggyPayment: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=1209620263`,
  grn: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=408069390`,
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toISODate(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

export function parseNum(v) {
  if (v === null || v === undefined) return 0
  const s = String(v).replace(/INR/g, '').replace(/,/g, '').replace(/₹/g, '').trim()
  const n = parseFloat(s)
  return isFinite(n) ? n : 0
}

export function parseDate(v) {
  if (!v) return null
  let s = String(v).replace(/##/g, '').trim()
  if (!s) return null

  const mk = (y, m, d) => {
    const dt = new Date(y, m - 1, d)
    return dt
  }

  let m = null
  // %d-%m-%Y
  if ((m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/))) return mk(+m[3], +m[2], +m[1])
  // %m/%d/%Y
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return mk(+m[3], +m[1], +m[2])
  // %d %b, %Y
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3}),?\s+(\d{4})$/))) {
    const mo = MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase())
    if (mo >= 0) return mk(+m[3], mo + 1, +m[1])
  }
  // %d/%m/%Y
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return mk(+m[3], +m[2], +m[1])
  // %Y-%m-%d
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return mk(+m[1], +m[2], +m[3])
  // %d-%b-%Y
  if ((m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/))) {
    const mo = MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase())
    if (mo >= 0) return mk(+m[3], mo + 1, +m[1])
  }
  return null
}

export function normEntity(name) {
  const n = String(name || '').toUpperCase()
  if (!n) return null
  if (n.includes('CLOUDKART')) return 'CLOUDKART VENTURES'
  if (n.includes('JUPITER')) return 'JUPITER KART'
  if (n.includes('MOKSH')) return 'MOKSH ENTERPRISES'
  if (n.includes('CLOUDSTORE')) return 'CLOUDSTORE RETAIL'
  if (n.includes('PJTJ')) return 'PJTJ TECHNOLOGIES'
  return null
}

export function normInv(v) {
  const s = String(v || '').toUpperCase().replace(/\./g, '').replace(/ /g, '').trim()
  const m = s.match(/^(INV-?0*)(\d+)/)
  if (m) return `INV-${String(+m[2]).padStart(6, '0')}`
  return s
}

function daysBetween(a, b) {
  return Math.round((a - b) / 86400000)
}

export function computeFinance({ zohoRows, swiggyInvoiceRows, swiggyPaymentRows, grnRows, today }) {
  const TODAY = today || new Date()

  // ---- ZOHO MASTER ----
  const zoho = {}
  let voidCount = 0
  for (const r of zohoRows) {
    const num = String(r['Invoice Number'] || '').trim()
    if (!num) continue
    const status = String(r['Invoice Status'] || '').trim()
    if (status === 'Void') { voidCount++; continue }
    if (zoho[num]) continue
    zoho[num] = {
      cust: String(r['Customer Name'] || '').trim(),
      entity: normEntity(r['Customer Name']),
      status,
      total: parseNum(r['Total']),
      balance: parseNum(r['Balance']),
      due: parseDate(r['Due Date']),
      invDate: parseDate(r['Invoice Date']),
      lastPay: parseDate(r['Last Payment Date']),
      terms: String(r['Payment Terms'] || '').trim(),
    }
  }

  // ---- SWIGGY INVOICE REPORT ----
  const swReport = {}
  for (const r of swiggyInvoiceRows) {
    const ent = normEntity(r['Organization Name'])
    const inv = normInv(r['Invoice Number'])
    if (!ent || !inv) continue
    if (String(r['Invoice Number'] || '').toUpperCase().includes('REVERSED')) continue
    if (swReport[inv]) continue
    swReport[inv] = {
      entity: ent,
      netPay: parseNum(r['Net Payable Amount']),
      outstd: parseNum(r['Outstanding payment']),
      payStatus: String(r['Payment Status'] || '').trim(),
      due: parseDate(r['Due Date']),
      payAmt: parseNum(r['Payment amount']),
    }
  }

  // ---- PAYMENT REPORT ----
  const payments = {}
  for (const r of swiggyPaymentRows) {
    const ent = normEntity(r['Organization Name'])
    if (!ent) continue
    const amt = parseNum(r['Amount'])
    payments[ent] = payments[ent] || { count: 0, amount: 0 }
    payments[ent].count++
    payments[ent].amount += amt
  }

  // ---- GRN ----
  const grnFac = {}
  let grnTotal = 0, grnDn = 0
  for (const r of grnRows) {
    const grn = String(r['GrnNumber'] || '').trim()
    if (!grn) continue
    const amt = parseNum(r['TotalAmount'])
    const dn = parseNum(r['DNValue'])
    const fac = String(r['FacilityName'] || '').trim()
    grnTotal += amt
    grnDn += dn
    grnFac[fac] = (grnFac[fac] || 0) + amt
  }

  // ---- CLASSIFY (ZOHO MASTER + SWIGGY OVERLAY) ----
  const master = []
  for (const [num, z] of Object.entries(zoho)) {
    if (!z.entity) continue
    const sw = swReport[num]
    let paid = z.status === 'Closed' || z.status === 'Paid' || z.balance <= 0 || z.lastPay !== null
    if (sw && ['paid', 'no due'].includes(sw.payStatus.toLowerCase()) && sw.payAmt > 0) paid = true
    const due = z.due || (sw ? sw.due : null)
    let cls
    if (paid) cls = 'PAID'
    else if (!due) cls = 'PENDING_NO_DUE'
    else if (due < TODAY) cls = 'OVERDUE'
    else cls = 'NOT_DUE'
    master.push({
      num, entity: z.entity, cust: z.cust, status: z.status,
      total: z.total, balance: z.balance, due,
      invDate: z.invDate, lastPay: z.lastPay, terms: z.terms, cls,
      inSw: !!sw, swStatus: sw ? sw.payStatus : null, swOutstd: sw ? sw.outstd : null,
    })
  }

  const entities = {}
  const totals = { billed: 0, paid: 0, pending: 0, overdue: 0, notdue: 0 }
  const counts = { billed: 0, paid: 0, pending: 0, overdue: 0, notdue: 0 }
  const overdueAge = {}
  const notdueWin = {}
  const bucketKey = (d) => (d <= 15 ? '0-15' : d <= 30 ? '16-30' : d <= 60 ? '31-60' : '60+')
  const winKey = (d) => (d <= 7 ? '0-7' : d <= 15 ? '8-15' : d <= 30 ? '16-30' : '30+')

  for (const x of master) {
    const e = entities[x.entity] || (entities[x.entity] = {
      entity: x.entity, billed: 0, paid: 0, pending: 0, overdue: 0, notdue: 0,
      count: 0, paidC: 0, odC: 0, ndC: 0, inSw: 0,
    })
    e.billed += x.total
    e.count++
    totals.billed += x.total
    counts.billed++
    if (x.inSw) e.inSw++
    if (x.cls === 'PAID') {
      e.paid += x.total
      e.paidC++
      totals.paid += x.total
      counts.paid++
    } else {
      e.pending += x.total
      e.pendC = (e.pendC || 0) + 1
      totals.pending += x.total
      counts.pending++
      if (x.cls === 'OVERDUE') {
        e.overdue += x.total
        e.odC++
        totals.overdue += x.total
        counts.overdue++
        const d = daysBetween(TODAY, x.due)
        overdueAge[bucketKey(d)] = (overdueAge[bucketKey(d)] || 0) + x.total
      } else if (x.cls === 'NOT_DUE') {
        e.notdue += x.total
        e.ndC++
        totals.notdue += x.total
        counts.notdue++
        const d = daysBetween(x.due, TODAY)
        notdueWin[winKey(d)] = (notdueWin[winKey(d)] || 0) + x.total
      }
    }
  }

  // swiggy report confirmed totals
  let swBilled = 0, swOutstanding = 0
  for (const s of Object.values(swReport)) {
    swBilled += s.netPay
    if (s.outstd > 0) swOutstanding += s.outstd
  }

  const paymentTotal = Object.values(payments).reduce((s, p) => s + p.amount, 0)

  const overdueList = master.filter(x => x.cls === 'OVERDUE').sort((a, b) => b.total - a.total)
  const notDueList = master.filter(x => x.cls === 'NOT_DUE').sort((a, b) => (a.due || 0) - (b.due || 0))

  // paid-late (swiggy report paid after due date)
  const paidLate = []
  for (const [num, s] of Object.entries(swReport)) {
    if (['paid', 'no due'].includes(s.payStatus.toLowerCase()) && s.payAmt > 0 && s.due && s.due < TODAY) {
      paidLate.push({ inv: num, entity: s.entity, amt: s.netPay, due: s.due })
    }
  }
  paidLate.sort((a, b) => b.amt - a.amt)
  const paidLateValue = paidLate.reduce((s, p) => s + p.amt, 0)

  // swiggy-report paid per entity
  const swPaidSum = {}
  for (const s of Object.values(swReport)) {
    if (['paid', 'no due'].includes(s.payStatus.toLowerCase()) && s.payAmt > 0) {
      swPaidSum[s.entity] = (swPaidSum[s.entity] || 0) + s.netPay
    }
  }

  // Zoho paid but NOT confirmed in swiggy report
  const unconfirmedPaid = master
    .filter(x => x.cls === 'PAID' && !x.inSw)
    .sort((a, b) => b.total - a.total)

  // conflicts: zoho unpaid, swiggy says paid
  const conflicts = master
    .filter(x => x.cls === 'PAID' && x.swStatus && !['Paid', 'No due'].includes(x.swStatus) && !x.lastPay && x.balance > 0)
    .sort((a, b) => b.total - a.total)

  const entityList = Object.values(entities)
    .map(e => ({ ...e, coll: e.billed ? (e.paid / e.billed) * 100 : 0 }))
    .sort((a, b) => b.billed - a.billed)

  return {
    date: toISODate(TODAY),
    zohoCount: Object.keys(zoho).length,
    voidCount,
    swCount: Object.keys(swReport).length,
    masterCount: master.length,
    totals, counts,
    collectionPct: totals.billed ? (totals.paid / totals.billed) * 100 : 0,
    overdueAge, notdueWin,
    entities: entityList,
    paymentsByEntity: Object.entries(payments)
      .map(([entity, p]) => ({ entity, count: p.count, amount: p.amount }))
      .sort((a, b) => b.amount - a.amount),
    paymentTotal,
    swiggyReport: { billed: swBilled, outstanding: swOutstanding },
    grn: {
      total: grnTotal, dn: grnDn,
      facilities: Object.entries(grnFac).map(([facility, amount]) => ({ facility, amount })).sort((a, b) => b.amount - a.amount),
    },
    overdueList,
    notDueList,
    paidLate, paidLateCount: paidLate.length, paidLateValue,
    swPaidSum,
    unconfirmedPaid,
    conflicts,
  }
}

export async function fetchFinanceSheets() {
  const fetchCsv = async (url, label) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`)
    return parseCSV(await res.text())
  }
  const [zohoRows, swiggyInvoiceRows, swiggyPaymentRows, grnRows] = await Promise.all([
    fetchCsv(SHEET_URLS.zoho, 'Zoho invoices'),
    fetchCsv(SHEET_URLS.swiggyInvoice, 'Swiggy invoice report'),
    fetchCsv(SHEET_URLS.swiggyPayment, 'Swiggy payment report'),
    fetchCsv(SHEET_URLS.grn, 'GRN details'),
  ])
  return computeFinance({ zohoRows, swiggyInvoiceRows, swiggyPaymentRows, grnRows })
}

export const inr = (v) => '₹' + Math.round(v || 0).toLocaleString('en-IN')