import { parseCSV } from './utils'

export const FINANCE_SHEET_ID = '14riCGmsLkuomzSETNSITLulbWyl7hono2U4NMRowpdI'
export const SHEET_URLS = {
  zohoMaster: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=361334241`,
  swiggyInvoice: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=549163658`,
  swiggyPayment: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=1209620263`,
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

export function parseDate(v, dmyFirst = false) {
  if (!v) return null
  let s = String(v).replace(/##/g, '').trim()
  if (!s) return null

  const mk = (y, m, d) => {
    const dt = new Date(y, m - 1, d)
    return dt
  }

  let m = null
  if (dmyFirst) {
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return mk(+m[3], +m[2], +m[1])
  }
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
  if (n.includes('BLINK')) return 'BLINK COMMERCE'
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

export function computeFinance({ swiggyInvoiceRows, swiggyPaymentRows, today, overrides = {} }) {
  const TODAY = today || new Date()

  // ---- SWIGGY INVOICE REPORT (master) ----
  const swReport = {}
  for (const r of swiggyInvoiceRows || []) {
    const ent = normEntity(r['Organization Name'])
    const inv = normInv(r['Invoice Number'])
    if (!ent || !inv) continue
    if (String(r['Invoice Number'] || '').toUpperCase().includes('REVERSED')) continue
    if (swReport[inv]) continue
    const purchaseReturn = parseNum(r['Purchase Return Amount'])
    const otherDebit = parseNum(r['Other Debit Amount'])
    const brandDiscount = parseNum(r['Brand discount (Promo Claims)'])
    const otherAdj = parseNum(r['Other adjustments *'])
    const tds = parseNum(r['TDS/TCS'])
    swReport[inv] = {
      entity: ent,
      gross: parseNum(r['Gross GRN Amount']),
      netPay: parseNum(r['Net Payable Amount']),
      tds,
      purchaseReturn,
      otherDebit,
      brandDiscount,
      otherAdj,
      deductions: tds + purchaseReturn + otherDebit + brandDiscount + otherAdj,
      payStatus: String(r['Payment Status'] || '').trim() || 'Unpaid',
      payAmt: parseNum(r['Payment amount']),
      payRef: String(r['Payment Reference No'] || '').trim(),
      outstd: parseNum(r['Outstanding payment']),
      invDate: parseDate(r['Invoice Accounting Date'], true),
      due: parseDate(r['Due Date'], true),
      lastPay: parseDate(r['Last Payment Date'], true),
      creditPeriod: String(r['Credit Period'] || '').trim(),
      poNo: String(r['PO No.'] || '').trim(),
      swGrnNo: String(r['GRN No.'] || '').trim(),
      statusOfInvoice: String(r['Status of Invoice'] || '').trim(),
    }
  }

  // ---- SWIGGY PAYMENT STATEMENT ----
  const payments = {}
  const payRows = []
  for (const r of swiggyPaymentRows || []) {
    const ent = normEntity(r['Organization Name'])
    if (!ent) continue
    const amt = parseNum(r['Amount'])
    if (amt <= 0) continue
    payments[ent] = payments[ent] || { count: 0, amount: 0 }
    payments[ent].count++
    payments[ent].amount += amt
    payRows.push({
      d: parseDate(r['Payment Date'], true),
      amt,
      ref: String(r['Payment reference no.'] || '').trim(),
      num: String(r['Payment Number'] || '').trim(),
      entity: ent,
    })
  }

  // ---- MASTER ----
  const master = []
  for (const [num, s] of Object.entries(swReport)) {
    let cls
    if (s.outstd <= 0) cls = 'PAID'
    else if (!s.due) cls = 'PENDING_NO_DUE'
    else if (s.due < TODAY) cls = 'OVERDUE'
    else cls = 'NOT_DUE'
    const partialPaid = /partially/i.test(s.payStatus) && s.payAmt > 0
    master.push({
      num, entity: s.entity, total: s.netPay, gross: s.gross,
      tds: s.tds, purchaseReturn: s.purchaseReturn, otherDebit: s.otherDebit,
      brandDiscount: s.brandDiscount, otherAdj: s.otherAdj,
      deductions: s.deductions,
      payStatus: s.payStatus, payAmt: s.payAmt, payRef: s.payRef, outstd: s.outstd,
      invDate: s.invDate, due: s.due, lastPay: s.lastPay, creditPeriod: s.creditPeriod,
      poNo: s.poNo, swGrnNo: s.swGrnNo, statusOfInvoice: s.statusOfInvoice,
      cls, partialPaid, inSw: true, swOutstd: s.outstd, dueSheet: s.due, status: s.payStatus,
    })
  }

  // ---- OVERRIDES (team working remarks & adjustments from uploaded file) ----
  const sheetTotals = { paid: 0, pending: 0, overdue: 0, notdue: 0, cancelled: 0 }
  let totalAdjustment = 0
  let overriddenCount = 0
  let cancelledCount = 0
  let cancelledTotal = 0
  for (const x of master) {
    const ov = overrides[x.num]
    let adj = 0
    let remark = null
    let note = null
    if (ov) {
      adj = Math.max(0, parseNum(ov.adjustment))
      remark = ov.remark || null
      note = ov.note || null
    }
    x.adjustment = adj
    x.remark = remark
    x.note = note
    x.net = Math.max(0, x.total - adj)
    x.chaseAmt = x.cls === 'PAID' ? 0 : Math.max(0, Math.min(x.net, x.outstd))
    x.hasOverride = !!(ov && (adj > 0 || remark || note))
    totalAdjustment += x.adjustment
    if (x.hasOverride) overriddenCount++
    x.cancelled = /cancel/i.test(String(remark || '') + ' ' + String(note || ''))
    if (x.cancelled) {
      x.cls = 'CANCELLED'
      cancelledCount++
      cancelledTotal += x.total
      sheetTotals.cancelled += x.total
      continue
    }
    if (x.cls === 'PAID') sheetTotals.paid += x.total
    else if (x.cls === 'OVERDUE') sheetTotals.overdue += x.total
    else if (x.cls === 'NOT_DUE') sheetTotals.notdue += x.total
    else sheetTotals.pending += x.total
  }

  const entities = {}
  const totals = { billed: 0, paid: 0, pending: 0, overdue: 0, notdue: 0, cancelled: 0 }
  const counts = { billed: 0, paid: 0, pending: 0, overdue: 0, notdue: 0, cancelled: 0 }
  const overdueAge = {}
  const notdueWin = {}
  const overdueAgeCount = {}
  const notdueWinCount = {}
  let pendingNoDue = 0
  let pendingNoDueCount = 0
  const bucketKey = (d) => (d <= 15 ? '0-15' : d <= 30 ? '16-30' : d <= 60 ? '31-60' : '60+')
  const winKey = (d) => (d <= 7 ? '0-7' : d <= 15 ? '8-15' : d <= 30 ? '16-30' : '30+')

  for (const x of master) {
    if (x.cancelled) {
      totals.cancelled += x.total
      counts.cancelled++
      continue
    }
    const e = entities[x.entity] || (entities[x.entity] = {
      entity: x.entity, billed: 0, paid: 0, pending: 0, overdue: 0, notdue: 0,
      count: 0, paidC: 0, odC: 0, ndC: 0, inSw: 0,
    })
    e.billed += x.total
    e.count++
    totals.billed += x.total
    counts.billed++
    e.inSw++
    if (x.cls === 'PAID') {
      e.paid += x.payAmt
      e.paidC++
      totals.paid += x.payAmt
      counts.paid++
    } else {
      if (x.payAmt > 0) {
        e.paid += x.payAmt
        totals.paid += x.payAmt
      }
      e.pending += x.chaseAmt
      e.pendC = (e.pendC || 0) + 1
      totals.pending += x.chaseAmt
      counts.pending++
      if (x.cls === 'OVERDUE') {
        e.overdue += x.chaseAmt
        e.odC++
        totals.overdue += x.chaseAmt
        counts.overdue++
        const d = daysBetween(TODAY, x.due)
        overdueAge[bucketKey(d)] = (overdueAge[bucketKey(d)] || 0) + x.chaseAmt
        overdueAgeCount[bucketKey(d)] = (overdueAgeCount[bucketKey(d)] || 0) + 1
      } else if (x.cls === 'NOT_DUE') {
        e.notdue += x.chaseAmt
        e.ndC++
        totals.notdue += x.chaseAmt
        counts.notdue++
        const d = daysBetween(x.due, TODAY)
        notdueWin[winKey(d)] = (notdueWin[winKey(d)] || 0) + x.chaseAmt
        notdueWinCount[winKey(d)] = (notdueWinCount[winKey(d)] || 0) + 1
      } else if (x.cls === 'PENDING_NO_DUE') {
        pendingNoDue += x.chaseAmt
        pendingNoDueCount++
      }
    }
  }

  const paymentTotal = Object.values(payments).reduce((s, p) => s + p.amount, 0)
  const confirmedPaid = master.filter(x => !x.cancelled && x.payAmt > 0).reduce((s, x) => s + x.payAmt, 0)

  const overdueList = master.filter(x => x.cls === 'OVERDUE').sort((a, b) => b.chaseAmt - a.chaseAmt)
  const notDueList = master.filter(x => x.cls === 'NOT_DUE').sort((a, b) => (a.due || 0) - (b.due || 0))
  const leftoverPendingList = master.filter(x => x.cls !== 'PAID' && x.cls !== 'CANCELLED').sort((a, b) => b.chaseAmt - a.chaseAmt)

  const cancelledNums = new Set(master.filter(x => x.cancelled).map(x => x.num))

  const paidLate = []
  for (const [num, s] of Object.entries(swReport)) {
    if (cancelledNums.has(num)) continue
    if (/paid/i.test(s.payStatus) && !/partially/i.test(s.payStatus) && s.payAmt > 0 && s.due && s.due < TODAY) {
      paidLate.push({ inv: num, entity: s.entity, amt: s.netPay, due: s.due })
    }
  }
  paidLate.sort((a, b) => b.amt - a.amt)
  const paidLateValue = paidLate.reduce((s, p) => s + p.amt, 0)

  const swPaidSum = {}
  for (const [num, s] of Object.entries(swReport)) {
    if (cancelledNums.has(num)) continue
    if (/paid/i.test(s.payStatus) && s.payAmt > 0) {
      swPaidSum[s.entity] = (swPaidSum[s.entity] || 0) + s.payAmt
    }
  }

  const entityList = Object.values(entities)
    .map(e => ({ ...e, coll: e.billed ? (e.paid / e.billed) * 100 : 0 }))
    .sort((a, b) => b.billed - a.billed)

  return {
    overrides: { totalAdjustment, overriddenCount, sheetTotals, cancelledCount, cancelledTotal },
    invoices: master,
    date: toISODate(TODAY),
    swCount: Object.keys(swReport).length,
    masterCount: master.length,
    totals, counts,
    collectionPct: totals.billed ? (paymentTotal / totals.billed) * 100 : 0,
    overdueAge, notdueWin, overdueAgeCount, notdueWinCount,
    pendingNoDue, pendingNoDueCount,
    entities: entityList,
    paymentsByEntity: Object.entries(payments)
      .map(([entity, p]) => ({ entity, count: p.count, amount: p.amount }))
      .sort((a, b) => b.amount - a.amount),
    paymentTotal,
    paymentCount: payRows.length,
    payments: payRows,
    confirmedPaid,
    reconDiff: Math.abs(paymentTotal - confirmedPaid),
    swiggyReport: {
      billed: Object.values(swReport).reduce((s, x) => s + x.netPay, 0),
      outstanding: Object.values(swReport).reduce((s, x) => s + Math.max(0, x.outstd), 0),
    },
    deductionsTotal: master.reduce((s, x) => s + (x.deductions || 0), 0),
    leftoverPendingList,
    overdueList,
    notDueList,
    paidLate, paidLateCount: paidLate.length, paidLateValue,
    swPaidSum,
  }
}

export function computeZohoAnalysis({ zohoRows, swiggyInvoiceRows, swiggyPaymentRows, today }) {
  const TODAY = today || new Date()

  const swReport = new Map()
  for (const r of swiggyInvoiceRows || []) {
    const inv = normInv(r['Invoice Number'])
    if (!inv || String(r['Invoice Number'] || '').toUpperCase().includes('REVERSED')) continue
    if (swReport.has(inv)) continue
    swReport.set(inv, {
      grnNo: String(r['GRN No.'] || '').trim(),
      grnDate: parseDate(r['GRN Date'], true),
      netPay: parseNum(r['Net Payable Amount']),
      payAmt: parseNum(r['Payment amount']),
      payRef: String(r['Payment Reference No'] || '').trim(),
      outstd: parseNum(r['Outstanding payment']),
      due: parseDate(r['Due Date'], true),
      overdueLabel: String(r['Overdue'] || '').trim(),
      payStatus: String(r['Payment Status'] || '').trim(),
      lastPay: parseDate(r['Last Payment Date'], true),
    })
  }

  const byInv = new Map()
  for (const r of zohoRows || []) {
    const id = String(r['Invoice ID'] || r['Invoice Number'] || '').trim()
    if (!id) continue
    const num = normInv(r['Invoice Number'])
    if (!num) continue
    const e = byInv.get(id) || {
      id, num, entity: normEntity(r['Customer Name']),
      invDate: parseDate(r['Invoice Date'], true), issuedDate: parseDate(r['Issued Date'], true),
      zohoStatus: String(r['Invoice Status'] || '').trim(),
      po: String(r['PurchaseOrder'] || '').trim(),
      total: 0, balance: 0, subTotal: 0,
      remarks: '', grnNo: '', grnDate: null, purchaseReturn: 0, brandDiscount: 0, otherDebit: 0, otherAdj: 0,
      netPay: 0, payAmt: 0, payRef: '', outstd: 0, due: null, overdueLabel: '', payStatus: '', lastPay: null, appt: null,
    }
    e.total = Math.max(e.total, parseNum(r['Total']))
    e.balance = Math.max(e.balance, parseNum(r['Balance']))
    e.subTotal = Math.max(e.subTotal, parseNum(r['SubTotal']))
    e.remarks = e.remarks || String(r['Remarks'] || '').trim()
    e.grnNo = e.grnNo || String(r['GRN No.'] || '').trim()
    e.grnDate = e.grnDate || parseDate(r['GRN Date'], true)
    e.purchaseReturn = Math.max(e.purchaseReturn, parseNum(r['Purchase Return Amount']))
    e.brandDiscount = Math.max(e.brandDiscount, parseNum(r['Brand discount (Promo Claims)']))
    e.otherDebit = Math.max(e.otherDebit, parseNum(r['Other Debit Amount']))
    e.otherAdj = Math.max(e.otherAdj, parseNum(r['Other adjustments *']))
    e.netPay = Math.max(e.netPay, parseNum(r['Net Payable Amount']))
    e.payAmt = Math.max(e.payAmt, parseNum(r['Payment amount']))
    e.payRef = e.payRef || String(r['Payment Reference No'] || '').trim()
    e.outstd = Math.max(e.outstd, parseNum(r['Outstanding payment']))
    e.due = e.due || parseDate(r['Due Date'], true)
    e.overdueLabel = e.overdueLabel || String(r['Overdue'] || '').trim()
    e.payStatus = e.payStatus || String(r['Payment Status'] || '').trim()
    e.lastPay = e.lastPay || parseDate(r['Last Payment Date'], true)
    e.appt = e.appt || parseDate(r['Appointment Date'], true)
    byInv.set(id, e)
  }

  const invoices = [...byInv.values()]

  for (const x of invoices) {
    const rep = swReport.get(x.num)
    if (rep) {
      x.mapped = true
      x.grnNo = rep.grnNo || x.grnNo
      x.grnDate = rep.grnDate || x.grnDate
      x.netPay = rep.netPay
      x.payAmt = rep.payAmt
      x.payRef = rep.payRef || x.payRef
      x.outstd = rep.outstd
      x.due = rep.due
      x.overdueLabel = rep.overdueLabel || x.overdueLabel
      x.payStatus = rep.payStatus || x.payStatus
      x.lastPay = rep.lastPay || x.lastPay
    }
    x.flagged = !!x.remarks
    x.awaitingGrn = !x.grnNo
    let cls
    if (!x.mapped) cls = 'NO_GRN'
    else if (x.outstd <= 0) cls = 'PAID'
    else if (!x.due) cls = 'PENDING_NO_DUE'
    else if (x.due < TODAY) cls = 'OVERDUE'
    else cls = 'NOT_DUE'
    x.cls = cls
    x.daysPastDue = cls === 'OVERDUE' ? Math.round((TODAY - x.due) / 86400000) : 0
  }

  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0)

  const nonRemarks = invoices.filter(x => !x.flagged)
  const flagged = invoices.filter(x => x.flagged)
  const mapped = invoices.filter(x => x.mapped)
  const awaitingGrn = invoices.filter(x => x.awaitingGrn)
  const awaitingGrnNonRemarks = awaitingGrn.filter(x => !x.flagged)
  const paidList = mapped.filter(x => x.cls === 'PAID')
  const overdueList = mapped.filter(x => x.cls === 'OVERDUE').sort((a, b) => b.outstd - a.outstd)
  const notDueList = mapped.filter(x => x.cls === 'NOT_DUE').sort((a, b) => (a.due || 0) - (b.due || 0))
  const pendingNoDueList = mapped.filter(x => x.cls === 'PENDING_NO_DUE')
  const flaggedList = flagged.slice().sort((a, b) => b.total - a.total)
  const awaitingGrnList = awaitingGrn.slice().sort((a, b) => b.total - a.total)

  const bucketKey = (d) => (d <= 15 ? '0-15' : d <= 30 ? '16-30' : d <= 60 ? '31-60' : '60+')
  const overdueAge = {}
  const overdueAgeCount = {}
  for (const x of overdueList) {
    const k = bucketKey(x.daysPastDue)
    overdueAge[k] = (overdueAge[k] || 0) + x.outstd
    overdueAgeCount[k] = (overdueAgeCount[k] || 0) + 1
  }

  const winKey = (d) => (d <= 7 ? '0-7' : d <= 15 ? '8-15' : d <= 30 ? '16-30' : '30+')
  const notdueWin = {}
  const notdueWinCount = {}
  for (const x of notDueList) {
    const k = winKey(Math.max(0, Math.round((x.due - TODAY) / 86400000)))
    notdueWin[k] = (notdueWin[k] || 0) + x.outstd
    notdueWinCount[k] = (notdueWinCount[k] || 0) + 1
  }

  let statementTotal = 0
  let statementCount = 0
  const stByEntity = {}
  for (const r of swiggyPaymentRows || []) {
    const ent = normEntity(r['Organization Name'])
    if (!ent) continue
    const amt = parseNum(r['Amount'])
    if (amt <= 0) continue
    statementTotal += amt
    statementCount++
    stByEntity[ent] = (stByEntity[ent] || 0) + amt
  }

  const mappedPaid = sum(mapped, x => x.payAmt)
  const flaggedMappedAmount = sum(mapped.filter(x => x.flagged), x => x.netPay)
  const netBilled = sum(nonRemarks, x => x.total) - sum(mapped.filter(x => !x.flagged), x => x.purchaseReturn + x.brandDiscount + x.otherDebit + x.otherAdj)

  const entities = {}
  for (const x of invoices) {
    const e = entities[x.entity] || (entities[x.entity] = {
      entity: x.entity, invoices: 0, billed: 0, balance: 0, flagged: 0, flaggedTotal: 0,
      awaitingGrn: 0, awaitingGrnTotal: 0, mapped: 0, netPay: 0, paid: 0, outstd: 0,
    })
    e.invoices++
    if (!x.flagged) {
      e.billed += x.total
      e.balance += x.balance
    } else {
      e.flagged++
      e.flaggedTotal += x.total
    }
    if (x.awaitingGrn) {
      e.awaitingGrn++
      e.awaitingGrnTotal += x.total
    }
    if (x.mapped) {
      e.mapped++
      e.netPay += x.netPay
      e.paid += x.payAmt
      e.outstd += x.outstd
    }
  }
  const entityList = Object.values(entities)
    .map(e => ({ ...e, statementPaid: stByEntity[e.entity] || 0 }))
    .sort((a, b) => b.billed - a.billed)

  const zohoStatus = {}
  for (const x of invoices) zohoStatus[x.zohoStatus || '(blank)'] = (zohoStatus[x.zohoStatus || '(blank)'] || 0) + 1

  return {
    date: toISODate(TODAY),
    invoices,
    all: { count: invoices.length, total: sum(invoices, x => x.total) },
    nonRemarks: {
      count: nonRemarks.length,
      total: sum(nonRemarks, x => x.total),
      balance: sum(nonRemarks, x => x.balance),
    },
    flagged: {
      count: flagged.length,
      total: sum(flagged, x => x.total),
      byRemark: flagged.reduce((m, x) => { m[x.remarks] = (m[x.remarks] || 0) + 1; return m }, {}),
    },
    mapped: {
      count: mapped.length,
      netPay: sum(mapped, x => x.netPay),
      paid: mappedPaid,
      outstd: sum(mapped, x => x.outstd),
    },
    netBilled,
    bridge: {
      awaitingGrnAmount: awaitingGrnNonRemarks.reduce((s, x) => s + x.total, 0),
      flaggedMappedAmount,
    },
    awaitingGrn: {
      count: awaitingGrn.length,
      total: sum(awaitingGrn, x => x.total),
      balance: sum(awaitingGrn, x => x.balance),
      nonRemarksCount: awaitingGrnNonRemarks.length,
      nonRemarksTotal: sum(awaitingGrnNonRemarks, x => x.total),
      nonRemarksBalance: sum(awaitingGrnNonRemarks, x => x.balance),
    },
    overdue: { count: overdueList.length, amount: sum(overdueList, x => x.outstd) },
    overdueAge, overdueAgeCount, notdueWin, notdueWinCount,
    notDue: { count: notDueList.length, amount: sum(notDueList, x => x.outstd) },
    pendingNoDue: { count: pendingNoDueList.length, amount: sum(pendingNoDueList, x => x.outstd) },
    paid: { count: paidList.length, amount: sum(paidList, x => x.payAmt) },
    deductions: {
      purchaseReturn: sum(mapped, x => x.purchaseReturn),
      brandDiscount: sum(mapped, x => x.brandDiscount),
      otherDebit: sum(mapped, x => x.otherDebit),
      otherAdj: sum(mapped, x => x.otherAdj),
      total: sum(mapped, x => x.purchaseReturn + x.brandDiscount + x.otherDebit + x.otherAdj),
    },
    statement: {
      total: statementTotal,
      count: statementCount,
      byEntity: stByEntity,
      mappedPaid,
      diff: Math.abs(statementTotal - mappedPaid),
    },
    entities: entityList,
    zohoStatus,
    lists: { paidList, overdueList, notDueList, pendingNoDueList, awaitingGrnList, flaggedList },
  }
}

export async function fetchFinanceRows() {
  const fetchCsv = async (url, label) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`)
    return parseCSV(await res.text())
  }
  const [zohoMasterRows, swiggyInvoiceRows, swiggyPaymentRows] = await Promise.all([
    fetchCsv(SHEET_URLS.zohoMaster, 'Zoho invoice details'),
    fetchCsv(SHEET_URLS.swiggyInvoice, 'Swiggy invoice report'),
    fetchCsv(SHEET_URLS.swiggyPayment, 'Swiggy payment statement'),
  ])
  return { zohoMasterRows, swiggyInvoiceRows, swiggyPaymentRows }
}

