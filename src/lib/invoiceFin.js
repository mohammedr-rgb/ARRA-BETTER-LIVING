import { parseCSV } from './utils'

export const FINANCE_SHEET_ID = '14riCGmsLkuomzSETNSITLulbWyl7hono2U4NMRowpdI'
export const SHEET_URLS = {
  zoho: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=361334241`,
  swiggyInvoice: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=549163658`,
  swiggyPayment: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=1209620263`,
  grn: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=408069390`,
  bank: `https://docs.google.com/spreadsheets/d/${FINANCE_SHEET_ID}/export?format=csv&gid=1407678970`,
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

export function computeFinance({ zohoRows, swiggyInvoiceRows, swiggyPaymentRows, bankRows, grnRows, today, overrides = {} }) {
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
      payRef: String(r['Payment Reference No'] || '').trim(),
      lastPay: parseDate(r['Last Payment Date']),
      creditPeriod: String(r['Credit Period'] || '').trim(),
      poNo: String(r['PO No.'] || '').trim(),
      swGrnNo: String(r['GRN No.'] || '').trim(),
      purchaseReturn: parseNum(r['Purchase Return Amount']),
      otherDebit: parseNum(r['Other Debit Amount']),
    }
  }

  // ---- PAYMENT REPORT ----
  const payments = {}
  const payRows = []
  for (const r of swiggyPaymentRows) {
    const ent = normEntity(r['Organization Name'])
    if (!ent) continue
    const amt = parseNum(r['Amount'])
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

  // ---- BANK STATEMENT (actual received) ----
  const bank = []
  for (const r of bankRows || []) {
    const amt = parseNum(r['Amount'])
    const ref = String(r['Ref'] || '').trim()
    if (amt <= 0 || ref.toUpperCase().includes('TOTAL')) continue
    const name = String(r['Enity wise Payment details'] || '').trim()
    bank.push({ d: parseDate(r['Date']), amt, name, ref, entity: normEntity(name) })
  }

  const bankUsed = new Set()
  const payUsed = new Set()
  for (let pi = 0; pi < payRows.length; pi++) {
    const p = payRows[pi]
    if (!p.d) continue
    for (let bi = 0; bi < bank.length; bi++) {
      const b = bank[bi]
      if (bankUsed.has(bi) || !b.d) continue
      if (Math.abs(p.amt - b.amt) < 0.005 && Math.abs((p.d - b.d) / 86400000) <= 3) {
        bankUsed.add(bi)
        payUsed.add(pi)
        break
      }
    }
  }

  const normRef = (r) => String(r || '').replace(/\s+/g, '')
  const bankMatchMap = {}
  for (let pi = 0; pi < payRows.length; pi++) {
    const p = payRows[pi]
    if (!payUsed.has(pi) || !p.ref) continue
    for (let bi = 0; bi < bank.length; bi++) {
      if (!bankUsed.has(bi)) continue
      const b = bank[bi]
      if (Math.abs(p.amt - b.amt) < 0.005 && Math.abs((p.d - b.d) / 86400000) <= 3) {
        const key = normRef(p.ref)
        if (key && !bankMatchMap[key]) bankMatchMap[key] = b.ref
        break
      }
    }
  }
  const notInBankRefs = new Set()
  payRows.forEach((p, pi) => {
    if (!payUsed.has(pi) && p.ref) notInBankRefs.add(normRef(p.ref))
  })

  const bankByEntity = {}
  let bankTotal = 0
  const bankFlags = []
  bank.forEach((b, bi) => {
    bankTotal += b.amt
    if (b.entity) bankByEntity[b.entity] = (bankByEntity[b.entity] || 0) + b.amt
    if (!bankUsed.has(bi) && b.entity && b.entity !== 'BLINK COMMERCE') {
      bankFlags.push({ kind: 'not_in_report', date: toISODate(b.d), amount: b.amt, entity: b.entity, ref: b.ref, note: 'Bank credit not present in Swiggy payment report' })
    }
  })
  payRows.forEach((p, pi) => {
    if (!payUsed.has(pi)) {
      bankFlags.push({ kind: 'not_in_bank', date: toISODate(p.d), amount: p.amt, entity: p.entity, ref: p.ref, num: p.num, note: 'In Swiggy payment report but not credited in bank statement' })
    }
  })

  // ---- GRN ----
  const grnFac = {}
  const grnByInv = {}
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
    const invKey = normInv(r['InvoiceNumber'])
    const g = grnByInv[invKey] || (grnByInv[invKey] = { grnNums: new Set(), dnNums: new Set(), dnValue: 0, grnValue: 0 })
    g.grnNums.add(grn)
    const dnNum = String(r['DnNumber'] || '').trim()
    if (dnNum) g.dnNums.add(dnNum)
    g.dnValue += dn
    g.grnValue += amt
  }

  // ---- CLASSIFY (ZOHO MASTER + SWIGGY OVERLAY) ----
  const master = []
  for (const [num, z] of Object.entries(zoho)) {
    if (!z.entity) continue
    const sw = swReport[num]
    let paid = z.status === 'Closed' || z.status === 'Paid' || z.balance <= 0 || z.lastPay !== null
    if (sw && ['paid', 'no due'].includes(sw.payStatus.toLowerCase()) && sw.payAmt > 0) paid = true
    const sheetDue = z.due || (sw ? sw.due : null)
    let due = sheetDue
    if (z.invDate && !isNaN(z.invDate)) {
      const calc = new Date(z.invDate.getTime() + 30 * 86400000)
      calc.setHours(0, 0, 0, 0)
      due = calc
    }
    let cls
    if (paid) cls = 'PAID'
    else if (!due) cls = 'PENDING_NO_DUE'
    else if (due < TODAY) cls = 'OVERDUE'
    else cls = 'NOT_DUE'
    const partialPaid = !!(sw && /partially/i.test(sw.payStatus) && sw.payAmt > 0)
    master.push({
      num, entity: z.entity, cust: z.cust, status: z.status,
      total: z.total, balance: z.balance, due, dueSheet: sheetDue,
      invDate: z.invDate, lastPay: z.lastPay, terms: z.terms, cls,
      inSw: !!sw, swStatus: sw ? sw.payStatus : null, swOutstd: sw ? sw.outstd : null,
      partialPaid, swPayAmt: sw ? sw.payAmt : null,
    })
  }

  // ---- ENRICH (swiggy details, GRN/DN, bank credit status) ----
  for (const x of master) {
    const s = swReport[x.num]
    const g = grnByInv[x.num]
    if (s) {
      x.payRef = s.payRef
      x.lastPay = s.lastPay
      x.payStatus = s.payStatus
      x.outstd = s.outstd
      x.creditPeriod = s.creditPeriod
      x.poNo = s.poNo
      x.swGrnNo = s.swGrnNo
      x.purchaseReturn = s.purchaseReturn
      x.otherDebit = s.otherDebit
    }
    if (g) {
      x.grnNums = Array.from(g.grnNums).join('; ')
      x.dnNums = Array.from(g.dnNums).join('; ')
      x.dnValue = g.dnValue
      x.grnValue = g.grnValue
    }
    x.bankStatus = '—'
    x.bankUtr = ''
    x.mismatchNote = ''
    if (s && s.payRef) {
      const seen = new Set()
      const results = []
      for (const raw of s.payRef.split(/[,;]/).map(x => x.trim()).filter(Boolean)) {
        const key = normRef(raw)
        if (!key || seen.has(key)) continue
        seen.add(key)
        if (Object.prototype.hasOwnProperty.call(bankMatchMap, key)) results.push({ raw, st: 'CREDITED', utr: bankMatchMap[key] })
        else if (notInBankRefs.has(key)) results.push({ raw, st: 'NOT CREDITED' })
        else results.push({ raw, st: 'NO PAYMENT REPORT ROW' })
      }
      if (results.length) {
        const sts = Array.from(new Set(results.map(x => x.st)))
        x.bankStatus = sts.length === 1 ? sts[0] : 'PARTIAL'
        x.bankUtr = Array.from(new Set(results.filter(x => x.utr).map(x => x.utr))).join('; ')
        const bad = results.filter(x => x.st !== 'CREDITED').map(x =>
          x.st === 'NOT CREDITED'
            ? `Pay ref ${x.raw} not credited in bank statement`
            : `Pay ref ${x.raw} not found in Swiggy payment report`)
        results.filter(x => x.st === 'CREDITED' && !x.utr).forEach(x => {
          bad.push(`Pay ref ${x.raw} credited but bank statement has no UTR`)
        })
        if (bad.length) x.mismatchNote = bad.join('; ')
      }
    } else if (s && /unpaid/i.test(s.payStatus) && x.cls === 'PAID') {
      x.mismatchNote = 'Swiggy invoice report shows Unpaid but Zoho shows paid; no bank credit found'
    } else if (x.cls === 'PAID' && !x.inSw) {
      if (x.lastPay) {
        const hit = bank.find(b => b.d && Math.abs(b.amt - x.total) < 0.005 && Math.abs((b.d - x.lastPay) / 86400000) <= 3)
        if (hit) {
          x.bankStatus = 'CREDITED'
          x.bankUtr = hit.ref
        } else {
          x.mismatchNote = 'Paid in Zoho (not in Swiggy report) but no matching credit in bank statement'
        }
      } else {
        x.mismatchNote = 'Paid in Zoho but no Swiggy invoice record (unconfirmed)'
      }
    }
  }

  // ---- ORPHAN BANK CREDITS vs UNPAID-IN-SWIGGY PAID INVOICES ----
  const referencedRefs = new Set()
  for (const x of master) {
    const r2 = swReport[x.num]
    if (r2 && r2.payRef) r2.payRef.split(/[,;]/).forEach(r => referencedRefs.add(normRef(r)))
  }
  for (const ref of notInBankRefs) {
    if (referencedRefs.has(ref)) continue
    const p = payRows.find(pp => normRef(pp.ref) === ref)
    if (!p) continue
    const cands = master.filter(x => x.cls === 'PAID' && swReport[x.num] && /unpaid/i.test(swReport[x.num].payStatus) && Math.abs(x.total - p.amt) < 1)
    if (cands.length === 1) {
      const x = cands[0]
      x.bankStatus = 'NOT CREDITED'
      x.mismatchNote = `Swiggy invoice report shows Unpaid but payment report ref ${p.ref} (${p.amt.toFixed(2)}) not credited in bank statement`
    }
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
    // partially paid per Swiggy report → chase only the actual outstanding
    if (x.partialPaid) {
      const outstd = typeof x.outstd === 'number' && isFinite(x.outstd) && x.outstd >= 0
        ? x.outstd
        : Math.max(0, x.total - x.swPayAmt)
      x.chaseAmt = Math.max(0, Math.min(x.net, outstd))
    } else {
      x.chaseAmt = x.net
    }
    x.hasOverride = !!(ov && (adj > 0 || remark || note))
    totalAdjustment += x.adjustment
    if (x.hasOverride) overriddenCount++
    // "change the status as cancel / amount adjusted" team remarks → exclude invoice entirely
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
    if (x.inSw) e.inSw++
    if (x.cls === 'PAID') {
      e.paid += x.net
      e.paidC++
      totals.paid += x.net
      counts.paid++
    } else {
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
      } else if (x.cls === 'NOT_DUE') {
        e.notdue += x.chaseAmt
        e.ndC++
        totals.notdue += x.chaseAmt
        counts.notdue++
        const d = daysBetween(x.due, TODAY)
        notdueWin[winKey(d)] = (notdueWin[winKey(d)] || 0) + x.chaseAmt
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

  const overdueList = master.filter(x => x.cls === 'OVERDUE').sort((a, b) => b.chaseAmt - a.chaseAmt)
  const notDueList = master.filter(x => x.cls === 'NOT_DUE').sort((a, b) => (a.due || 0) - (b.due || 0))

  const cancelledNums = new Set(master.filter(x => x.cancelled).map(x => x.num))

  // paid-late (swiggy report paid after due date)
  const paidLate = []
  for (const [num, s] of Object.entries(swReport)) {
    if (cancelledNums.has(num)) continue
    if (['paid', 'no due'].includes(s.payStatus.toLowerCase()) && s.payAmt > 0 && s.due && s.due < TODAY) {
      paidLate.push({ inv: num, entity: s.entity, amt: s.netPay, due: s.due })
    }
  }
  paidLate.sort((a, b) => b.amt - a.amt)
  const paidLateValue = paidLate.reduce((s, p) => s + p.amt, 0)

  // swiggy-report paid per entity
  const swPaidSum = {}
  for (const [num, s] of Object.entries(swReport)) {
    if (cancelledNums.has(num)) continue
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
    overrides: { totalAdjustment, overriddenCount, sheetTotals, cancelledCount, cancelledTotal },
    invoices: master,
    bank: {
      total: bankTotal,
      rows: bank.length,
      byEntity: bankByEntity,
      matchedPayments: payUsed.size,
      flags: bankFlags,
    },
    zohoPaidNotInBank: totals.paid - bankTotal,
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

export async function fetchFinanceRows() {
  const fetchCsv = async (url, label) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`)
    return parseCSV(await res.text())
  }
  const [zohoRows, swiggyInvoiceRows, swiggyPaymentRows, grnRows, bankRows] = await Promise.all([
    fetchCsv(SHEET_URLS.zoho, 'Zoho invoices'),
    fetchCsv(SHEET_URLS.swiggyInvoice, 'Swiggy invoice report'),
    fetchCsv(SHEET_URLS.swiggyPayment, 'Swiggy payment report'),
    fetchCsv(SHEET_URLS.grn, 'GRN details'),
    fetchCsv(SHEET_URLS.bank, 'Bank statement'),
  ])
  return { zohoRows, swiggyInvoiceRows, swiggyPaymentRows, grnRows, bankRows }
}

export async function fetchFinanceSheets(overrides) {
  const rows = await fetchFinanceRows()
  return computeFinance({ ...rows, overrides })
}

export const inr = (v) => '₹' + Math.round(v || 0).toLocaleString('en-IN')