import { useState, useMemo, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { num, uniqueByPO, parseDate, formatDate, csvEscape, loadCSVFromFile } from '../lib/utils'
import { TooltipRow, StatCard, DateRangePicker, RangePresets, ProfileSection, CSVButton } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { PONumberLink } from '../components/PONumberLink'
import { fetchFinanceRows, computeFinance, computeZohoAnalysis, computeMasterFinance, normInv, parseNum, inr } from '../lib/invoiceFin'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const OVERRIDE_KEY = 'arra_finance_overrides_v1'

const PAID_KEYWORDS = ['paid', 'received', 'done', 'complete', 'credited', 'success', 'cleared', 'settled', 'yes']

function receivedFor(r) {
  const ps = (r['Payment status'] || '').trim()
  if (!ps) return 0
  const n = num(ps)
  if (n > 0) return n
  const low = ps.toLowerCase()
  if (PAID_KEYWORDS.some(k => low.includes(k))) return num(r['Invoice Value'])
  return 0
}

  const iso = (d) => (d instanceof Date && !isNaN(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '—')
const daysLate = (d, today) => (d instanceof Date && !isNaN(d) ? Math.max(0, Math.round((today - d) / 86400000)) : 0)

const AGE_ORDER = ['0-15', '16-30', '31-60', '60+']
const WIN_ORDER = ['0-7', '8-15', '16-30', '30+']
const BUCKET_COLORS = { '0-15': '#22c55e', '16-30': '#eab308', '31-60': '#f97316', '60+': '#ef4444' }

export default function FinanceTab({ data, onOpenPO }) {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)
  const [dateFrom, setDateFrom] = useState(formatDate(thirtyDaysAgo))
  const [dateTo, setDateTo] = useState(formatDate(today))

  // ---------------- INVOICE RECEIVABLES (live from sheets) ----------------
  const [rowsData, setRowsData] = useState(null)
  const [overrides, setOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}') } catch { return {} }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [uploadMsg, setUploadMsg] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides)) } catch { /* ignore */ }
  }, [overrides])

  const fin = useMemo(() => rowsData ? computeFinance({ ...rowsData, overrides }) : null, [rowsData, overrides])

  const zoho = useMemo(() => rowsData ? computeZohoAnalysis({ zohoRows: rowsData.zohoMasterRows, swiggyInvoiceRows: rowsData.swiggyInvoiceRows, swiggyPaymentRows: rowsData.swiggyPaymentRows }) : null, [rowsData])

  const masterPO = useMemo(() => uniqueByPO(data), [data])
  const mfin = useMemo(() => computeMasterFinance({ poData: masterPO, today: new Date() }), [masterPO])

  const masterCsvRows = () => {
    if (!mfin) return []
    const head = ['PO Number', 'Entity', 'Invoices Recorded', 'Net Payable', 'Payment Amount', 'Outstanding', 'Due Date', 'Payment Status', 'Last Payment Date', 'Class']
    const lines = mfin.invoices.map(x => [x.po, x.entity, Math.round(x.billed), Math.round(x.netPay), Math.round(x.paid), Math.round(x.outstd), iso(x.due), x.payStatus, iso(x.lastPay), x.cls].map(v => csvEscape(v)).join(','))
    return [head.join(','), ...lines]
  }

  const zohoCsvRows = () => {
    if (!zoho) return []
    const head = ['Invoice Number', 'Entity', 'Invoice Date', 'Zoho Status', 'Remarks', 'GRN No.', 'GRN Date', 'Total (Zoho)', 'Balance (Zoho)', 'Net Payable', 'Payment Amount', 'Payment Ref No.', 'Outstanding', 'Due Date', 'Overdue?', 'Payment Status', 'Last Payment Date', 'Appointment Date', 'Category']
    const lines = zoho.invoices.map(x => [x.num, x.entity, iso(x.invDate), x.zohoStatus, x.remarks, x.grnNo, iso(x.grnDate), Math.round(x.total), Math.round(x.balance), Math.round(x.netPay), Math.round(x.payAmt), x.payRef, Math.round(x.outstd), iso(x.due), x.overdueLabel, x.payStatus, iso(x.lastPay), iso(x.appt), x.cls].map(v => csvEscape(v)).join(','))
    return [head.join(','), ...lines]
  }

  const zohoPendingCsvRows = () => {
    if (!zoho) return []
    const head = ['Invoice Number', 'Entity', 'Net Payable', 'Paid Amount', 'Outstanding', 'Due Date', 'Overdue?', 'Days Past Due', 'Days to Due', 'Payment Status', 'Payment Ref No.', 'Remarks']
    const pending = [...zoho.lists.overdueList, ...zoho.lists.notDueList, ...zoho.lists.pendingNoDueList]
    const lines = pending.map(x => [x.num, x.entity, Math.round(x.netPay), Math.round(x.payAmt), Math.round(x.outstd), iso(x.due), x.cls === 'OVERDUE' ? 'Yes' : 'No', x.cls === 'OVERDUE' ? x.daysPastDue : 0, x.cls === 'NOT_DUE' ? Math.max(0, Math.round((x.due - new Date(zoho.date)) / 86400000)) : 0, x.payStatus, x.payRef, x.remarks].map(v => csvEscape(v)).join(','))
    return [head.join(','), ...lines]
  }

  const pivotRows = useMemo(() => {
    if (!fin) return []
    const map = {}
    for (const x of fin.invoices) {
      if (x.cancelled) continue
      const e = map[x.entity] || (map[x.entity] = { entity: x.entity, count: 0, billed: 0, paid: 0, pending: 0, overdue: 0, notdue: 0 })
      e.count++
      e.billed += x.total
      if (x.cls === 'PAID') e.paid += x.payAmt
      else {
        if (x.payAmt > 0) e.paid += x.payAmt
        e.pending += x.chaseAmt
        if (x.cls === 'OVERDUE') e.overdue += x.chaseAmt
        else if (x.cls === 'NOT_DUE' || x.cls === 'PENDING_NO_DUE') e.notdue += x.chaseAmt
      }
    }
    const rows = Object.values(map).sort((a, b) => b.billed - a.billed)
    const tot = { entity: 'TOTAL', count: 0, billed: 0, paid: 0, pending: 0, overdue: 0, notdue: 0 }
    for (const r of rows) {
      tot.count += r.count; tot.billed += r.billed; tot.paid += r.paid; tot.pending += r.pending
      tot.overdue += r.overdue; tot.notdue += r.notdue
    }
    return [...rows, tot]
  }, [fin])

  const loadFin = () => {
    setIsRefreshing(true)
    setError(null)
    fetchFinanceRows()
      .then(r => { setRowsData(r); setLoading(false); setIsRefreshing(false) })
      .catch(e => { setLoading(false); setIsRefreshing(false); setError(e.message || 'Failed to load finance sheets') })
  }

  useEffect(() => { loadFin() }, [])

  const handleUpload = async (file) => {
    if (!file || !fin) return
    try {
      const parsed = await loadCSVFromFile(file)
      const known = new Set(fin.invoices.map(x => x.num))
      const next = { ...overrides }
      let ok = 0, unknown = 0, cleared = 0
      for (const r of parsed) {
        const invNum = normInv(r['Invoice Number'] || r['Invoice No'] || '')
        if (!invNum || !known.has(invNum)) { unknown++; continue }
        const remark = String(r['Internal Remark'] || '').trim()
        const note = String(r['Adjustment Note'] || '').trim()
        const adj = parseNum(r['Adjustment'])
        if (!remark && !note && adj <= 0) {
          if (next[invNum]) cleared++
          delete next[invNum]
          continue
        }
        next[invNum] = { remark, note, adjustment: adj }
        ok++
      }
      setOverrides(next)
      const parts = [`Loaded ${ok} overrides`]
      if (unknown) parts.push(`${unknown} unknown invoices skipped`)
      if (cleared) parts.push(`${cleared} cleared (empty rows)`)
      setUploadMsg(parts.join(' · '))
      setTimeout(() => setUploadMsg(null), 5000)
    } catch {
      setUploadMsg('Failed to parse uploaded file')
      setTimeout(() => setUploadMsg(null), 5000)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const invoiceSheetAOA = () => {
    const head = [
      'Invoice Number', 'Entity', 'PO No.', 'GRN No.', 'Invoice Accounting Date', 'Due Date',
      'Credit Period', 'Gross GRN Amount', 'Net Payable Amount', 'TDS/TCS', 'Purchase Return',
      'Brand Discount (Promo Claims)', 'Other Debit Amount', 'Other Adjustments', 'Total Deductions',
      'Payment Status', 'Payment Amount', 'Payment Ref No.', 'Outstanding Payment', 'Last Payment Date',
      'Class', 'Final Status',
      'Internal Remark', 'Adjustment', 'Adjustment Note',
    ]
    const lines = fin.invoices.map(x => [
      x.num, x.entity, x.poNo || '', x.swGrnNo || '', iso(x.invDate), iso(x.due),
      x.creditPeriod || '', Math.round(x.gross || 0), Math.round(x.total), Math.round(x.tds || 0),
      Math.round(x.purchaseReturn || 0), Math.round(x.brandDiscount || 0), Math.round(x.otherDebit || 0),
      Math.round(x.otherAdj || 0), Math.round(x.deductions || 0),
      x.payStatus, Math.round(x.payAmt || 0), x.payRef || '', Math.round(x.outstd || 0), iso(x.lastPay),
      x.cls, x.cancelled ? 'CANCELLED' : x.cls,
      x.remark || '', x.adjustment || 0, x.note || '',
    ])
    return [head, ...lines]
  }

  const leftoverSheetAOA = () => {
    const head = [
      'Invoice Number', 'Entity', 'PO No.', 'Net Payable Amount', 'Paid Amount', 'Outstanding',
      'Due Date', 'Overdue?', 'Days Past Due', 'Days to Due', 'Payment Status', 'Payment Ref No.',
      'Internal Remark',
    ]
    const lines = fin.leftoverPendingList.map(x => [
      x.num, x.entity, x.poNo || '', Math.round(x.total), Math.round(x.payAmt || 0), Math.round(x.outstd || 0),
      iso(x.due), x.cls === 'OVERDUE' ? 'Yes' : 'No',
      x.cls === 'OVERDUE' ? daysLate(x.due, new Date(fin.date)) : 0,
      x.cls === 'NOT_DUE' ? Math.max(0, Math.round((x.due - new Date(fin.date)) / 86400000)) : 0,
      x.payStatus, x.payRef || '', x.remark || '',
    ])
    return [head, ...lines]
  }

  const overallViewSheetAOA = () => {
    const entities = fin.entities.map(e => e.entity)
    const payByEntity = {}
    for (const p of fin.paymentsByEntity) payByEntity[p.entity] = p.amount
    const cols = ['Category', ...entities, 'TOTAL']
    const mk = (amounts) => [...entities.map(e => amounts[e] || 0), entities.reduce((s, e) => s + (amounts[e] || 0), 0)]
    const rows = [
      'Total Billed (Swiggy Invoice Report — Net Payable)',
      'Less: Internal Adjustments',
      'Net Billed',
      'Paid (as per Swiggy payment statement)',
      '— Paid: confirmed on invoices',
      '— Paid: not yet allocated to invoices',
      'Not Due 0-10 days',
      'Not Due 10-20 days',
      'Not Due 20-30 days',
      'Not Due 30+ days',
      'Pending (No Due Date)',
      'Total Not Due',
      'Overdue 0-10 days',
      'Overdue 10-20 days',
      'Overdue 20-30 days',
      'Overdue 30+ days',
      'Total Overdue',
      'Total Leftover Pending (= Overdue + Not Due + No Due Date)',
      'Reconciliation (= Net Billed)',
      'Net Outstanding (Billed − Paid Received)',
      'Deductions (Purchase Return + Other Debit + TDS + Other Adjustments)',
    ]
    const bucket = (d) => (d <= 10 ? '0-10' : d <= 20 ? '10-20' : d <= 30 ? '20-30' : '30+')
    const totals = {}
    const counts = {}
    rows.forEach(r => { totals[r] = {}; counts[r] = {} })

    for (const x of fin.invoices) {
      if (x.cancelled) continue
      const e = x.entity
      const add = (k, amt) => { totals[k][e] = (totals[k][e] || 0) + Math.round(amt); counts[k][e] = (counts[k][e] || 0) + 1 }
      totals['Total Billed (Swiggy Invoice Report — Net Payable)'][e] = (totals['Total Billed (Swiggy Invoice Report — Net Payable)'][e] || 0) + Math.round(x.total)
      totals['Less: Internal Adjustments'][e] = (totals['Less: Internal Adjustments'][e] || 0) + Math.round(x.adjustment || 0)
      totals['Deductions (Purchase Return + Other Debit + TDS + Other Adjustments)'][e] = (totals['Deductions (Purchase Return + Other Debit + TDS + Other Adjustments)'][e] || 0) + Math.round(x.deductions || 0)
      if (x.cls === 'PAID') {
        add('— Paid: confirmed on invoices', x.payAmt)
      } else if (x.cls === 'NOT_DUE') {
        const rem = Math.max(0, Math.round((x.due - today) / 86400000))
        const w = rem <= 10 ? '0-10' : rem <= 20 ? '10-20' : rem <= 30 ? '20-30' : '30+'
        add('Not Due ' + w + ' days', x.chaseAmt)
      } else if (x.cls === 'PENDING_NO_DUE') {
        add('Pending (No Due Date)', x.chaseAmt)
      } else if (x.cls === 'OVERDUE') {
        const b = bucket(daysLate(x.due, today))
        add('Overdue ' + b + ' days', x.chaseAmt)
      }
    }
    for (const e of entities) {
      const t = (k) => totals[k][e] || 0
      const c = (k) => counts[k][e] || 0
      totals['Net Billed'][e] = t('Total Billed (Swiggy Invoice Report — Net Payable)') - t('Less: Internal Adjustments')
      totals['— Paid: not yet allocated to invoices'][e] = Math.max(0, Math.round(payByEntity[e] || 0) - t('— Paid: confirmed on invoices'))
      totals['Paid (as per Swiggy payment statement)'][e] = t('— Paid: confirmed on invoices') + totals['— Paid: not yet allocated to invoices'][e]
      totals['Total Not Due'][e] = t('Not Due 0-10 days') + t('Not Due 10-20 days') + t('Not Due 20-30 days') + t('Not Due 30+ days') + t('Pending (No Due Date)')
      counts['Total Not Due'][e] = c('Not Due 0-10 days') + c('Not Due 10-20 days') + c('Not Due 20-30 days') + c('Not Due 30+ days') + c('Pending (No Due Date)')
      totals['Total Overdue'][e] = t('Overdue 0-10 days') + t('Overdue 10-20 days') + t('Overdue 20-30 days') + t('Overdue 30+ days')
      counts['Total Overdue'][e] = c('Overdue 0-10 days') + c('Overdue 10-20 days') + c('Overdue 20-30 days') + c('Overdue 30+ days')
      totals['Total Leftover Pending (= Overdue + Not Due + No Due Date)'][e] = t('Total Not Due') + t('Total Overdue')
      counts['Total Leftover Pending (= Overdue + Not Due + No Due Date)'][e] = c('Total Not Due') + c('Total Overdue')
      totals['Reconciliation (= Net Billed)'][e] = t('— Paid: confirmed on invoices') + t('Total Not Due') + t('Total Overdue')
      totals['Net Outstanding (Billed − Paid Received)'][e] = t('Total Billed (Swiggy Invoice Report — Net Payable)') - Math.round(payByEntity[e] || 0)
    }

    const out = [cols]
    rows.forEach(r => out.push([r, ...mk(totals[r]).map(v => Math.round(v))]))
    out.push([])
    out.push(['INVOICE COUNTS'])
    const countCols = ['Category', ...entities, 'TOTAL']
    const mkC = (amounts) => [...entities.map(e => amounts[e] || 0), entities.reduce((s, e) => s + (amounts[e] || 0), 0)]
    out.push(countCols)
    for (const r of ['Not Due 0-10 days', 'Not Due 10-20 days', 'Not Due 20-30 days', 'Not Due 30+ days', 'Pending (No Due Date)', 'Total Not Due', 'Overdue 0-10 days', 'Overdue 10-20 days', 'Overdue 20-30 days', 'Overdue 30+ days', 'Total Overdue', 'Total Leftover Pending (= Overdue + Not Due + No Due Date)']) {
      out.push([r, ...mkC(counts[r])])
    }
    out.push([])
    out.push(['Note', 'Amounts are net of internal adjustments and exclude cancelled invoices. Billed = Net Payable Amount from the Swiggy invoice report. Paid = Swiggy payment statement (actual money received); "confirmed on invoices" = Payment Amount per invoice in the Swiggy invoice report. Leftover Pending = Outstanding Payment per invoice, split by due date. Overdue buckets by days past due date (0-10, 11-20, 21-30, 30+); Not Due buckets by days remaining until due date (0-10, 11-20, 21-30, 30+). Total Not Due includes Pending (No Due Date).'])
    return out
  }

  const downloadInvoiceWorkbook = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invoiceSheetAOA()), 'Invoices')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leftoverSheetAOA()), 'Leftover Pending')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overallViewSheetAOA()), 'Overall View')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(entitySplitSheetAOA()), 'Entity Split')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(apptMatchSheetAOA()), 'Appointment Matches')
    XLSX.writeFile(wb, 'invoice_receivables.xlsx')
  }

  const overrideCount = fin ? fin.overrides.overriddenCount : 0
  const overrideTotal = fin ? fin.overrides.totalAdjustment : 0

  const entitySplitRows = useMemo(() => {
    if (!fin) return []
    const map = {}
    for (const x of fin.invoices) {
      if (x.cancelled) continue
      const e = map[x.entity] || (map[x.entity] = { entity: x.entity, invoices: 0, billed: 0, paidConfirmed: 0, overdue: 0, notOverdue: 0, deductions: 0, adj: 0 })
      e.invoices++
      e.billed += x.total
      e.deductions += x.deductions || 0
      e.adj += x.adjustment || 0
      if (x.cls === 'PAID') e.paidConfirmed += x.payAmt
      else {
        if (x.payAmt > 0) e.paidConfirmed += x.payAmt
        if (x.cls === 'OVERDUE') e.overdue += x.chaseAmt
        else if (x.cls === 'NOT_DUE' || x.cls === 'PENDING_NO_DUE') e.notOverdue += x.chaseAmt
      }
    }
    const payByEntity = {}
    for (const p of fin.paymentsByEntity) payByEntity[p.entity] = p.amount
    const rows = Object.values(map).sort((a, b) => b.billed - a.billed).map(r => ({ ...r, paidPayReport: payByEntity[r.entity] || 0, netOutstanding: Math.max(0, r.billed - (payByEntity[r.entity] || 0)) }))
    const keys = ['invoices', 'billed', 'paidConfirmed', 'overdue', 'notOverdue', 'deductions', 'adj', 'paidPayReport', 'netOutstanding']
    const tot = keys.reduce((t, k) => { t[k] = rows.reduce((s, r) => s + r[k], 0); return t }, { entity: 'TOTAL' })
    return [...rows, tot]
  }, [fin])

  const entitySplitSheetAOA = () => {
    const head = ['Entity', 'Invoices', 'Billed (Net Payable)', 'Paid — as per Swiggy Payment Statement', 'Net Outstanding (Billed − Paid Received)', 'Paid — Confirmed on Invoices', 'Overdue (outstanding, past due)', 'Not Due (outstanding, due in future)', 'Deductions (Purchase Return + Other Debit + TDS + Other)', 'Internal Adjustments']
    const lines = entitySplitRows.map(r => [r.entity, r.invoices, Math.round(r.billed), Math.round(r.paidPayReport), Math.round(r.netOutstanding), Math.round(r.paidConfirmed), Math.round(r.overdue), Math.round(r.notOverdue), Math.round(r.deductions), Math.round(r.adj)])
    return [head, ...lines]
  }

  const SETTLE_DAYS = 35

  const apptMatchData = useMemo(() => {
    if (!fin || !data) return { rows: [], futureRows: [], unscheduledRows: [], forecast: null, forecastCounts: null }
    const byInv = new Map()
    const byPo = new Map()
    for (const r of data) {
      const appt = parseDate(r['Appointment Date(MM-DD-YYYY)'])
      if (!appt) continue
      const invNo = normInv(r['Invoice No'] || '')
      const po = String(r['PO Number'] || '').trim()
      if (invNo) {
        if (!byInv.has(invNo)) byInv.set(invNo, [])
        byInv.get(invNo).push(appt)
      }
      if (po) {
        if (!byPo.has(po)) byPo.set(po, [])
        byPo.get(po).push(appt)
      }
    }
    const payByKey = new Map()
    for (const p of fin.payments || []) {
      if (!p.d) continue
      const key = `${p.entity}|${iso(p.d)}`
      if (!payByKey.has(key)) payByKey.set(key, p)
    }
    const rows = []
    const futureRows = []
    const unscheduledRows = []
    const forecast = { '0-10': 0, '10-20': 0, '20-30': 0, '30+': 0, total: 0 }
    const forecastCounts = { '0-10': 0, '10-20': 0, '20-30': 0, '30+': 0 }
    const todayFin = new Date(fin.date + 'T00:00:00')
    for (const x of fin.invoices) {
      if (x.cls !== 'NOT_DUE' && x.cls !== 'PENDING_NO_DUE') continue
      const appts = [...(byInv.get(x.num) || []), ...(byPo.get(x.poNo) || [])]
      if (!appts.length) {
        unscheduledRows.push({ num: x.num, po: x.poNo, entity: x.entity, total: x.total, net: x.net ?? x.total })
        continue
      }
      appts.sort((a, b) => a - b)
      const appt = appts[0]
      const settle = new Date(appt.getTime() + SETTLE_DAYS * 86400000)
      const days = Math.ceil((settle - todayFin) / 86400000)
      const bucket = days <= 10 ? '0-10' : days <= 20 ? '10-20' : days <= 30 ? '20-30' : '30+'
      futureRows.push({ num: x.num, po: x.poNo, entity: x.entity, total: x.total, net: x.net ?? x.total, apptDate: appt, settleDate: settle, days })
      forecast[bucket] += x.total
      forecast.total += x.total
      forecastCounts[bucket]++
      const p = payByKey.get(`${x.entity}|${iso(settle)}`)
      if (p) {
        rows.push({
          num: x.num,
          po: x.poNo,
          entity: x.entity,
          total: x.total,
          net: x.net ?? x.total,
          apptDate: appt,
          settleDate: settle,
          payDate: p.d,
          payAmt: p.amt,
          payRef: p.ref,
          payNum: p.num,
        })
      }
    }
    rows.sort((a, b) => b.total - a.total)
    futureRows.sort((a, b) => a.days - b.days)
    unscheduledRows.sort((a, b) => b.total - a.total)
    return { rows, futureRows, unscheduledRows, forecast, forecastCounts }
  }, [fin, data])

  const apptMatchRows = apptMatchData.rows
  const futureApptRows = apptMatchData.futureRows
  const unscheduledRows = apptMatchData.unscheduledRows
  const forecast = apptMatchData.forecast
  const forecastCounts = apptMatchData.forecastCounts

  const paymentForecastAOA = () => {
    const out = []
    out.push(['PAYMENT FORECAST — NOT-DUE INVOICES', 'Predicted settlement date = appointment date + 35 days (from master data, matched by invoice number)'])
    out.push(['As on', fin.date])
    out.push([])
    out.push(['Forecast Window (days to settlement)', 'Invoices', 'Amount (₹)'])
    for (const b of ['0-10', '10-20', '20-30', '30+']) out.push([`Next ${b} days`, forecastCounts[b], Math.round(forecast[b])])
    out.push(['Total (scheduled)', futureApptRows.length, Math.round(forecast.total)])
    out.push([])
    out.push(['INVOICE-WISE DETAIL'])
    out.push(['Invoice Number', 'PO No.', 'Entity', 'Invoice Total', 'Net Amount', 'Appointment Date', 'Settlement Date (Appointment + 35 Days)', 'Days to Settlement', 'Window'])
    for (const r of futureApptRows) {
      const bucket = r.days <= 10 ? '0-10' : r.days <= 20 ? '10-20' : r.days <= 30 ? '20-30' : '30+'
      out.push([r.num, r.po, r.entity, Math.round(r.total), Math.round(r.net), iso(r.apptDate), iso(r.settleDate), r.days, `Next ${bucket} days`])
    }
    out.push([])
    out.push(['UNSCHEDULED — NO APPOINTMENT DATE IN MASTER DATA'])
    out.push(['Invoice Number', 'PO No.', 'Entity', 'Invoice Total', 'Net Amount', 'Status'])
    for (const r of unscheduledRows) out.push([r.num, r.po, r.entity, Math.round(r.total), Math.round(r.net), 'Unscheduled'])
    const unTot = unscheduledRows.reduce((s, r) => s + r.total, 0)
    out.push(['Total', '', '', Math.round(unTot), '', ''])
    return out
  }

  const downloadPaymentForecast = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(paymentForecastAOA()), 'Forecast')
    XLSX.writeFile(wb, 'payment_forecast.xlsx')
  }

  const apptMatchSheetAOA = () => {
    const head = ['Invoice Number', 'PO No.', 'Entity', 'Invoice Total', 'Net Amount', 'Appointment Date', 'Settlement Date (Appointment + 35 Days)', 'Payment Date (Exact Match)', 'Payment Amount', 'Payment Ref No.', 'Payment Number']
    const lines = apptMatchRows.map(r => [r.num, r.po, r.entity, Math.round(r.total), Math.round(r.net), iso(r.apptDate), iso(r.settleDate), iso(r.payDate), Math.round(r.payAmt), r.payRef, r.payNum])
    const totPay = apptMatchRows.reduce((s, r) => s + r.payAmt, 0)
    const totInv = apptMatchRows.reduce((s, r) => s + r.total, 0)
    lines.push([])
    lines.push(['Total', '', '', Math.round(totInv), '', '', '', '', Math.round(totPay), '', ''])
    lines.push([])
    lines.push(['PAYMENT FORECAST — NOT-DUE INVOICES (settlement = appointment date + 35 days)'])
    lines.push(['Forecast Window (days to settlement)', 'Invoices', 'Amount (₹)'])
    for (const b of ['0-10', '10-20', '20-30', '30+']) lines.push([`Next ${b} days`, forecastCounts[b], Math.round(forecast[b])])
    lines.push(['Total (scheduled)', futureApptRows.length, Math.round(forecast.total)])
    lines.push([])
    lines.push(['Invoice Number', 'PO No.', 'Entity', 'Invoice Total', 'Net Amount', 'Appointment Date', 'Settlement Date (Appointment + 35 Days)', 'Days to Settlement', 'Window'])
    for (const r of futureApptRows) {
      const bucket = r.days <= 10 ? '0-10' : r.days <= 20 ? '10-20' : r.days <= 30 ? '20-30' : '30+'
      lines.push([r.num, r.po, r.entity, Math.round(r.total), Math.round(r.net), iso(r.apptDate), iso(r.settleDate), r.days, `Next ${bucket} days`])
    }
    const futTot = futureApptRows.reduce((s, r) => s + r.total, 0)
    lines.push(['Total', '', '', Math.round(futTot), '', '', '', '', ''])
    lines.push([])
    lines.push(['UNSCHEDULED — NO APPOINTMENT DATE IN MASTER DATA'])
    lines.push(['Invoice Number', 'PO No.', 'Entity', 'Invoice Total', 'Net Amount', 'Status'])
    for (const r of unscheduledRows) lines.push([r.num, r.po, r.entity, Math.round(r.total), Math.round(r.net), 'Unscheduled'])
    const unTot = unscheduledRows.reduce((s, r) => s + r.total, 0)
    lines.push(['Total', '', '', Math.round(unTot), '', ''])
    return [head, ...lines]
  }

  const filteredData = useMemo(() => {
    const from = parseDate(dateFrom)
    const to = parseDate(dateTo)
    if (!from || !to) return data
    return data.filter(r => {
      const d = parseDate(r['DATE(MM-DD-YYYY)'])
      if (!d) return true
      return d >= from && d <= to
    })
  }, [data, dateFrom, dateTo])

  const poData = useMemo(() => uniqueByPO(filteredData), [filteredData])

  const financeMetrics = useMemo(() => {
    let totalPOValue = 0, totalDN = 0, totalFS = 0, overdueCount = 0, invoiceCount = 0, totalInvoiceValue = 0, receivedAmount = 0
    const overduePOs = []
    const entityMap = {}
    for (const r of poData) {
      const val = num(r['PO Value with Tax'])
      const dn = num(r['DN amount'])
      const fs = num(r['Final Settlement'])
      const iv = num(r['Invoice Value'])
      const recv = receivedFor(r)
      const overdue = r['Payment Overdue Alert'] || ''
      totalPOValue += val
      totalDN += dn
      totalFS += fs
      totalInvoiceValue += iv
      receivedAmount += recv
      const isOverdue = ['overdue', 'yes'].includes(overdue.trim().toLowerCase())
      if (isOverdue) {
        overdueCount++
        overduePOs.push(r['PO Number'])
      }
      if (r['Invoice No']) invoiceCount++
      const e = r['Entity'] || 'Unknown'
      if (!entityMap[e]) entityMap[e] = { entity: e, orders: 0, poValue: 0, dn: 0, fs: 0, invoices: 0, overdueCount: 0, invoiceValue: 0, received: 0 }
      entityMap[e].orders++
      entityMap[e].poValue += val
      entityMap[e].dn += dn
      entityMap[e].fs += fs
      entityMap[e].invoiceValue += iv
      entityMap[e].received += recv
      if (r['Invoice No']) entityMap[e].invoices++
      if (isOverdue) {
        entityMap[e].overdueCount++
      }
    }
    const avgOrderValue = totalPOValue / (poData.length || 1)
    const pendingSettlement = totalDN - totalFS
    return {
      totalPOValue: Math.round(totalPOValue),
      avgOrderValue: Math.round(avgOrderValue),
      totalDN: Math.round(totalDN),
      totalFS: Math.round(totalFS),
      pendingSettlement: Math.round(pendingSettlement),
      overdueCount,
      overduePOs,
      invoiceCount,
      totalInvoiceValue: Math.round(totalInvoiceValue),
      receivedAmount: Math.round(receivedAmount),
      totalOrders: poData.length,
      entityWise: Object.values(entityMap).sort((a, b) => b.poValue - a.poValue),
    }
  }, [poData])

  const entityChartData = useMemo(() => financeMetrics.entityWise.slice(0, 8).map(e => ({
    name: e.entity.length > 14 ? e.entity.slice(0, 12) + '...' : e.entity,
    'PO Value': Math.round(e.poValue),
    'DN Amount': Math.round(e.dn),
    'Settlement': Math.round(e.fs),
  })), [financeMetrics])

  const settlementPieData = useMemo(() => {
    const settled = financeMetrics.totalFS
    const pending = Math.max(0, financeMetrics.pendingSettlement)
    return [
      { name: 'Settled', value: Math.round(settled) },
      { name: 'Pending', value: Math.round(pending) },
    ].filter(d => d.value > 0)
  }, [financeMetrics])

  const overdueAgeData = useMemo(() => fin
    ? AGE_ORDER.filter(k => fin.overdueAge[k]).map(k => ({ name: k + ' days', Amount: Math.round(fin.overdueAge[k]), fill: BUCKET_COLORS[k] }))
    : [], [fin])

  const notdueWinData = useMemo(() => fin
    ? WIN_ORDER.filter(k => fin.notdueWin[k]).map(k => ({ name: k + ' days', Amount: Math.round(fin.notdueWin[k]) }))
    : [], [fin])

  const overdueCsvRows = () => {
    if (!fin) return []
    const head = ['Invoice Number', 'Entity', 'PO No.', 'Net Payable', 'Paid Amount', 'Outstanding', 'Due Date', 'Days Overdue', 'Aging Bucket', 'Payment Status', 'Payment Ref No.', 'Internal Remark']
    const lines = fin.overdueList.map(x => [x.num, x.entity, x.poNo || '', x.total, x.payAmt || 0, x.outstd, iso(x.due), daysLate(x.due, new Date(fin.date)), '', x.payStatus, x.payRef || '', x.remark || ''].map(v => csvEscape(v)).join(','))
    return [head.join(','), ...lines]
  }

  const leftoverCsvRows = () => {
    if (!fin) return []
    const head = ['Invoice Number', 'Entity', 'PO No.', 'Net Payable Amount', 'Paid Amount', 'Outstanding', 'Due Date', 'Overdue?', 'Days Past Due', 'Days to Due', 'Payment Status', 'Payment Ref No.', 'Internal Remark']
    const lines = fin.leftoverPendingList.map(x => [x.num, x.entity, x.poNo || '', x.total, x.payAmt || 0, x.outstd, iso(x.due), x.cls === 'OVERDUE' ? 'Yes' : 'No', x.cls === 'OVERDUE' ? daysLate(x.due, new Date(fin.date)) : 0, x.cls === 'NOT_DUE' ? Math.max(0, Math.round((x.due - new Date(fin.date)) / 86400000)) : 0, x.payStatus, x.payRef || '', x.remark || ''].map(v => csvEscape(v)).join(','))
    return [head.join(','), ...lines]
  }

  const chaseColumns = [
    { key: 'inv', label: 'Invoice', accessor: r => r.num, render: r => (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.num}</span>
        {r.partialPaid && (
          <span title="Partially paid per Swiggy invoice report — chasing only the outstanding amount" style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)', whiteSpace: 'nowrap' }}>
            Partially Paid
          </span>
        )}
      </span>
    ) },
    { key: 'entity', label: 'Entity', accessor: r => r.entity },
    { key: 'amt', label: 'Amount', accessor: r => r.chaseAmt, align: 'right', render: r => {
      if (r.partialPaid) {
        return <span style={{ color: '#fbbf24' }}>{inr(r.chaseAmt)} <span style={{ color: '#64748b', fontSize: 10 }}>outstanding · of {inr(r.total)} billed</span></span>
      }
      return r.adjustment > 0
        ? <span style={{ color: '#a78bfa' }}>{inr(r.chaseAmt)} <span style={{ color: '#64748b', fontSize: 10 }}>(was {inr(r.total)})</span></span>
        : inr(r.total)
    } },
    { key: 'adj', label: 'Adj.', accessor: r => r.adjustment || 0, align: 'right', render: r => r.adjustment > 0 ? <span style={{ color: '#a78bfa', fontWeight: 600 }}>{inr(r.adjustment)}</span> : '—' },
    { key: 'due', label: 'Due Date', accessor: r => r.due, render: r => iso(r.due) },
    { key: 'days', label: 'Days Overdue', accessor: r => daysLate(r.due, new Date(fin.date)), align: 'right', render: r => {
      const d = daysLate(r.due, new Date(fin.date))
      const b = d <= 15 ? '0-15' : d <= 30 ? '16-30' : d <= 60 ? '31-60' : '60+'
      return <span style={{ color: BUCKET_COLORS[b], fontWeight: 600 }}>{d}</span>
    } },
    { key: 'po', label: 'PO No.', accessor: r => r.poNo || '—', render: r => <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{r.poNo || '—'}</span> },
    { key: 'remark', label: 'Internal Remark', accessor: r => r.remark || '', render: r => <span style={{ fontSize: 12, color: r.remark ? '#a78bfa' : '#475569' }}>{r.remark || '—'}</span> },
    { key: 'status', label: 'Payment Status', accessor: r => r.payStatus, render: r => <span style={{ fontSize: 12, color: '#94a3b8' }}>{r.payStatus}</span> },
  ]

  return (
    <>
      <header>
        <div>
          <h1>Finance Overview</h1>
          <div className="date">{financeMetrics.totalOrders} POs • Credit period 30 days • {financeMetrics.entityWise.length} entities</div>
        </div>
        <ProfileSection />
      </header>

      {/* ---------------- INVOICE RECEIVABLES SECTION ---------------- */}
      {loading ? (
        <div className="recent-orders">
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading invoice receivables...</div>
        </div>
      ) : error ? (
        <div className="recent-orders" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
          <div style={{ color: '#ef4444', fontSize: 13, padding: 8 }}>
            Failed to load finance sheets: {error} — <a href="#" onClick={e => { e.preventDefault(); loadFin() }} style={{ color: '#3b82f6' }}>retry</a>
          </div>
        </div>
      ) : fin && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="orders-title" style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
              📒 Invoice Receivables
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div className="chart-period" title="All figures from 2 sheets: Swiggy invoice report + Swiggy payment statement">as of {fin.date} • {fin.masterCount} invoices from Swiggy invoice report • {fin.paymentCount} payments in statement</div>
              {overrideCount > 0 && (
                <span title="Internal remarks/adjustments loaded from your uploaded file" style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)', whiteSpace: 'nowrap' }}>
                  ✏️ {overrideCount} invoice{overrideCount > 1 ? 's' : ''} adjusted · {inr(overrideTotal)}
                </span>
              )}
              <button onClick={downloadInvoiceWorkbook} title="Excel with sheets: Invoices (all) + Leftover Pending (outstanding) + Overall View + Entity Split + Appointment Matches" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                ⬇ Download Invoices
              </button>
              <button onClick={() => fileInputRef.current?.click()} style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                📂 Upload Edited File
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
              {overrideCount > 0 && (
                <button onClick={() => { setOverrides({}); setUploadMsg('All internal overrides cleared'); setTimeout(() => setUploadMsg(null), 3000) }} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#ef4444', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  🗑 Clear Overrides
                </button>
              )}
              <button onClick={loadFin} disabled={isRefreshing} style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isRefreshing ? 0.6 : 1 }}>
                ↻ {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                🔮 Payment Forecast <span style={{ color: '#64748b', fontWeight: 500 }}>— expected settlements for Not-Due invoices (settlement = appointment date + 35 days, from master data by invoice number)</span>
              </div>
              {futureApptRows.length > 0 && (
                <button onClick={downloadPaymentForecast} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  ⬇ Payment Forecast
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
              {futureApptRows.length
                ? `${futureApptRows.length} scheduled invoice(s) — total ₹${forecast.total.toLocaleString('en-IN')} expected within 30 days.`
                : 'No scheduled not-due invoices.'}
              {unscheduledRows.length > 0 && (
                <span style={{ color: '#f59e0b' }}> · <b>{unscheduledRows.length}</b> unscheduled (₹{unscheduledRows.reduce((s, r) => s + r.total, 0).toLocaleString('en-IN')}) — no appointment date in master data.</span>
              )}
            </div>
            {futureApptRows.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                {['0-10', '10-20', '20-30', '30+'].map(b => (
                  <div key={b} style={{ flex: '1 1 180px', padding: '10px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Next {b} days</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>₹{forecast[b].toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{forecastCounts[b]} invoice(s)</div>
                  </div>
                ))}
              </div>
            )}
            {futureApptRows.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Invoice', 'Entity', 'Invoice Total', 'Appointment Date', 'Settlement Date (+35 Days)', 'Days to Settlement', 'Window'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: h === 'Invoice' || h === 'Entity' ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {futureApptRows.map(r => (
                      <tr key={r.num}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{r.num}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>{r.entity}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(r.total)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(r.apptDate)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#22c55e', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(r.settleDate)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#e2e8f0', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.days}d</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.days <= 10 ? '0-10d' : r.days <= 20 ? '10-20d' : r.days <= 30 ? '20-30d' : '30+d'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {unscheduledRows.length > 0 && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>⚠ Unscheduled — no appointment date in master data</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['Invoice', 'Entity', 'Invoice Total', 'Status'].map(h => (
                          <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: h === 'Invoice' || h === 'Entity' ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {unscheduledRows.map(r => (
                        <tr key={r.num}>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{r.num}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>{r.entity}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(r.total)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#f59e0b', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>Unscheduled</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                🧾 Leftover Pending <span style={{ color: '#64748b', fontWeight: 500 }}>— outstanding per Swiggy invoice report, cross-checked with the payment statement</span>
              </div>
              <CSVButton makeRows={leftoverCsvRows} filename="leftover_pending.csv" style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, color: '#fbbf24', padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>⬇ Leftover CSV</CSVButton>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
              {fin.counts.pending} leftover invoice(s) · <b style={{ color: '#fbbf24' }}>₹{Math.round(fin.totals.pending).toLocaleString('en-IN')}</b> outstanding · of which{' '}
              <span style={{ color: '#ef4444' }}>overdue {inr(fin.totals.overdue)} ({fin.counts.overdue})</span> ·{' '}
              <span style={{ color: '#06b6d4' }}>not due {inr(fin.totals.notdue)} ({fin.counts.notdue})</span>
              {fin.pendingNoDue > 0 && <> · <span style={{ color: '#a855f7' }}>no due date {inr(fin.pendingNoDue)} ({fin.pendingNoDueCount})</span></>}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Invoice', 'PO #', 'Entity', 'Net Payable', 'Paid', 'Outstanding', 'Due Date', 'Days', 'Payment Status', 'Payment Ref'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: h === 'Invoice' || h === 'PO #' || h === 'Entity' || h === 'Payment Ref' ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fin.leftoverPendingList.map(r => {
                    const od = r.cls === 'OVERDUE'
                    const days = od ? daysLate(r.due, new Date(fin.date)) : r.cls === 'NOT_DUE' ? Math.max(0, Math.round((r.due - new Date(fin.date)) / 86400000)) : null
                    return (
                      <tr key={r.num}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{r.num}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{r.poNo || '—'}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>{r.entity}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(r.total)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: r.payAmt > 0 ? '#22c55e' : '#64748b', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.payAmt > 0 ? inr(r.payAmt) : '—'}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#fbbf24', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(r.outstd)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(r.due)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {od ? <span style={{ color: '#ef4444', fontWeight: 600 }}>{days}d late</span> : r.cls === 'NOT_DUE' ? <span style={{ color: '#06b6d4' }}>{days}d</span> : <span style={{ color: '#a855f7' }}>—</span>}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {r.partialPaid ? <span style={{ color: '#fbbf24' }}>Partially Paid</span> : od ? 'Overdue' : r.cls === 'NOT_DUE' ? 'Not Due' : 'No Due Date'}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{r.payRef || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                ⏳ Pending Details <span style={{ color: '#64748b', fontWeight: 500 }}>— everything not yet paid: Overdue + Not Due + Pending (No Due Date)</span>
              </div>
              <CSVButton makeRows={overdueCsvRows} filename="overdue_chase_list.csv" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>⬇ Overdue CSV</CSVButton>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
              {fin.counts.pending} unpaid invoices · ₹{Math.round(fin.totals.pending).toLocaleString('en-IN')} total pending. Amounts = net of adjustments.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Category</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Invoices</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#ef4444', fontWeight: 700, whiteSpace: 'nowrap' }}>🔴 Overdue</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#94a3b8' }}>{fin.counts.overdue}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{inr(fin.totals.overdue)}</td>
                  </tr>
                  {AGE_ORDER.filter(k => fin.overdueAge[k]).map(k => (
                    <tr key={k}>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>{k} days past due</td>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#64748b' }}>{fin.overdueAgeCount[k] || 0}</td>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: BUCKET_COLORS[k] }}>{inr(fin.overdueAge[k])}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#06b6d4', fontWeight: 700, whiteSpace: 'nowrap' }}>📅 Not Due</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#94a3b8' }}>{fin.counts.notdue}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#06b6d4', fontWeight: 700 }}>{inr(fin.totals.notdue)}</td>
                  </tr>
                  {WIN_ORDER.filter(k => fin.notdueWin[k]).map(k => (
                    <tr key={k}>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>due in {k} days</td>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#64748b' }}>{fin.notdueWinCount[k] || 0}</td>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#06b6d4' }}>{inr(fin.notdueWin[k])}</td>
                    </tr>
                  ))}
                  {fin.pendingNoDue > 0 && (
                    <tr>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#a855f7', whiteSpace: 'nowrap' }}>Pending (No Due Date)</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#94a3b8' }}>{fin.pendingNoDueCount}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#a855f7' }}>{inr(fin.pendingNoDue)}</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: '2px solid rgba(148,163,184,0.35)' }}>
                    <td style={{ padding: '8px 8px', color: '#e2e8f0', fontWeight: 800, whiteSpace: 'nowrap' }}>⏳ TOTAL PENDING</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#e2e8f0', fontWeight: 800 }}>{fin.counts.pending}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#fbbf24', fontWeight: 800 }}>{inr(fin.totals.pending)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>
              📊 Download Summary <span style={{ color: '#64748b', fontWeight: 500 }}>— pivot by entity of the ⬇ Download Invoices rows</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Entity</th>
                    {['# Inv', 'Billed', 'Paid', 'Pending', 'Overdue', 'Not Due'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pivotRows.map((r) => {
                    const isTot = r.entity === 'TOTAL'
                    return (
                      <tr key={r.entity} style={isTot ? { borderTop: '2px solid rgba(148,163,184,0.35)' } : undefined}>
                        <td style={{ padding: '6px 8px', borderBottom: isTot ? 'none' : '1px solid rgba(148,163,184,0.1)', color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.entity}</td>
                        <td style={{ padding: '6px 8px', borderBottom: isTot ? 'none' : '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#94a3b8' }}>{r.count}</td>
                        <td style={{ padding: '6px 8px', borderBottom: isTot ? 'none' : '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#f1f5f9' }}>{inr(r.billed)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: isTot ? 'none' : '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#22c55e' }}>{inr(r.paid)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: isTot ? 'none' : '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#a78bfa' }}>{inr(r.pending)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: isTot ? 'none' : '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: r.overdue ? '#ef4444' : '#94a3b8' }}>{inr(r.overdue)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: isTot ? 'none' : '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: r.notdue ? '#06b6d4' : '#94a3b8' }}>{inr(r.notdue)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
              🧾 Entity Split <span style={{ color: '#64748b', fontWeight: 500 }}>— billed vs paid vs outstanding vs deductions (also in the download as the Entity Split sheet)</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
              Billed = Net Payable (Swiggy invoice report). Paid = Swiggy payment statement. Net Outstanding = Billed − Paid. Overdue/Not Due = outstanding portions only.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Entity</th>
                    {['Inv', 'Billed', 'Paid (Statement)', 'Net Outstanding', 'Paid (Confirmed)', 'Overdue', 'Not Due', 'Deductions', 'Adj'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entitySplitRows.map(r => {
                    const isTot = r.entity === 'TOTAL'
                    const st = { padding: '6px 8px', borderBottom: isTot ? 'none' : '1px solid rgba(148,163,184,0.1)', textAlign: 'right' }
                    return (
                      <tr key={r.entity} style={isTot ? { borderTop: '2px solid rgba(148,163,184,0.35)' } : undefined}>
                        <td style={{ padding: '6px 8px', borderBottom: isTot ? 'none' : '1px solid rgba(148,163,184,0.1)', color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.entity}</td>
                        <td style={{ ...st, color: '#94a3b8' }}>{r.invoices}</td>
                        <td style={{ ...st, color: '#f1f5f9' }}>{inr(r.billed)}</td>
                        <td style={{ ...st, color: '#22c55e', fontWeight: 600 }}>{inr(r.paidPayReport)}</td>
                        <td style={{ ...st, color: '#fbbf24', fontWeight: 700 }}>{inr(r.netOutstanding)}</td>
                        <td style={{ ...st, color: '#4ade80' }}>{inr(r.paidConfirmed)}</td>
                        <td style={{ ...st, color: r.overdue ? '#ef4444' : '#64748b', fontWeight: 600 }}>{inr(r.overdue)}</td>
                        <td style={{ ...st, color: '#06b6d4' }}>{inr(r.notOverdue)}</td>
                        <td style={{ ...st, color: r.deductions ? '#f97316' : '#64748b' }}>{r.deductions ? inr(r.deductions) : '—'}</td>
                        <td style={{ ...st, color: r.adj ? '#a78bfa' : '#64748b' }}>{r.adj ? inr(r.adj) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
              📅 Settlement-Date Payment Matches <span style={{ color: '#64748b', fontWeight: 500 }}>— Not-Due invoices with a payment-report payment on the expected settlement date (appointment + 35 days)</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
              {apptMatchRows.length
                ? `${apptMatchRows.length} match(es) found — payment date = expected settlement date (appointment + 35 days, same entity). Total payment ₹${apptMatchRows.reduce((s, r) => s + r.payAmt, 0).toLocaleString('en-IN')}.`
                : 'No settlement-date matches found yet.'}
            </div>
            {apptMatchRows.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Invoice', 'PO #', 'Entity', 'Invoice Total', 'Appointment Date', 'Settlement Date', 'Payment Date', 'Payment Amount', 'Payment Ref', 'Payment Number'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: h === 'Invoice' || h === 'PO #' || h === 'Entity' || h === 'Payment Ref' ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apptMatchRows.map(r => (
                      <tr key={r.num}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{r.num}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{r.po || '—'}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>{r.entity}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(r.total)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(r.apptDate)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#fbbf24', textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(r.settleDate)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#22c55e', textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(r.payDate)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#4ade80', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(r.payAmt)}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{r.payRef || '—'}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{r.payNum || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {uploadMsg && (
            <div style={{ marginBottom: 10, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
              {uploadMsg}
            </div>
          )}

          {overrideCount > 0 && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
              KPI cards, charts and the chase list below show amounts <b style={{ color: '#a78bfa' }}>net of your internal adjustments</b>. Original sheet values are shown in the tooltips. Invoices whose team remark says <b style={{ color: '#a5b4fc' }}>"cancel"</b> are excluded from all figures and marked <b style={{ color: '#a5b4fc' }}>CANCELLED</b> (Final Status).
            </div>
          )}
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
            <b style={{ color: '#22c55e' }}>Paid</b> = Swiggy payment statement (actual money received). <b style={{ color: '#fbbf24' }}>Leftover Pending</b> = Outstanding Payment per invoice in the Swiggy invoice report. All analysis uses only these 2 sheets.
          </div>

          <div className="stats-grid">
            <StatCard
              label="Billed" icon="🧾" color="#3b82f6"
              value={inr(fin.totals.billed)} change={fin.counts.billed + ' invoices'}
            />
            <StatCard
              label="Paid (Payment Statement)" icon="✅" color="#22c55e"
              value={inr(fin.paymentTotal)} change={fin.paymentCount + ' payments as per Swiggy payment statement'}
              changeColor="#22c55e"
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Collected — as per Swiggy payment statement</div>
                  <TooltipRow label="Confirmed on invoices" value={inr(fin.confirmedPaid)} valueColor="#22c55e" />
                  <TooltipRow label="Not yet allocated to invoices" value={inr(Math.max(0, fin.paymentTotal - fin.confirmedPaid))} valueColor="#94a3b8" />
                  <TooltipRow label="Statement vs invoices (diff)" value={inr(fin.reconDiff)} valueColor="#64748b" />
                  <TooltipRow label="Collection rate" value={fin.collectionPct.toFixed(1) + '%'} valueColor="#22c55e" />
                  {fin.overrides.totalAdjustment > 0 && (
                    <>
                      <TooltipRow label="Sheet (gross)" value={inr(fin.overrides.sheetTotals.paid)} valueColor="#94a3b8" />
                      <TooltipRow label="Net after adjustments" value={inr(fin.totals.paid)} valueColor="#22c55e" />
                    </>
                  )}
                </>
              }
            />
            <StatCard
              label="Leftover Pending" icon="⏳" color="#fbbf24"
              value={inr(fin.totals.pending)} change={fin.counts.pending + ' invoices outstanding'}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Leftover Pending = unpaid outstanding (Overdue + Not Due + No Due Date)</div>
                  <TooltipRow label="Overdue" value={inr(fin.totals.overdue)} valueColor="#ef4444" />
                  <TooltipRow label="Not Due" value={inr(fin.totals.notdue)} valueColor="#06b6d4" />
                  {fin.pendingNoDue > 0 && <TooltipRow label="Pending (No Due Date)" value={inr(fin.pendingNoDue)} valueColor="#a855f7" />}
                  <TooltipRow label="Total Pending" value={inr(fin.totals.pending)} valueColor="#fbbf24" />
                  {fin.overrides.totalAdjustment > 0 && (
                    <>
                      <TooltipRow label="Sheet (gross)" value={inr(fin.overrides.sheetTotals.pending)} valueColor="#94a3b8" />
                      <TooltipRow label="Net after adjustments" value={inr(fin.totals.pending)} valueColor="#fbbf24" />
                    </>
                  )}
                </>
              }
            />
            <StatCard
              label="Overdue" icon="🔴" color="#ef4444"
              value={inr(fin.totals.overdue)} change={fin.counts.overdue + ' invoices past due'}
              valueColor="#ef4444"
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Overdue aging</div>
                  {AGE_ORDER.filter(k => fin.overdueAge[k]).map(k => (
                    <TooltipRow key={k} label={k + ' days'} value={inr(fin.overdueAge[k])} valueColor={BUCKET_COLORS[k]} />
                  ))}
                  {fin.overrides.totalAdjustment > 0 && (
                    <>
                      <TooltipRow label="Sheet (gross)" value={inr(fin.overrides.sheetTotals.overdue)} valueColor="#94a3b8" />
                      <TooltipRow label="Net after adjustments" value={inr(fin.totals.overdue)} valueColor="#ef4444" />
                    </>
                  )}
                </>
              }
            />
            <StatCard
              label="Not Due" icon="📅" color="#06b6d4"
              value={inr(fin.totals.notdue)} change={fin.counts.notdue + ' invoices due ahead'}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Due in next</div>
                  {WIN_ORDER.filter(k => fin.notdueWin[k]).map(k => (
                    <TooltipRow key={k} label={k + ' days'} value={inr(fin.notdueWin[k])} valueColor="#06b6d4" />
                  ))}
                  {fin.overrides.totalAdjustment > 0 && (
                    <>
                      <TooltipRow label="Sheet (gross)" value={inr(fin.overrides.sheetTotals.notdue)} valueColor="#94a3b8" />
                      <TooltipRow label="Net after adjustments" value={inr(fin.totals.notdue)} valueColor="#06b6d4" />
                    </>
                  )}
                </>
              }
            />
            <StatCard
              label="Deductions" icon="🧮" color="#f97316"
              value={inr(fin.deductionsTotal)} change="Purchase Return + Other Debit + TDS + Other Adj (invoice report)"
              valueColor={fin.deductionsTotal > 0 ? '#f97316' : '#94a3b8'}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Deductions in the Swiggy invoice report</div>
                  <TooltipRow label="Purchase Return" value={inr(fin.invoices.reduce((s, x) => s + (x.purchaseReturn || 0), 0))} valueColor="#f97316" />
                  <TooltipRow label="Other Debit" value={inr(fin.invoices.reduce((s, x) => s + (x.otherDebit || 0), 0))} valueColor="#f97316" />
                  <TooltipRow label="Brand Discount (Promo Claims)" value={inr(fin.invoices.reduce((s, x) => s + (x.brandDiscount || 0), 0))} valueColor="#f97316" />
                  <TooltipRow label="TDS/TCS" value={inr(fin.invoices.reduce((s, x) => s + (x.tds || 0), 0))} valueColor="#f97316" />
                  <TooltipRow label="Other Adjustments" value={inr(fin.invoices.reduce((s, x) => s + (x.otherAdj || 0), 0))} valueColor="#f97316" />
                </>
              }
            />
          </div>

          {fin.overdueList.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {fin.counts.cancelled > 0 && (
                <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#6366f11a', color: '#a5b4fc', border: '1px solid #6366f140' }} title="Team remark said to cancel/adjust this invoice — excluded from all figures above">
                  🚫 {fin.counts.cancelled} invoice{fin.counts.cancelled > 1 ? 's' : ''} ({inr(fin.totals.cancelled)}) cancelled per team remarks
                </span>
              )}
              <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#ef44441a', color: '#ef4444', border: '1px solid #ef444440' }}>
                🔴 {fin.counts.overdue} overdue invoices — {inr(fin.totals.overdue)} to chase
              </span>
              <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#eab3081a', color: '#eab308', border: '1px solid #eab30840' }}>
                ⏰ {fin.paidLateCount} invoices ({inr(fin.paidLateValue)}) were paid late
              </span>
              <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#fbbf241a', color: '#fbbf24', border: '1px solid #fbbf2440' }}>
                🧾 {fin.counts.pending} leftover pending invoices — {inr(fin.totals.pending)} outstanding
              </span>
            </div>
          )}

          <div className="charts-row" style={{ marginTop: 16 }}>
            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title">Overdue Aging</div>
                <div className="chart-period">invoices past due date</div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={overdueAgeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <ReTooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                    formatter={(value) => [inr(value), '']}
                  />
                  <Bar dataKey="Amount" radius={[4, 4, 0, 0]}>
                    {overdueAgeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title">Due Ahead</div>
                <div className="chart-period">pending invoices by due window</div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={notdueWinData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <ReTooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                    formatter={(value) => [inr(value), '']}
                  />
                  <Bar dataKey="Amount" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="recent-orders" style={{ marginTop: 16 }}>
            <div className="orders-header">
              <div className="orders-title">Receivables by Entity</div>
              <div className="chart-period">Swiggy invoice report + payment statement • billed vs paid vs outstanding</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Invoices</th>
                  <th>Billed</th>
                  <th>Paid</th>
                  <th>Pending</th>
                  <th>Overdue</th>
                  <th>Not Due</th>
                  <th>Coll %</th>
                </tr>
              </thead>
              <tbody>
                {fin.entities.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{e.entity}</td>
                    <td>{e.count}</td>
                    <td style={{ textAlign: 'right' }}>{inr(e.billed)}</td>
                    <td style={{ textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{inr(e.paid)}</td>
                    <td style={{ textAlign: 'right' }}>{inr(e.pending)}</td>
                    <td style={{ textAlign: 'right', color: e.overdue > 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>{inr(e.overdue)}</td>
                    <td style={{ textAlign: 'right' }}>{inr(e.notdue)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: e.coll < 30 ? '#ef4444' : e.coll < 50 ? '#eab308' : '#22c55e' }}>{e.coll.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="recent-orders" style={{ marginTop: 16 }}>
            <div className="orders-header">
              <div className="orders-title">🚨 Overdue Chase List</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 12 }}>
                <div className="chart-period">{fin.overdueList.length} invoices</div>
                <CSVButton makeRows={overdueCsvRows} filename="overdue_chase_list.csv" />
              </div>
            </div>
            <DataTable
              columns={chaseColumns}
              rows={fin.overdueList}
              pageSize={10}
              filename="overdue_chase_list.csv"
              emptyMessage="No overdue invoices"
            />
          </div>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '4px 0 20px' }} />

      {zoho && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="orders-title" style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
              📊 Zoho Master Analysis
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div className="chart-period" title="Zoho invoice details sheet (GE–GT mapped columns). Line items deduped by Invoice ID; repeated invoice-level values taken once.">
                as of {zoho.date} • {zoho.all.count} invoices (600 line items deduped) • Zoho status: {Object.entries(zoho.zohoStatus).map(([s, c]) => `${s} ${c}`).join(' · ')}
              </div>
              <CSVButton makeRows={zohoCsvRows} filename="zoho_master_analysis.csv" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 8, color: '#a78bfa', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                ⬇ Zoho Analysis CSV
              </CSVButton>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
            Master = Zoho invoice details sheet. Billed = Zoho <b style={{ color: '#e2e8f0' }}>Total</b> of invoices with empty FY Remarks column (non-remarks). Mapped = invoices with the GE–GT block filled from the Swiggy invoice report (GRN + payments). Awaiting GRN = invoices with no GRN No.
          </div>

          <div className="stats-grid">
            <StatCard
              label="Billed (Zoho Total, non-remarks)" icon="🧾" color="#3b82f6"
              value={inr(zoho.nonRemarks.total)} change={zoho.nonRemarks.count + ' invoices · FY Remarks blank'}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Total invoice billed</div>
                  <TooltipRow label="All invoices" value={inr(zoho.all.total) + ' (' + zoho.all.count + ')'} valueColor="#94a3b8" />
                  <TooltipRow label="Non-remarks (billed)" value={inr(zoho.nonRemarks.total) + ' (' + zoho.nonRemarks.count + ')'} valueColor="#3b82f6" />
                  <TooltipRow label="Remark-flagged (excluded)" value={inr(zoho.flagged.total) + ' (' + zoho.flagged.count + ')'} valueColor="#ef4444" />
                </>
              }
            />
            <StatCard
              label="Net Billed (after deductions)" icon="🧮" color="#8b5cf6"
              value={inr(zoho.netBilled)} change={'Billed − deductions (' + inr(zoho.deductions.total) + ')'}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Bridge from Billed → Net Payable</div>
                  <TooltipRow label="Billed (gross, non-remarks)" value={inr(zoho.nonRemarks.total)} valueColor="#3b82f6" />
                  <TooltipRow label="− Deductions (mapped)" value={'−' + inr(zoho.deductions.total)} valueColor="#f97316" />
                  <TooltipRow label="= Net Billed" value={inr(zoho.netBilled)} valueColor="#8b5cf6" />
                  <TooltipRow label="− Awaiting GRN (no report match yet)" value={'−' + inr(zoho.bridge.awaitingGrnAmount)} valueColor="#06b6d4" />
                  <TooltipRow label="+ Flagged invoices still in Net Payable" value={'+' + inr(zoho.bridge.flaggedMappedAmount)} valueColor="#ef4444" />
                  <TooltipRow label="≈ Net Payable (167 invoices)" value={inr(zoho.mapped.netPay) + ' (₹12.50 rounding)'} valueColor="#a78bfa" />
                </>
              }
            />
            <StatCard
              label="Net Payable (mapped)" icon="🧮" color="#a78bfa"
              value={inr(zoho.mapped.netPay)} change={zoho.mapped.count + ' invoices matched to the invoice report'}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Mapped GE–GT block (from Swiggy invoice report)</div>
                  {Object.entries(zoho.deductions).filter(([k]) => k !== 'total').map(([k, v]) => (
                    <TooltipRow key={k} label={k} value={inr(v)} valueColor="#f97316" />
                  ))}
                  <TooltipRow label="Total deductions" value={inr(zoho.deductions.total)} valueColor="#f97316" />
                </>
              }
            />
            <StatCard
              label="Paid (mapped Payment amount)" icon="✅" color="#22c55e"
              value={inr(zoho.mapped.paid)} change={zoho.paid.count + ' invoices marked Paid'}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Paid cross-check</div>
                  <TooltipRow label="Payment statement" value={inr(zoho.statement.total) + ' (' + zoho.statement.count + ' payments)'} valueColor="#22c55e" />
                  <TooltipRow label="Mapped on invoices" value={inr(zoho.mapped.paid)} valueColor="#4ade80" />
                  <TooltipRow label="Difference" value={inr(zoho.statement.diff)} valueColor="#64748b" />
                </>
              }
            />
            <StatCard
              label="Outstanding (mapped)" icon="⏳" color="#fbbf24"
              value={inr(zoho.mapped.outstd)} change={`Overdue ${inr(zoho.overdue.amount)} (${zoho.overdue.count}) · Not due ${inr(zoho.notDue.amount)} (${zoho.notDue.count})`}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Outstanding split</div>
                  <TooltipRow label="Overdue (past due date)" value={inr(zoho.overdue.amount) + ' (' + zoho.overdue.count + ')'} valueColor="#ef4444" />
                  <TooltipRow label="Not Due" value={inr(zoho.notDue.amount) + ' (' + zoho.notDue.count + ')'} valueColor="#06b6d4" />
                  {zoho.pendingNoDue.count > 0 && <TooltipRow label="Pending (No Due Date)" value={inr(zoho.pendingNoDue.amount) + ' (' + zoho.pendingNoDue.count + ')'} valueColor="#a855f7" />}
                  <TooltipRow label="Total outstanding" value={inr(zoho.mapped.outstd)} valueColor="#fbbf24" />
                </>
              }
            />
            <StatCard
              label="Overdue (mapped)" icon="🔴" color="#ef4444"
              value={inr(zoho.overdue.amount)} change={zoho.overdue.count + ' invoices past due'}
              valueColor="#ef4444"
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Overdue aging — outstanding past due date</div>
                  {AGE_ORDER.filter(k => zoho.overdueAge[k]).map(k => (
                    <TooltipRow key={k} label={k + ' days'} value={inr(zoho.overdueAge[k]) + ' (' + (zoho.overdueAgeCount[k] || 0) + ')'} valueColor={BUCKET_COLORS[k]} />
                  ))}
                  {zoho.overdue.count === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>None</div>}
                  {zoho.lists.overdueList.slice(0, 8).map(x => (
                    <div key={x.id} style={{ fontSize: 11, fontFamily: 'monospace', color: '#ef4444' }}>{x.num} · {inr(x.outstd)} · due {iso(x.due)}</div>
                  ))}
                  {zoho.overdue.count > 8 && <div style={{ fontSize: 11, color: '#94a3b8' }}>...and {zoho.overdue.count - 8} more</div>}
                </>
              }
              tooltipStyle={{ maxHeight: 260, overflowY: 'auto', whiteSpace: 'normal' }}
            />
            <StatCard
              label="Awaiting GRN" icon="📦" color="#06b6d4"
              value={inr(zoho.awaitingGrn.nonRemarksTotal)} change={zoho.awaitingGrn.nonRemarksCount + ' non-remarks invoices without GRN No.'}
              valueColor="#06b6d4"
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Awaiting for GRN (non-remarks invoices only)</div>
                  <TooltipRow label="Invoices without GRN No." value={zoho.awaitingGrn.nonRemarksCount} valueColor="#06b6d4" />
                  <TooltipRow label="Their Zoho Total" value={inr(zoho.awaitingGrn.nonRemarksTotal)} valueColor="#06b6d4" />
                  <TooltipRow label="Balance (unpaid)" value={inr(zoho.awaitingGrn.nonRemarksBalance)} valueColor="#06b6d4" />
                  <TooltipRow label="Remark-flagged excluded" value={zoho.awaitingGrn.count - zoho.awaitingGrn.nonRemarksCount + ' invoices (' + inr(zoho.awaitingGrn.total - zoho.awaitingGrn.nonRemarksTotal) + ')'} valueColor="#ef4444" />
                </>
              }
            />
            <StatCard
              label="Deductions (mapped)" icon="📉" color="#f97316"
              value={inr(zoho.deductions.total)} change="Purchase Return + Brand discount + Other Debit + Other adj"
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Deductions in the GE–GT block</div>
                  <TooltipRow label="Purchase Return" value={inr(zoho.deductions.purchaseReturn)} valueColor="#f97316" />
                  <TooltipRow label="Brand discount (Promo Claims)" value={inr(zoho.deductions.brandDiscount)} valueColor="#f97316" />
                  <TooltipRow label="Other Debit" value={inr(zoho.deductions.otherDebit)} valueColor="#f97316" />
                  <TooltipRow label="Other adjustments" value={inr(zoho.deductions.otherAdj)} valueColor="#f97316" />
                </>
              }
            />
          </div>

          <div style={{ marginBottom: 16, marginTop: 12, padding: 14, borderRadius: 10, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>
              💳 Paid Cross-Check <span style={{ color: '#64748b', fontWeight: 500 }}>— Swiggy payment statement vs Payment amount mapped on the Zoho sheet (GE–GT block)</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Entity', 'Payment Statement', 'Mapped on Invoices', 'Difference'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: h === 'Entity' ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zoho.entities.map(r => {
                    const diff = Math.abs(r.statementPaid - r.paid)
                    return (
                      <tr key={r.entity}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.entity}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#22c55e', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.statementPaid ? inr(r.statementPaid) : '—'}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#4ade80', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.paid ? inr(r.paid) : '—'}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: diff > 0 ? '#fbbf24' : '#64748b', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{diff > 0 ? inr(diff) : '—'}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '2px solid rgba(148,163,184,0.35)' }}>
                    <td style={{ padding: '8px 8px', color: '#e2e8f0', fontWeight: 800, whiteSpace: 'nowrap' }}>TOTAL</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#22c55e', fontWeight: 800 }}>{inr(zoho.statement.total)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#4ade80', fontWeight: 800 }}>{inr(zoho.mapped.paid)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: zoho.statement.diff > 0 ? '#fbbf24' : '#64748b', fontWeight: 800 }}>{inr(zoho.statement.diff)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {zoho.statement.diff > 0 && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                Difference = statement payments not yet allocated to invoices (e.g. the {`_Reversed`} rows excluded from the invoice report).
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                ⏳ Pending Details <span style={{ color: '#64748b', fontWeight: 500 }}>— outstanding per mapped block: Overdue + Not Due + No Due Date</span>
              </div>
              <CSVButton makeRows={zohoPendingCsvRows} filename="zoho_pending.csv" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>⬇ Pending CSV</CSVButton>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
              {zoho.overdue.count + zoho.notDue.count + zoho.pendingNoDue.count} unpaid invoices · ₹{Math.round(zoho.overdue.amount + zoho.notDue.amount + zoho.pendingNoDue.amount).toLocaleString('en-IN')} total pending (outstanding as per mapped block).
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Category</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Invoices</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#ef4444', fontWeight: 700, whiteSpace: 'nowrap' }}>🔴 Overdue</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#94a3b8' }}>{zoho.overdue.count}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{inr(zoho.overdue.amount)}</td>
                  </tr>
                  {AGE_ORDER.filter(k => zoho.overdueAge[k]).map(k => (
                    <tr key={k}>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>{k} days past due</td>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#64748b' }}>{zoho.overdueAgeCount[k] || 0}</td>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: BUCKET_COLORS[k] }}>{inr(zoho.overdueAge[k])}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#06b6d4', fontWeight: 700, whiteSpace: 'nowrap' }}>📅 Not Due</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#94a3b8' }}>{zoho.notDue.count}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#06b6d4', fontWeight: 700 }}>{inr(zoho.notDue.amount)}</td>
                  </tr>
                  {WIN_ORDER.filter(k => zoho.notdueWin[k]).map(k => (
                    <tr key={k}>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>due in {k} days</td>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#64748b' }}>{zoho.notdueWinCount[k] || 0}</td>
                      <td style={{ padding: '4px 8px 4px 28px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#06b6d4' }}>{inr(zoho.notdueWin[k])}</td>
                    </tr>
                  ))}
                  {zoho.pendingNoDue.count > 0 && (
                    <tr>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#a855f7', whiteSpace: 'nowrap' }}>Pending (No Due Date)</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#94a3b8' }}>{zoho.pendingNoDue.count}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', textAlign: 'right', color: '#a855f7' }}>{inr(zoho.pendingNoDue.amount)}</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: '2px solid rgba(148,163,184,0.35)' }}>
                    <td style={{ padding: '8px 8px', color: '#e2e8f0', fontWeight: 800, whiteSpace: 'nowrap' }}>⏳ TOTAL PENDING</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#e2e8f0', fontWeight: 800 }}>{zoho.overdue.count + zoho.notDue.count + zoho.pendingNoDue.count}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#fbbf24', fontWeight: 800 }}>{inr(zoho.overdue.amount + zoho.notDue.amount + zoho.pendingNoDue.amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>
              🧾 Entity Summary <span style={{ color: '#64748b', fontWeight: 500 }}>— Zoho master, per entity</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Entity', 'Invoices', 'Billed (non-remarks)', 'Net Payable', 'Paid (mapped)', 'Outstanding', 'Awaiting GRN', 'Flagged (remarks)'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: h === 'Entity' ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zoho.entities.map(r => (
                    <tr key={r.entity}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.entity}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.invoices}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(r.billed)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#a78bfa', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.netPay ? inr(r.netPay) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#22c55e', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.paid ? inr(r.paid) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#fbbf24', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.outstd ? inr(r.outstd) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#06b6d4', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.awaitingGrn ? `${r.awaitingGrn} (${inr(r.awaitingGrnTotal)})` : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#ef4444', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.flagged ? `${r.flagged} (${inr(r.flaggedTotal)})` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                🗂 All Zoho Invoices <span style={{ color: '#64748b', fontWeight: 500 }}>— {zoho.all.count} invoices, GE–GT mapped columns</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Invoice', 'Entity', 'Zoho Status', 'Remarks', 'Total', 'GRN No.', 'Net Payable', 'Paid', 'Outstanding', 'Due Date', 'Overdue', 'Payment Status', 'Appt Date'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: ['Invoice', 'Entity', 'Remarks', 'GRN No.', 'Payment Status'].includes(h) ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zoho.invoices.map(x => (
                    <tr key={x.id}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{x.num}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>{x.entity}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: x.zohoStatus === 'Overdue' ? '#ef4444' : x.zohoStatus === 'Void' ? '#64748b' : '#94a3b8', whiteSpace: 'nowrap' }}>{x.zohoStatus}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontSize: 11, whiteSpace: 'nowrap' }}>{x.flagged ? <span style={{ color: '#ef4444', fontWeight: 600 }}>{x.remarks}</span> : <span style={{ color: '#475569' }}>—</span>}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(x.total)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: x.grnNo ? '#94a3b8' : '#06b6d4', whiteSpace: 'nowrap' }}>{x.grnNo || <span style={{ fontWeight: 600 }}>awaiting</span>}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#a78bfa', textAlign: 'right', whiteSpace: 'nowrap' }}>{x.mapped ? inr(x.netPay) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: x.payAmt > 0 ? '#22c55e' : '#64748b', textAlign: 'right', whiteSpace: 'nowrap' }}>{x.payAmt > 0 ? inr(x.payAmt) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: x.cls === 'OVERDUE' ? '#ef4444' : x.outstd > 0 ? '#fbbf24' : '#64748b', fontWeight: x.outstd > 0 ? 700 : 400, textAlign: 'right', whiteSpace: 'nowrap' }}>{x.outstd > 0 ? inr(x.outstd) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(x.due)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: x.overdueLabel === 'Overdue' ? '#ef4444' : '#64748b', textAlign: 'right', whiteSpace: 'nowrap' }}>{x.overdueLabel || '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontSize: 11, whiteSpace: 'nowrap' }}>{x.payStatus ? <span style={{ color: x.payStatus === 'Paid' ? '#22c55e' : '#94a3b8' }}>{x.payStatus}</span> : <span style={{ color: '#475569' }}>—</span>}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(x.appt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '4px 0 20px' }} />

      {mfin && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="orders-title" style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
              📊 Master PO Finance (AU–BG)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div className="chart-period" title="Master PO data sheet (columns AU–BG). POs with Invoices recorded > 0. Due Date drives overdue; paid = Payment amount > 0 or Payment Status Paid/Partially Paid.">
                as of {mfin.date} • {mfin.count} invoiced POs • Net Payable {inr(mfin.netPayable)}
              </div>
              <CSVButton makeRows={masterCsvRows} filename="master_po_finance.csv" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                ⬇ Master PO Finance CSV
              </CSVButton>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
            Source = Master PO data (columns AU–BG). Billed = <b style={{ color: '#e2e8f0' }}>Invoices recorded</b>. Net Payable = <b style={{ color: '#e2e8f0' }}>Net Payable Amount</b>. Paid = Payment amount. Outstanding = Outstanding payment. Overdue by Due Date; paid when Payment amount &gt; 0 or Payment Status = Paid/Partially Paid. (Not scoped by the date filter below — covers all invoiced POs.)
          </div>

          <div className="stats-grid">
            <StatCard label="Invoices Recorded (Billed)" icon="🧾" color="#3b82f6" value={inr(mfin.billed)} change={mfin.count + ' invoiced POs'} />
            <StatCard label="Net Payable" icon="🧮" color="#a78bfa" value={inr(mfin.netPayable)} change="Net Payable Amount" />
            <StatCard label="Paid" icon="✅" color="#22c55e" value={inr(mfin.paid)} change={mfin.paidCount + ' POs'} />
            <StatCard label="Outstanding" icon="⏳" color="#fbbf24" value={inr(mfin.outstanding)} change="Outstanding payment" />
            <StatCard
              label="Overdue" icon="🔴" color="#ef4444"
              value={mfin.overdue.count}
              valueColor={mfin.overdue.count > 0 ? '#ef4444' : '#22c55e'}
              change={mfin.overdue.count > 0 ? inr(mfin.overdue.amount) + ' overdue' : 'No overdue'}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Overdue (Due Date &lt; today, unpaid)</div>
                  {['0-10', '11-20', '21-30', '30+'].map(a => (
                    <TooltipRow key={a} label={a + ' days'} value={inr(mfin.overdueAge[a]) + ' (' + mfin.overdueAgeCount[a] + ')'} valueColor={mfin.overdueAge[a] > 0 ? '#ef4444' : '#64748b'} />
                  ))}
                </>
              }
            />
            <StatCard
              label="Deductions" icon="➖" color="#f97316"
              value={inr(mfin.deductions.total)}
              change={'PR ' + inr(mfin.deductions.purchaseReturn) + ' · Other Debit ' + inr(mfin.deductions.otherDebit)}
              tooltip={
                <>
                  <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Deductions from Net Payable</div>
                  <TooltipRow label="Purchase Return" value={inr(mfin.deductions.purchaseReturn)} valueColor="#f97316" />
                  <TooltipRow label="Brand Discount" value={inr(mfin.deductions.brandDiscount)} valueColor="#f97316" />
                  <TooltipRow label="Other Debit" value={inr(mfin.deductions.otherDebit)} valueColor="#f97316" />
                  <TooltipRow label="Other Adjustments" value={inr(mfin.deductions.otherAdj)} valueColor="#f97316" />
                  <TooltipRow label="TDS/TCS" value={inr(mfin.deductions.tds)} valueColor="#f97316" />
                  <TooltipRow label="Total" value={inr(mfin.deductions.total)} valueColor="#e2e8f0" />
                </>
              }
            />
          </div>

          <div className="recent-orders" style={{ marginTop: 16 }}>
            <div className="orders-header">
              <div className="orders-title">⏳ Pending Details <span style={{ color: '#64748b', fontWeight: 500 }}>— outstanding per Master PO data: Overdue + Not Due</span></div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 700, marginBottom: 8 }}>Overdue by Age</div>
                <table>
                  <thead><tr><th>Bucket</th><th>Amount</th><th># POs</th></tr></thead>
                  <tbody>
                    {['0-10', '11-20', '21-30', '30+'].map(a => (
                      <tr key={a}>
                        <td style={{ padding: '4px 8px', color: '#94a3b8' }}>{a} days</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: mfin.overdueAge[a] > 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>{inr(mfin.overdueAge[a])}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>{mfin.overdueAgeCount[a]}</td>
                      </tr>
                    ))}
                    <tr><td style={{ padding: '4px 8px', fontWeight: 700, borderTop: '1px solid rgba(148,163,184,0.2)' }}>Total Overdue</td><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: '#ef4444', borderTop: '1px solid rgba(148,163,184,0.2)' }}>{inr(mfin.overdue.amount)}</td><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, borderTop: '1px solid rgba(148,163,184,0.2)' }}>{mfin.overdue.count}</td></tr>
                  </tbody>
                </table>
              </div>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 13, color: '#06b6d4', fontWeight: 700, marginBottom: 8 }}>Not Due by Window</div>
                <table>
                  <thead><tr><th>Window</th><th>Amount</th><th># POs</th></tr></thead>
                  <tbody>
                    {['0-10', '11-20', '21-30', '30+'].map(w => (
                      <tr key={w}>
                        <td style={{ padding: '4px 8px', color: '#94a3b8' }}>{w} days</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: mfin.notdueWin[w] > 0 ? '#06b6d4' : '#64748b', fontWeight: 600 }}>{inr(mfin.notdueWin[w])}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>{mfin.notdueWinCount[w]}</td>
                      </tr>
                    ))}
                    <tr><td style={{ padding: '4px 8px', fontWeight: 700, borderTop: '1px solid rgba(148,163,184,0.2)' }}>Total Not Due</td><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: '#06b6d4', borderTop: '1px solid rgba(148,163,184,0.2)' }}>{inr(mfin.notDue.amount)}</td><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, borderTop: '1px solid rgba(148,163,184,0.2)' }}>{mfin.notDue.count}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="recent-orders" style={{ marginTop: 16 }}>
            <div className="orders-header">
              <div className="orders-title">Receivables by Entity</div>
              <div className="chart-period">Master PO data • billed vs paid vs outstanding</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Entity</th><th>POs</th><th>Billed</th><th>Net Payable</th><th>Paid</th><th>Outstanding</th><th>Overdue</th><th>Not Due</th>
                </tr>
              </thead>
              <tbody>
                {mfin.entities.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{e.entity}</td>
                    <td>{e.count}</td>
                    <td style={{ textAlign: 'right' }}>{inr(e.billed)}</td>
                    <td style={{ textAlign: 'right', color: '#a78bfa' }}>{inr(e.netPay)}</td>
                    <td style={{ textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{inr(e.paid)}</td>
                    <td style={{ textAlign: 'right' }}>{inr(e.outstanding)}</td>
                    <td style={{ textAlign: 'right', color: e.overdue > 0 ? '#ef4444' : '#64748b', fontWeight: 600 }}>{inr(e.overdue)}</td>
                    <td style={{ textAlign: 'right' }}>{inr(e.notdue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="recent-orders" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                🗂 All Master PO Finance <span style={{ color: '#64748b', fontWeight: 500 }}>— {mfin.count} invoiced POs, columns AU–BG</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['PO', 'Entity', 'Invoices Recorded', 'Net Payable', 'Paid', 'Outstanding', 'Due Date', 'Payment Status', 'Last Payment Date', 'Class'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: ['PO', 'Entity', 'Payment Status', 'Class'].includes(h) ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mfin.invoices.map(x => (
                    <tr key={x.po}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{x.po}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>{x.entity}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(x.billed)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#a78bfa', textAlign: 'right', whiteSpace: 'nowrap' }}>{inr(x.netPay)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: x.paid > 0 ? '#22c55e' : '#64748b', textAlign: 'right', whiteSpace: 'nowrap' }}>{x.paid > 0 ? inr(x.paid) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: x.cls === 'OVERDUE' ? '#ef4444' : x.outstd > 0 ? '#fbbf24' : '#64748b', fontWeight: x.outstd > 0 ? 700 : 400, textAlign: 'right', whiteSpace: 'nowrap' }}>{x.outstd > 0 ? inr(x.outstd) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(x.due)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontSize: 11, whiteSpace: 'nowrap' }}>{x.payStatus ? <span style={{ color: x.payStatus === 'Paid' ? '#22c55e' : '#94a3b8' }}>{x.payStatus}</span> : <span style={{ color: '#475569' }}>—</span>}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{iso(x.lastPay)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid rgba(148,163,184,0.1)', fontSize: 11, fontWeight: 600, color: x.cls === 'OVERDUE' ? '#ef4444' : x.cls === 'NOT_DUE' ? '#fbbf24' : '#22c55e', whiteSpace: 'nowrap' }}>{x.cls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '4px 0 20px' }} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
        <RangePresets onFrom={setDateFrom} onTo={setDateTo} />
        <DateRangePicker from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo} />
      </div>

      <div className="stats-grid">
        <StatCard
          label="Total PO Value" icon="💰" color="#3b82f6"
          value={'₹' + financeMetrics.totalPOValue.toLocaleString()} change="▲ PO Value with Tax" changeColor="#22c55e"
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>PO Value Summary</div>
              <TooltipRow label="Total" value={'₹' + financeMetrics.totalPOValue.toLocaleString()} valueColor="#3b82f6" />
              <TooltipRow label="Avg per PO" value={'₹' + financeMetrics.avgOrderValue.toLocaleString()} valueColor="#22c55e" />
            </>
          }
        />
        <StatCard
          label="Avg Order Value" icon="📊" color="#a855f7"
          value={'₹' + financeMetrics.avgOrderValue.toLocaleString()} change="Average PO value"
        />
        <StatCard
          label="Pending Settlement" icon="📋" color="#ef4444"
          value={'₹' + financeMetrics.pendingSettlement.toLocaleString()}
          valueColor={financeMetrics.pendingSettlement > 0 ? '#ef4444' : '#22c55e'}
          change="DN − Final Settlement"
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Settlement Details</div>
              <TooltipRow label="DN Amount" value={'₹' + financeMetrics.totalDN.toLocaleString()} valueColor="#3b82f6" />
              <TooltipRow label="Final Settlement" value={'₹' + financeMetrics.totalFS.toLocaleString()} valueColor="#22c55e" />
              <TooltipRow label="Pending" value={'₹' + financeMetrics.pendingSettlement.toLocaleString()} valueColor={financeMetrics.pendingSettlement > 0 ? '#ef4444' : '#22c55e'} />
            </>
          }
        />
        <StatCard
          label="Payment Overdue" icon="🔴" color="#eab308"
          value={financeMetrics.overdueCount}
          valueColor={financeMetrics.overdueCount > 0 ? '#ef4444' : '#22c55e'}
          change={financeMetrics.overdueCount > 0 ? 'POs with overdue alerts' : 'No overdue'}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Overdue POs</div>
              {financeMetrics.overduePOs.length === 0 ? <div style={{ fontSize: 12, color: '#94a3b8' }}>None</div> : financeMetrics.overduePOs.slice(0, 10).map(po => (
                <div key={po} style={{ fontSize: 11, fontFamily: 'monospace', color: '#ef4444' }}>{po}</div>
              ))}
              {financeMetrics.overduePOs.length > 10 && <div style={{ fontSize: 11, color: '#94a3b8' }}>...and {financeMetrics.overduePOs.length - 10} more</div>}
            </>
          }
          tooltipStyle={{ maxHeight: 260, overflowY: 'auto', whiteSpace: 'normal' }}
        />
        <StatCard
          label="Invoices Issued" icon="📄" color="#22c55e"
          value={financeMetrics.invoiceCount} change={`Of ${financeMetrics.totalOrders} POs`} changeColor="#94a3b8"
        />
        <StatCard
          label="Total Invoice Value" icon="🧾" color="#06b6d4"
          value={'₹' + financeMetrics.totalInvoiceValue.toLocaleString()}
          change="Sum of Invoice Value" changeColor="#94a3b8"
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Invoice Summary</div>
              <TooltipRow label="Invoice Value" value={'₹' + financeMetrics.totalInvoiceValue.toLocaleString()} valueColor="#06b6d4" />
              <TooltipRow label="PO Value" value={'₹' + financeMetrics.totalPOValue.toLocaleString()} valueColor="#3b82f6" />
              <TooltipRow label="Invoices Issued" value={financeMetrics.invoiceCount + ' of ' + financeMetrics.totalOrders + ' POs'} valueColor="#22c55e" />
            </>
          }
        />
        <StatCard
          label="Received Amount" icon="✅" color="#f97316"
          value={'₹' + financeMetrics.receivedAmount.toLocaleString()}
          valueColor={financeMetrics.receivedAmount > 0 ? '#22c55e' : '#94a3b8'}
          change={financeMetrics.receivedAmount > 0 ? 'From Payment status column' : 'No payments recorded yet'}
          tooltip={
            <>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 8 }}>Received Amount</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Sum of amounts in the "Payment status" column of the source sheet (e.g. "Received 50,000"). Empty or "Paid" without amount counts ₹0.</div>
              <TooltipRow label="Received" value={'₹' + financeMetrics.receivedAmount.toLocaleString()} valueColor="#22c55e" />
              <TooltipRow label="Outstanding" value={'₹' + Math.max(0, financeMetrics.totalInvoiceValue - financeMetrics.receivedAmount).toLocaleString()} valueColor="#ef4444" />
            </>
          }
        />
      </div>

      <div className="charts-row" style={{ marginBottom: 20 }}>
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Entity-wise Value</div>
            <div className="chart-period">PO Value, DN & Settlement</div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={entityChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <ReTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                formatter={(value) => ['₹' + value.toLocaleString(), '']}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="PO Value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="DN Amount" fill="#a855f7" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Settlement" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">Settlement Status</div>
            <div className="chart-period">Settled vs Pending</div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={settlementPieData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine
              >
                {settlementPieData.map((entry, index) => (
                  <Cell key={index} fill={index === 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Pie>
              <ReTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                formatter={(value) => ['₹' + value.toLocaleString(), 'Value']}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="recent-orders">
        <div className="orders-header">
          <div className="orders-title">Entity-wise Finance Summary</div>
          <div className="chart-period">{financeMetrics.entityWise.length} entities</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Orders</th>
              <th>Invoices</th>
              <th>PO Value</th>
              <th>Invoice Value</th>
              <th>Received</th>
              <th>DN Amount</th>
              <th>Final Settlement</th>
              <th>Overdue</th>
            </tr>
          </thead>
          <tbody>
            {financeMetrics.entityWise.map((row, i) => {
              return (
                <tr key={i}>
                  <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{row.entity}</td>
                  <td>{row.orders}</td>
                  <td>{row.invoices}</td>
                  <td style={{ textAlign: 'right' }}>₹{Math.round(row.poValue).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>₹{Math.round(row.invoiceValue).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: row.received > 0 ? '#22c55e' : '#94a3b8', fontWeight: 600 }}>₹{Math.round(row.received).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>₹{Math.round(row.dn).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>₹{Math.round(row.fs).toLocaleString()}</td>
                  <td><span style={{ color: row.overdueCount > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{row.overdueCount}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="recent-orders">
        <div className="orders-header">
          <div className="orders-title">PO-wise DN & Settlement Details</div>
          <div className="chart-period">All POs • click a row for details</div>
        </div>
        <DataTable
          columns={[
            { key: 'po', label: 'PO #', accessor: r => r['PO Number'], render: r => <PONumberLink row={r} onOpenPO={onOpenPO} /> },
            { key: 'entity', label: 'Entity', accessor: r => r['Entity'], render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r['Entity']}</span> },
            { key: 'invoice', label: 'Invoice', accessor: r => r['Invoice No'] || '—', render: r => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r['Invoice No'] || '—'}</span> },
            { key: 'value', label: 'PO Value', accessor: r => num(r['PO Value with Tax']), align: 'right', render: r => '₹' + num(r['PO Value with Tax']).toLocaleString() },
            { key: 'invvalue', label: 'Invoice Value', accessor: r => num(r['Invoice Value']), align: 'right', render: r => num(r['Invoice Value']) ? '₹' + num(r['Invoice Value']).toLocaleString() : '—' },
            { key: 'received', label: 'Received', accessor: r => receivedFor(r), align: 'right', render: r => receivedFor(r) ? '₹' + receivedFor(r).toLocaleString() : '—' },
            { key: 'dn', label: 'DN Amount', accessor: r => num(r['DN amount']), align: 'right', render: r => num(r['DN amount']) ? '₹' + num(r['DN amount']).toLocaleString() : '—' },
            { key: 'fs', label: 'Final Settlement', accessor: r => num(r['Final Settlement']), align: 'right', render: r => num(r['Final Settlement']) ? '₹' + num(r['Final Settlement']).toLocaleString() : '—' },
            { key: 'pstatus', label: 'Payment Status', accessor: r => r['Payment status'] || '—', render: r => <span style={{ color: (r['Payment status'] || '').trim() ? '#22c55e' : '#64748b', fontSize: 12 }}>{r['Payment status'] || '—'}</span> },
            { key: 'overdue', label: 'Overdue Alert', accessor: r => r['Payment Overdue Alert'] || '—', render: r => <span style={{ color: (r['Payment Overdue Alert'] || '').toLowerCase().includes('overdue') ? '#ef4444' : '#64748b', fontSize: 12 }}>{r['Payment Overdue Alert'] || '—'}</span> },
          ]}
          rows={poData}
          pageSize={10}
          filename="finance_po_settlement.csv"
          onRowClick={onOpenPO}
          emptyMessage="No POs"
        />
      </div>
    </>
  )
}