export async function fetchFinanceSheets(overrides) {
  const rows = await fetchFinanceRows()
  return computeFinance({ ...rows, overrides })
}

export const inr = (v) => '₹' + Math.round(v || 0).toLocaleString('en-IN')

const MASTER_FIN_COLS = {
  invoiced: 'Invoices recorded',
  tds: 'TDS/TCS',
  purchaseReturn: 'Purchase Return Amount',
  brandDiscount: 'Brand discount (Promo Claims)',
  otherDebit: 'Other Debit Amount',
  otherAdj: 'Other adjustments *',
  netPayable: 'Net Payable Amount',
  paid: 'Payment amount',
  payRef: 'Payment Reference No',
  outstanding: 'Outstanding payment',
  dueDate: 'Due Date',
  payStatus: 'Payment Status',
  lastPay: 'Last Payment Date',
}

export function computeMasterFinance({ poData, today = new Date() }) {
  const t = today instanceof Date ? today : new Date(today)
  const rows = (poData || []).filter(r => {
    const b = (r[MASTER_FIN_COLS.invoiced] || '').toString().trim()
    return b !== '' && parseNum(b) > 0
  })
  let billed = 0, netPayable = 0, paid = 0, outstanding = 0
  let pr = 0, brand = 0, otherDebit = 0, otherAdj = 0, tds = 0
  const invoices = []
  const entityMap = {}
  let overdueCount = 0, overdueAmount = 0, notDueCount = 0, notDueAmount = 0, paidCount = 0
  const overdueAge = { '0-10': 0, '11-20': 0, '21-30': 0, '30+': 0 }
  const overdueAgeCount = { '0-10': 0, '11-20': 0, '21-30': 0, '30+': 0 }
  const notdueWin = { '0-10': 0, '11-20': 0, '21-30': 0, '30+': 0 }
  const notdueWinCount = { '0-10': 0, '11-20': 0, '21-30': 0, '30+': 0 }

  for (const r of rows) {
    const ent = normEntity(r['Entity'] || 'Unknown')
    const b = parseNum(r[MASTER_FIN_COLS.invoiced])
    const np = parseNum(r[MASTER_FIN_COLS.netPayable])
    const pa = parseNum(r[MASTER_FIN_COLS.paid])
    const os = parseNum(r[MASTER_FIN_COLS.outstanding])
    const dpr = parseNum(r[MASTER_FIN_COLS.purchaseReturn])
    const bd = parseNum(r[MASTER_FIN_COLS.brandDiscount])
    const od = parseNum(r[MASTER_FIN_COLS.otherDebit])
    const oa = parseNum(r[MASTER_FIN_COLS.otherAdj])
    const tt = parseNum(r[MASTER_FIN_COLS.tds])
    const due = parseDate(r[MASTER_FIN_COLS.dueDate])
    const lastPay = parseDate(r[MASTER_FIN_COLS.lastPay])
    const ps = (r[MASTER_FIN_COLS.payStatus] || '').trim()
    const lowPs = ps.toLowerCase()
    const isPaid = pa > 0 || lowPs === 'paid' || lowPs === 'partially paid' || lowPs.startsWith('paid')
    const daysPastDue = (due && !isNaN(due)) ? Math.round((t - due) / 86400000) : null
    const daysToDue = (due && !isNaN(due)) ? Math.round((due - t) / 86400000) : null

    billed += b; netPayable += np; paid += pa; outstanding += os
    pr += dpr; brand += bd; otherDebit += od; otherAdj += oa; tds += tt

    let cls = 'PAID'
    if (!isPaid && os > 0.01) {
      cls = (due && !isNaN(due) && due < t) ? 'OVERDUE' : 'NOT_DUE'
    }

    if (cls === 'OVERDUE') {
      overdueCount++; overdueAmount += os
      const age = daysPastDue == null ? '30+' : (daysPastDue <= 10 ? '0-10' : daysPastDue <= 20 ? '11-20' : daysPastDue <= 30 ? '21-30' : '30+')
      overdueAge[age] += os; overdueAgeCount[age]++
    } else if (cls === 'NOT_DUE') {
      notDueCount++; notDueAmount += os
      const win = daysToDue == null ? '30+' : (daysToDue <= 10 ? '0-10' : daysToDue <= 20 ? '11-20' : daysToDue <= 30 ? '21-30' : '30+')
      notdueWin[win] += os; notdueWinCount[win]++
    } else {
      paidCount++
    }

    if (!entityMap[ent]) entityMap[ent] = { entity: ent, count: 0, billed: 0, netPay: 0, paid: 0, outstanding: 0, overdue: 0, notdue: 0 }
    const em = entityMap[ent]
    em.count++; em.billed += b; em.netPay += np; em.paid += pa; em.outstanding += os
    if (cls === 'OVERDUE') em.overdue += os
    else if (cls === 'NOT_DUE') em.notdue += os

    invoices.push({
      po: r['PO Number'] || '',
      entity: ent,
      billed: b, netPay: np, paid: pa, outstd: os,
      due, payStatus: ps, lastPay, cls,
      daysPastDue: cls === 'OVERDUE' ? (daysPastDue || 0) : (cls === 'NOT_DUE' && daysToDue != null ? Math.max(0, daysToDue) : 0),
    })
  }

  const entities = Object.values(entityMap).sort((a, b) => b.billed - a.billed)
  const overdueList = invoices.filter(x => x.cls === 'OVERDUE').sort((a, b) => b.daysPastDue - a.daysPastDue)
  const notDueList = invoices.filter(x => x.cls === 'NOT_DUE')
  const paidList = invoices.filter(x => x.cls === 'PAID')

  return {
    date: toISODate(t),
    count: rows.length,
    billed: Math.round(billed),
    netPayable: Math.round(netPayable),
    paid: Math.round(paid),
    outstanding: Math.round(outstanding),
    deductions: {
      purchaseReturn: Math.round(pr), brandDiscount: Math.round(brand), otherDebit: Math.round(otherDebit),
      otherAdj: Math.round(otherAdj), tds: Math.round(tds),
      total: Math.round(pr + brand + otherDebit + otherAdj + tds),
    },
    overdue: { count: overdueCount, amount: Math.round(overdueAmount) },
    overdueAge, overdueAgeCount,
    notDue: { count: notDueCount, amount: Math.round(notDueAmount) },
    notdueWin, notdueWinCount,
    paidCount,
    entities,
    invoices,
    lists: { overdueList, notDueList, paidList },
  }
}