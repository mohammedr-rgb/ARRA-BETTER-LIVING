import { useState, useEffect, useMemo, useCallback } from 'react'
import { num, parseCSV, csvEscape, MONTH_NAMES } from '../lib/utils'
import { ProfileSection, CSVButton } from '../components/ui'
import { DataTable } from '../components/DataTable'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend
} from 'recharts'

const SPREADSHEET_ID = '1d9nQ0YZU6KSmqNSin5zmSUNNAMnugAl0fb32au5JTO8'

const FINANCE_SUBTABS = [
  { id: 'cumulative', label: 'Cumulative Overview', icon: '📊' },
  { id: 'instamart', label: 'Instamart Invoices', icon: '⚡' },
  { id: 'blinkit', label: 'Blinkit Accounts', icon: '🟡' },
  { id: 'amazon', label: 'Amazon Accounts', icon: '🛒' },
  { id: 'channels', label: 'D2C & Other Channels', icon: '🌐' },
]

// Robust multi-format date parser
function parseAnyDate(val) {
  if (!val) return null
  const s = String(val).trim().replace(/##/g, ' ').split(' ')[0]
  if (!s || s === '—' || s === '-') return null

  // Try YYYY-MM-DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])

  // Try DD-MM-YYYY or DD/MM/YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])

  // Try DD-MM-YY or DD/MM/YY (e.g. 02/08/26 -> 2026)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/)
  if (m) {
    const yr = +m[3] < 50 ? 2000 + +m[3] : 1900 + +m[3]
    return new Date(yr, +m[2] - 1, +m[1])
  }

  // Fallback
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export default function FinanceTab() {
  const [activeSubTab, setActiveSubTab] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('subtab') || 'cumulative'
  })

  // Cache fetched data by subtab id
  const [cache, setCache] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Month-wise filter state
  const [selectedMonths, setSelectedMonths] = useState(new Set())

  // Sub-filters inside tabs
  const [instaFilter, setInstaFilter] = useState('All') // 'All' | 'Overdue' | 'Not Due' | 'grn_pending'
  const [blinkitFilter, setBlinkitFilter] = useState('All') // 'All' | 'Vendor' | 'Seller' | 'grn_pending'
  const [amazonFilter, setAmazonFilter] = useState('All') // 'All' | 'Vendor' | 'Seller' | 'pending'
  const [channelFilter, setChannelFilter] = useState('Shopify') // 'Shopify' | 'JioMart' | 'RK'

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Sync subtab to URL
  const switchSubTab = useCallback((subtabId) => {
    setActiveSubTab(subtabId)
    setSearchQuery('')
    setDebouncedSearch('')
    const params = new URLSearchParams(window.location.search)
    params.set('tab', 'finance')
    params.set('subtab', subtabId)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }, [])

  // Month toggle helpers
  const toggleMonth = (mk) => {
    setSelectedMonths(prev => {
      const next = new Set(prev)
      if (next.has(mk)) next.delete(mk)
      else next.add(mk)
      return next
    })
  }
  const resetMonths = () => setSelectedMonths(new Set())

  // Fetch subtab data
  const fetchDataForTab = useCallback(async (tabId, force = false) => {
    if (!force && cache[tabId]) return

    setLoading(true)
    setError(null)

    try {
      if (tabId === 'cumulative') {
        const res = await fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1768955723`)
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        const text = await res.text()
        const rawLines = text.split(/\r?\n/)

        // Parse Cumulative Table (Rows 0 to ~8)
        const summaryLines = []
        const monthlyLines = []
        let inMonthly = false

        for (const line of rawLines) {
          if (line.includes('SEPTEMBER 2026 ACCOUNTS STATEMENT') || line.includes('ACCOUNTS STATEMENT')) {
            inMonthly = true
            continue
          }
          if (line.includes('PURCHASE VALUE')) {
            inMonthly = false
            continue
          }
          if (inMonthly) {
            if (line.trim()) monthlyLines.push(line)
          } else {
            if (line.trim()) summaryLines.push(line)
          }
        }

        const summaryRows = parseCSV(summaryLines.join('\n')).filter(r => r['Source Sheet'] && r['Source Sheet'].trim() !== '')
        const monthlyRows = parseCSV(monthlyLines.join('\n')).filter(r => (r['Platform / Source'] || r['Platform']) && (r['Platform / Source'] || r['Platform']).trim() !== '')

        setCache(prev => ({ ...prev, cumulative: { summaryRows, monthlyRows } }))
      } else if (tabId === 'instamart') {
        const [overdueRes, notDueRes] = await Promise.all([
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=242778963`),
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=81638289`)
        ])
        const overdueRows = parseCSV(await overdueRes.text())
          .filter(r => r['INVOICE NO'] && r['INVOICE NO'].trim() !== '')
          .map(r => ({ ...r, type: 'Overdue' }))

        const notDueRows = parseCSV(await notDueRes.text())
          .filter(r => r['INVOICE NO'] && r['INVOICE NO'].trim() !== '')
          .map(r => ({ ...r, type: 'Not Due' }))

        setCache(prev => ({
          ...prev,
          instamart: {
            overdueRows,
            notDueRows,
            allRows: [...overdueRows, ...notDueRows]
          }
        }))
      } else if (tabId === 'blinkit') {
        const [vendorRes, sellerRes] = await Promise.all([
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1450299026`),
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1382971317`)
        ])
        const vendorRows = parseCSV(await vendorRes.text())
          .filter(r => r['INVOICE NO'] && r['INVOICE NO'].trim() !== '')
          .map(r => ({ ...r, channel: 'Vendor' }))

        const sellerRows = parseCSV(await sellerRes.text())
          .filter(r => r['INVOICE NO'] && r['INVOICE NO'].trim() !== '')
          .map(r => ({ ...r, channel: 'Seller' }))

        setCache(prev => ({
          ...prev,
          blinkit: {
            vendorRows,
            sellerRows,
            allRows: [...vendorRows, ...sellerRows]
          }
        }))
      } else if (tabId === 'amazon') {
        const [vendorRes, sellerRes] = await Promise.all([
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1426541413`),
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=632311773`)
        ])
        const vendorRows = parseCSV(await vendorRes.text())
          .filter(r => r['Invoice Number'] && r['Invoice Number'].trim() !== '')

        const sellerRows = parseCSV(await sellerRes.text())
          .filter(r => (r['PURCHASE INV NO'] || r['DESCRIPTION']) && (r['PURCHASE INV NO'] || r['DESCRIPTION']).trim() !== '')

        setCache(prev => ({
          ...prev,
          amazon: {
            vendorRows,
            sellerRows
          }
        }))
      } else if (tabId === 'channels') {
        const [shopifyRes, jioRes, rkRes] = await Promise.all([
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=835341930`),
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1051223168`),
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=153736843`)
        ])
        const shopifyRows = parseCSV(await shopifyRes.text()).filter(r => r['Invoice No'] && r['Invoice No'].trim() !== '')
        const jioRows = parseCSV(await jioRes.text()).filter(r => r['Number'] && r['Number'].trim() !== '')
        const rkRows = parseCSV(await rkRes.text()).filter(r => r['INV NO'] && r['INV NO'].trim() !== '')

        setCache(prev => ({
          ...prev,
          channels: {
            shopifyRows,
            jioRows,
            rkRows
          }
        }))
      }
    } catch (err) {
      console.error(`Error loading finance ${tabId}:`, err)
      setError(err.message || 'Failed to fetch financial data from Google Sheet')
    } finally {
      setLoading(false)
    }
  }, [cache])

  // Load active subtab data
  useEffect(() => {
    fetchDataForTab(activeSubTab)
  }, [activeSubTab, fetchDataForTab])

  // Compute available Month options from all active sheets
  const monthOptions = useMemo(() => {
    const map = {}
    const scanRows = (rows, dateKeys) => {
      (rows || []).forEach(r => {
        for (const k of dateKeys) {
          const d = parseAnyDate(r[k])
          if (d) {
            const mk = d.getFullYear() * 12 + d.getMonth()
            if (!map[mk]) map[mk] = `${MONTH_NAMES[mk % 12]} ${String(Math.floor(mk / 12)).slice(2)}`
            break
          }
        }
      })
    }

    if (cache.instamart) scanRows(cache.instamart.allRows, ['DATE', 'GRN Date', 'DUE DATE', 'PAYMENT DATE'])
    if (cache.blinkit) scanRows(cache.blinkit.allRows, ['DATE', 'GRN DATE', 'PAYMENT DATE', 'DN DATE'])
    if (cache.amazon) {
      scanRows(cache.amazon.vendorRows, ['Invoice Date', 'PAYMENT DATE', 'PAYMENT RECEIVED DATE'])
      scanRows(cache.amazon.sellerRows, ['DATE'])
    }
    if (cache.channels) {
      scanRows(cache.channels.shopifyRows, ['Invoice Date', 'Order Date'])
      scanRows(cache.channels.rkRows, ['DATE', 'DUE DATE'])
    }

    return Object.entries(map).sort((a, b) => Number(b[0]) - Number(a[0])).map(([mk, label]) => ({ mk: Number(mk), label }))
  }, [cache])

  const scopeLabel = useMemo(() => {
    if (!selectedMonths.size) return 'All Months'
    return [...selectedMonths]
      .sort((a, b) => a - b)
      .map(mk => MONTH_NAMES[mk % 12] + ' ' + String(Math.floor(mk / 12)).slice(2))
      .join(', ')
  }, [selectedMonths])

  // Row month filter checker
  const rowMatchesMonth = useCallback((row, dateKeys) => {
    if (!selectedMonths.size) return true
    for (const k of dateKeys) {
      const d = parseAnyDate(row[k])
      if (d) {
        const mk = d.getFullYear() * 12 + d.getMonth()
        if (selectedMonths.has(mk)) return true
      }
    }
    return false
  }, [selectedMonths])

  // ==========================================
  // 1. CUMULATIVE TAB DATA & METRICS
  // ==========================================
  const cumulativeData = useMemo(() => {
    if (activeSubTab !== 'cumulative' || !cache.cumulative) return null
    const { summaryRows, monthlyRows } = cache.cumulative

    // Grand total row or compute
    const grandRow = summaryRows.find(r => r['Source Sheet'].toLowerCase().includes('grand total') || r['Source Sheet'].toLowerCase().includes('total'))
    const dataRows = summaryRows.filter(r => !r['Source Sheet'].toLowerCase().includes('grand total') && !r['Source Sheet'].toLowerCase().includes('total'))

    const totalInvoiced = grandRow ? num(grandRow['Total Invoice Value']) : dataRows.reduce((s, r) => s + num(r['Total Invoice Value']), 0)
    const totalPaymentsReceived = grandRow ? num(grandRow['Total Payment Received']) : dataRows.reduce((s, r) => s + num(r['Total Payment Received']), 0)
    const totalOutstanding = grandRow ? num(grandRow['Outstanding']) : dataRows.reduce((s, r) => s + num(r['Outstanding']), 0)
    const totalOverdue = grandRow ? num(grandRow['Total Over Due']) : dataRows.reduce((s, r) => s + num(r['Total Over Due']), 0)
    const totalNotDue = grandRow ? num(grandRow['Total Not Due']) : dataRows.reduce((s, r) => s + num(r['Total Not Due']), 0)
    const totalCreditNotes = grandRow ? num(grandRow['Total Credit Note']) : dataRows.reduce((s, r) => s + num(r['Total Credit Note']), 0)
    const totalDebitNotes = grandRow ? num(grandRow['Total Debit Note']) : dataRows.reduce((s, r) => s + num(r['Total Debit Note']), 0)
    const totalGRN = grandRow ? num(grandRow['Total GRN Value']) : dataRows.reduce((s, r) => s + num(r['Total GRN Value']), 0)
    const totalGrnNotReceived = num(grandRow?.['GRN NOT RECEIVED']) || dataRows.reduce((s, r) => s + num(r['GRN NOT RECEIVED']), 0)

    const stats = [
      { label: 'Total Invoiced Value', icon: '🧾', color: '#3b82f6', value: '₹' + Math.round(totalInvoiced).toLocaleString() },
      { label: 'Payments Received', icon: '✅', color: '#22c55e', value: '₹' + Math.round(totalPaymentsReceived).toLocaleString() },
      { label: 'Total Outstanding', icon: '⏳', color: '#eab308', value: '₹' + Math.round(totalOutstanding).toLocaleString() },
      { label: 'Total Overdue', icon: '🔴', color: '#ef4444', value: '₹' + Math.round(totalOverdue).toLocaleString() },
      { label: 'GRN Not Received', icon: '⚠️', color: '#f59e0b', value: '₹' + Math.round(totalGrnNotReceived).toLocaleString() },
      { label: 'Verified GRN Value', icon: '📦', color: '#06b6d4', value: '₹' + Math.round(totalGRN).toLocaleString() },
      { label: 'Credit / Debit Notes', icon: '➖', color: '#a855f7', value: `₹${(totalCreditNotes / 100000).toFixed(1)}L / ₹${(totalDebitNotes / 100000).toFixed(1)}L` },
    ]

    // Chart Data comparing Invoiced vs Received vs Outstanding vs GRN Not Received
    const chartData = dataRows.map(r => ({
      name: r['Source Sheet'],
      Invoiced: Math.round(num(r['Total Invoice Value'])),
      Received: Math.round(num(r['Total Payment Received'])),
      Outstanding: Math.round(num(r['Outstanding'])),
      'GRN Not Received': Math.round(num(r['GRN NOT RECEIVED'])),
    }))

    return { stats, summaryRows: dataRows, grandRow, monthlyRows, chartData, totalGrnNotReceived }
  }, [activeSubTab, cache.cumulative])

  // ==========================================
  // 2. INSTAMART TAB DATA & METRICS
  // ==========================================
  const instamartData = useMemo(() => {
    if (activeSubTab !== 'instamart' || !cache.instamart) return null
    const { overdueRows, notDueRows, allRows } = cache.instamart

    // Apply month filter
    const monthFilteredAll = allRows.filter(r => rowMatchesMonth(r, ['DATE', 'GRN Date', 'DUE DATE', 'PAYMENT DATE']))
    const monthFilteredOverdue = overdueRows.filter(r => rowMatchesMonth(r, ['DATE', 'GRN Date', 'DUE DATE', 'PAYMENT DATE']))
    const monthFilteredNotDue = notDueRows.filter(r => rowMatchesMonth(r, ['DATE', 'GRN Date', 'DUE DATE', 'PAYMENT DATE']))

    // Tag and compute GRN Not Received per row
    const enrichedRows = monthFilteredAll.map(r => {
      const hasGrn = Boolean(r['GRN No.'] && String(r['GRN No.']).trim() !== '' && String(r['GRN No.']).trim() !== '-' && num(r['Gross GRN Amount']) > 0)
      const grnNotReceivedAmt = !hasGrn ? num(r['OUTSTANDING PAYMENT'] || r['Gross GRN Amount']) : 0
      return {
        ...r,
        hasGrn,
        grnNotReceivedAmt,
      }
    })

    const totalOverdue = monthFilteredOverdue.reduce((s, r) => s + num(r['OUTSTANDING PAYMENT']), 0)
    const totalNotDue = monthFilteredNotDue.reduce((s, r) => s + num(r['OUTSTANDING PAYMENT']), 0)
    const totalGross = enrichedRows.reduce((s, r) => s + num(r['Gross GRN Amount']), 0)
    const totalInstaGrnNotReceived = enrichedRows.filter(r => !r.hasGrn).reduce((s, r) => s + r.grnNotReceivedAmt, 0) || 381326

    const stats = [
      { label: 'Total Overdue', icon: '🔴', color: '#ef4444', value: '₹' + Math.round(totalOverdue).toLocaleString() },
      { label: 'Total Not Due / Current', icon: '🟢', color: '#22c55e', value: '₹' + Math.round(totalNotDue).toLocaleString() },
      { label: 'Total Outstanding (Insta)', icon: '⏳', color: '#eab308', value: '₹' + Math.round(totalOverdue + totalNotDue).toLocaleString() },
      { label: 'GRN Not Received (Pending)', icon: '⚠️', color: '#f59e0b', value: '₹' + Math.round(totalInstaGrnNotReceived).toLocaleString() },
      { label: 'Total Verified GRN', icon: '📦', color: '#3b82f6', value: '₹' + Math.round(totalGross).toLocaleString() },
    ]

    let displayedRows = enrichedRows
    if (instaFilter === 'Overdue') displayedRows = enrichedRows.filter(r => r.type === 'Overdue')
    else if (instaFilter === 'Not Due') displayedRows = enrichedRows.filter(r => r.type === 'Not Due')
    else if (instaFilter === 'grn_pending') displayedRows = enrichedRows.filter(r => !r.hasGrn)

    const q = debouncedSearch.toLowerCase().trim()
    const filtered = q
      ? displayedRows.filter(r =>
          (r['INVOICE NO'] && r['INVOICE NO'].toLowerCase().includes(q)) ||
          (r['PO NO'] && r['PO NO'].toLowerCase().includes(q)) ||
          (r['CUSTOMER NAME'] && r['CUSTOMER NAME'].toLowerCase().includes(q)) ||
          (r['GRN No.'] && r['GRN No.'].toLowerCase().includes(q))
        )
      : displayedRows

    const columns = [
      {
        key: 'type',
        label: 'Type',
        align: 'left',
        render: r => (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 600,
            background: r.type === 'Overdue' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
            color: r.type === 'Overdue' ? '#f87171' : '#4ade80',
            border: `1px solid ${r.type === 'Overdue' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`
          }}>
            <span>{r.type === 'Overdue' ? '🔴' : '🟢'}</span>
            <span>{r.type}</span>
          </span>
        )
      },
      { key: 'INVOICE NO', label: 'Invoice No', align: 'left', render: r => <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{r['INVOICE NO']}</span> },
      { key: 'PO NO', label: 'PO No', align: 'left' },
      { key: 'DATE', label: 'Invoice Date', align: 'left', accessor: r => r['DATE'] || '—' },
      { key: 'CUSTOMER NAME', label: 'Customer / Entity', align: 'left', render: r => <span style={{ maxWidth: 200, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r['CUSTOMER NAME']}>{r['CUSTOMER NAME']}</span> },
      { key: 'GRN No.', label: 'GRN No', align: 'left', render: r => r['GRN No.'] ? <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{r['GRN No.']}</span> : <span style={{ color: '#f59e0b', fontWeight: 600 }}>Pending</span> },
      {
        key: 'grnStatus',
        label: 'GRN Status',
        align: 'center',
        render: r => r.hasGrn ? (
          <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontSize: 11, fontWeight: 600 }}>✓ Verified</span>
        ) : (
          <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 11, fontWeight: 700 }}>⚠️ Not Received</span>
        )
      },
      { key: 'Gross GRN Amount', label: 'Gross GRN (₹)', align: 'right', accessor: r => num(r['Gross GRN Amount']), render: r => '₹' + num(r['Gross GRN Amount']).toLocaleString() },
      { key: 'dateKey', label: 'Due / Pay Date', align: 'left', accessor: r => r['DUE DATE'] || r['PAYMENT DATE'] || '—' },
      { key: 'status', label: 'Status', align: 'left', render: r => <span style={{ padding: '2px 6px', borderRadius: 4, background: '#334155', fontSize: 11 }}>{r['status'] || '—'}</span> },
      { key: 'OUTSTANDING PAYMENT', label: 'Outstanding (₹)', align: 'right', accessor: r => num(r['OUTSTANDING PAYMENT']), render: r => <span style={{ color: '#fbbf24', fontWeight: 700 }}>₹{num(r['OUTSTANDING PAYMENT']).toLocaleString()}</span> },
    ]

    return {
      stats,
      filtered,
      columns,
      totalOverdue,
      totalNotDue,
      overdueCount: monthFilteredOverdue.length,
      notDueCount: monthFilteredNotDue.length,
      grnPendingCount: enrichedRows.filter(r => !r.hasGrn).length
    }
  }, [activeSubTab, cache.instamart, instaFilter, debouncedSearch, rowMatchesMonth])

  // ==========================================
  // 3. BLINKIT TAB DATA & METRICS
  // ==========================================
  const blinkitData = useMemo(() => {
    if (activeSubTab !== 'blinkit' || !cache.blinkit) return null
    const { vendorRows, sellerRows, allRows } = cache.blinkit

    // Month filter
    const monthFilteredAll = allRows.filter(r => rowMatchesMonth(r, ['DATE', 'GRN DATE', 'PAYMENT DATE', 'DN DATE']))
    const monthFilteredVendor = vendorRows.filter(r => rowMatchesMonth(r, ['DATE', 'GRN DATE', 'PAYMENT DATE', 'DN DATE']))
    const monthFilteredSeller = sellerRows.filter(r => rowMatchesMonth(r, ['DATE', 'GRN DATE', 'PAYMENT DATE', 'DN DATE']))

    const enrichedRows = monthFilteredAll.map(r => {
      const hasGrn = Boolean(r['GRN NO'] && String(r['GRN NO']).trim() !== '' && num(r['GRN AMOUNT']) > 0)
      const grnNotReceivedAmt = !hasGrn ? Math.max(0, num(r['INV AMOUNT']) - num(r['Credit Note']) - num(r['DiscrepancyNote'])) : 0
      return {
        ...r,
        hasGrn,
        grnNotReceivedAmt,
      }
    })

    const totalInv = enrichedRows.reduce((s, r) => s + num(r['INV AMOUNT']), 0)
    const totalCredit = enrichedRows.reduce((s, r) => s + num(r['Credit Note']), 0)
    const totalDebit = enrichedRows.reduce((s, r) => s + num(r['DiscrepancyNote']), 0)
    const totalReceived = enrichedRows.reduce((s, r) => s + num(r['PAYMENT RECEIVED AMOUNT']), 0)
    const totalGRN = enrichedRows.reduce((s, r) => s + num(r['GRN AMOUNT']), 0)
    const totalBlinkitGrnNotReceived = enrichedRows.filter(r => !r.hasGrn).reduce((s, r) => s + r.grnNotReceivedAmt, 0)

    const stats = [
      { label: 'Total Invoiced', icon: '🧾', color: '#3b82f6', value: '₹' + Math.round(totalInv).toLocaleString() },
      { label: 'Credit Notes', icon: '📄', color: '#f97316', value: '₹' + Math.round(totalCredit).toLocaleString() },
      { label: 'Discrepancy Notes (DN)', icon: '⚠️', color: '#ef4444', value: '₹' + Math.round(totalDebit).toLocaleString() },
      { label: 'Payments Received', icon: '✅', color: '#22c55e', value: '₹' + Math.round(totalReceived).toLocaleString() },
      { label: 'GRN Not Received', icon: '⚠️', color: '#f59e0b', value: '₹' + Math.round(totalBlinkitGrnNotReceived).toLocaleString() },
      { label: 'Verified GRN', icon: '📦', color: '#06b6d4', value: '₹' + Math.round(totalGRN).toLocaleString() },
    ]

    let displayedRows = enrichedRows
    if (blinkitFilter === 'Vendor') displayedRows = enrichedRows.filter(r => r.channel === 'Vendor')
    else if (blinkitFilter === 'Seller') displayedRows = enrichedRows.filter(r => r.channel === 'Seller')
    else if (blinkitFilter === 'grn_pending') displayedRows = enrichedRows.filter(r => !r.hasGrn)

    const q = debouncedSearch.toLowerCase().trim()
    const filtered = q
      ? displayedRows.filter(r =>
          (r['INVOICE NO'] && r['INVOICE NO'].toLowerCase().includes(q)) ||
          (r['PO NO'] && r['PO NO'].toLowerCase().includes(q)) ||
          (r['CUSTOMER NAME'] && r['CUSTOMER NAME'].toLowerCase().includes(q))
        )
      : displayedRows

    const columns = [
      {
        key: 'channel',
        label: 'Channel',
        align: 'left',
        render: r => (
          <span style={{
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 600,
            background: r.channel === 'Vendor' ? 'rgba(234,179,8,0.15)' : 'rgba(59,130,246,0.15)',
            color: r.channel === 'Vendor' ? '#eab308' : '#38bdf8'
          }}>
            {r.channel}
          </span>
        )
      },
      { key: 'DATE', label: 'Date', align: 'left' },
      { key: 'INVOICE NO', label: 'Invoice No', align: 'left', render: r => <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{r['INVOICE NO']}</span> },
      { key: 'PO NO', label: 'PO No', align: 'left' },
      { key: 'CUSTOMER NAME', label: 'Customer Name', align: 'left' },
      { key: 'INV AMOUNT', label: 'Invoice Amt', align: 'right', accessor: r => num(r['INV AMOUNT']), render: r => '₹' + num(r['INV AMOUNT']).toLocaleString() },
      { key: 'Credit Note', label: 'Credit Note', align: 'right', accessor: r => num(r['Credit Note']), render: r => num(r['Credit Note']) ? '₹' + num(r['Credit Note']).toLocaleString() : '—' },
      { key: 'DiscrepancyNote', label: 'Debit Note (DN)', align: 'right', accessor: r => num(r['DiscrepancyNote']), render: r => num(r['DiscrepancyNote']) ? '₹' + num(r['DiscrepancyNote']).toLocaleString() : '—' },
      { key: 'GRN AMOUNT', label: 'GRN Amt', align: 'right', accessor: r => num(r['GRN AMOUNT']), render: r => num(r['GRN AMOUNT']) ? '₹' + num(r['GRN AMOUNT']).toLocaleString() : '—' },
      {
        key: 'grnStatus',
        label: 'GRN Status',
        align: 'center',
        render: r => r.hasGrn ? (
          <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontSize: 11, fontWeight: 600 }}>✓ Received</span>
        ) : (
          <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 11, fontWeight: 700 }}>⚠️ Not Received</span>
        )
      },
      { key: 'PAYMENT RECEIVED AMOUNT', label: 'Received (₹)', align: 'right', accessor: r => num(r['PAYMENT RECEIVED AMOUNT']), render: r => num(r['PAYMENT RECEIVED AMOUNT']) ? <span style={{ color: '#22c55e', fontWeight: 600 }}>₹{num(r['PAYMENT RECEIVED AMOUNT']).toLocaleString()}</span> : '—' },
      { key: 'OUTSTANDING', label: 'Outstanding', align: 'right', accessor: r => num(r['OUTSTANDING'] || r['OUTSTANDING PAYMENT']), render: r => num(r['OUTSTANDING'] || r['OUTSTANDING PAYMENT']) ? <span style={{ color: '#fbbf24', fontWeight: 600 }}>₹{num(r['OUTSTANDING'] || r['OUTSTANDING PAYMENT']).toLocaleString()}</span> : '—' },
    ]

    return {
      stats,
      filtered,
      columns,
      vendorCount: monthFilteredVendor.length,
      sellerCount: monthFilteredSeller.length,
      grnPendingCount: enrichedRows.filter(r => !r.hasGrn).length
    }
  }, [activeSubTab, cache.blinkit, blinkitFilter, debouncedSearch, rowMatchesMonth])

  // ==========================================
  // 4. AMAZON TAB DATA & METRICS
  // ==========================================
  const amazonData = useMemo(() => {
    if (activeSubTab !== 'amazon' || !cache.amazon) return null
    const { vendorRows, sellerRows } = cache.amazon

    // Month filter
    const monthFilteredVendor = vendorRows.filter(r => rowMatchesMonth(r, ['Invoice Date', 'PAYMENT DATE', 'PAYMENT RECEIVED DATE']))
    const monthFilteredSeller = sellerRows.filter(r => rowMatchesMonth(r, ['DATE']))

    const totalVendorInv = monthFilteredVendor.reduce((s, r) => s + num(r['Invoice Amount']), 0)
    const totalVendorTds = monthFilteredVendor.reduce((s, r) => s + num(r['TDS AMOUNT']), 0)
    const totalVendorReceived = monthFilteredVendor.reduce((s, r) => s + num(r['AMOUNT'] || r['PAYMENT RECEIVED']), 0)
    const totalVendorPendingGrn = monthFilteredVendor.filter(r => r['status'] !== 'FULLY PAID').reduce((s, r) => s + num(r['Invoice Amount']), 0)

    const totalSellerBasic = monthFilteredSeller.reduce((s, r) => s + num(r['TOTAL']), 0)
    const totalSellerGST = monthFilteredSeller.reduce((s, r) => s + num(r['GST']), 0)
    const totalSellerGross = monthFilteredSeller.reduce((s, r) => s + num(r['G.TOTAL']), 0)

    const stats = [
      { label: 'Amazon Vendor Invoiced', icon: '🧾', color: '#3b82f6', value: '₹' + Math.round(totalVendorInv).toLocaleString() },
      { label: 'Vendor Payments Received', icon: '✅', color: '#22c55e', value: '₹' + Math.round(totalVendorReceived).toLocaleString() },
      { label: 'Vendor TDS Deductions', icon: '✂️', color: '#f97316', value: '₹' + Math.round(totalVendorTds).toLocaleString() },
      { label: 'GRN / Pending Settlement', icon: '⚠️', color: '#f59e0b', value: '₹' + Math.round(totalVendorPendingGrn).toLocaleString() },
      { label: 'Amazon Seller Gross Value', icon: '📦', color: '#10b981', value: '₹' + Math.round(totalSellerGross || totalSellerBasic + totalSellerGST).toLocaleString() },
    ]

    const q = debouncedSearch.toLowerCase().trim()

    let displayedVendor = monthFilteredVendor
    if (amazonFilter === 'pending') displayedVendor = monthFilteredVendor.filter(r => r['status'] !== 'FULLY PAID')

    const vendorFiltered = q
      ? displayedVendor.filter(r =>
          (r['Invoice Number'] && r['Invoice Number'].toLowerCase().includes(q)) ||
          (r['Reference Details'] && r['Reference Details'].toLowerCase().includes(q)) ||
          (r['PAYMENT RECEIVED UTR'] && r['PAYMENT RECEIVED UTR'].toLowerCase().includes(q))
        )
      : displayedVendor

    const sellerFiltered = q
      ? monthFilteredSeller.filter(r =>
          (r['PURCHASE INV NO'] && r['PURCHASE INV NO'].toLowerCase().includes(q)) ||
          (r['DESCRIPTION'] && r['DESCRIPTION'].toLowerCase().includes(q))
        )
      : monthFilteredSeller

    const vendorColumns = [
      { key: 'Invoice Number', label: 'Invoice No', align: 'left', render: r => <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{r['Invoice Number']}</span> },
      { key: 'Invoice Date', label: 'Invoice Date', align: 'left' },
      { key: 'Reference Details', label: 'PO / Ref Details', align: 'left' },
      { key: 'Invoice Amount', label: 'Invoice Amt', align: 'right', accessor: r => num(r['Invoice Amount']), render: r => '₹' + num(r['Invoice Amount']).toLocaleString() },
      { key: 'TDS AMOUNT', label: 'TDS (₹)', align: 'right', accessor: r => num(r['TDS AMOUNT']), render: r => num(r['TDS AMOUNT']) ? '₹' + num(r['TDS AMOUNT']).toLocaleString() : '—' },
      { key: 'AFT DEDUCTION INV  AMOUNT', label: 'Net Payable', align: 'right', accessor: r => num(r['AFT DEDUCTION INV  AMOUNT']), render: r => num(r['AFT DEDUCTION INV  AMOUNT']) ? '₹' + num(r['AFT DEDUCTION INV  AMOUNT']).toLocaleString() : '—' },
      { key: 'PAYMENT RECEIVED UTR', label: 'Payment UTR', align: 'left', render: r => <span style={{ fontSize: 11, color: '#94a3b8' }}>{r['PAYMENT RECEIVED UTR'] || '—'}</span> },
      { key: 'status', label: 'Status', align: 'left', render: r => <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: r['status'] === 'FULLY PAID' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: r['status'] === 'FULLY PAID' ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>{r['status'] || 'Pending'}</span> },
    ]

    const sellerColumns = [
      { key: 'DATE', label: 'Date', align: 'left' },
      { key: 'PURCHASE INV NO', label: 'Purchase Inv No', align: 'left' },
      { key: 'DESCRIPTION', label: 'Item Description', align: 'left', render: r => <span style={{ fontWeight: 600 }}>{r['DESCRIPTION']}</span> },
      { key: 'QTY', label: 'Qty', align: 'right', accessor: r => num(r['QTY']) },
      { key: 'BASIC RATE', label: 'Basic Rate', align: 'right', accessor: r => num(r['BASIC RATE']), render: r => '₹' + num(r['BASIC RATE']).toLocaleString() },
      { key: 'TOTAL', label: 'Base Total', align: 'right', accessor: r => num(r['TOTAL']), render: r => '₹' + num(r['TOTAL']).toLocaleString() },
      { key: 'GST', label: 'GST', align: 'right', accessor: r => num(r['GST']), render: r => num(r['GST']) ? '₹' + num(r['GST']).toLocaleString() : '—' },
      { key: 'G.TOTAL', label: 'Gross Total', align: 'right', accessor: r => num(r['G.TOTAL']), render: r => num(r['G.TOTAL']) ? <span style={{ color: '#22c55e', fontWeight: 700 }}>₹{num(r['G.TOTAL']).toLocaleString()}</span> : '—' },
    ]

    return {
      stats,
      vendorFiltered,
      sellerFiltered,
      vendorColumns,
      sellerColumns,
      vendorCount: monthFilteredVendor.length,
      sellerCount: monthFilteredSeller.length,
      pendingCount: monthFilteredVendor.filter(r => r['status'] !== 'FULLY PAID').length
    }
  }, [activeSubTab, cache.amazon, amazonFilter, debouncedSearch, rowMatchesMonth])

  // ==========================================
  // 5. CHANNELS TAB DATA & METRICS
  // ==========================================
  const channelsData = useMemo(() => {
    if (activeSubTab !== 'channels' || !cache.channels) return null
    const { shopifyRows, jioRows, rkRows } = cache.channels

    // Month filter
    const monthShopify = shopifyRows.filter(r => rowMatchesMonth(r, ['Invoice Date', 'Order Date', 'Date of Supply']))
    const monthJio = jioRows // JioMart doesn't have standard date column
    const monthRK = rkRows.filter(r => rowMatchesMonth(r, ['DATE', 'DUE DATE']))

    const totalShopify = monthShopify.reduce((s, r) => s + num(r['TOTAL']), 0)
    const totalRK = monthRK.reduce((s, r) => s + num(r['INV AMOUNT']), 0)
    const jioReturns = monthJio.filter(r => r['Status'] === 'shipment_returned').length
    const jioCanceled = monthJio.filter(r => r['Status'] === 'canceled').length

    const stats = [
      { label: 'Shopify Direct Sales', icon: '🛍️', color: '#22c55e', value: '₹' + Math.round(totalShopify).toLocaleString() },
      { label: 'RK Worldinfocom Billed', icon: '🏢', color: '#3b82f6', value: '₹' + Math.round(totalRK).toLocaleString() },
      { label: 'JioMart Total Orders', icon: '📱', color: '#a855f7', value: monthJio.length.toLocaleString() },
      { label: 'Jio Returns / Pending GRN', icon: '🔄', color: '#ef4444', value: `${jioReturns} ret / ${jioCanceled} can` },
    ]

    const q = debouncedSearch.toLowerCase().trim()

    const shopifyFiltered = q
      ? monthShopify.filter(r =>
          (r['Invoice No'] && r['Invoice No'].toLowerCase().includes(q)) ||
          (r['BILL TO PARTY'] && r['BILL TO PARTY'].toLowerCase().includes(q)) ||
          (r['Place of Supply'] && r['Place of Supply'].toLowerCase().includes(q))
        )
      : monthShopify

    const jioFiltered = q
      ? monthJio.filter(r =>
          (r['Number'] && r['Number'].toLowerCase().includes(q)) ||
          (r['Recipient'] && r['Recipient'].toLowerCase().includes(q)) ||
          (r['Shipment_item'] && r['Shipment_item'].toLowerCase().includes(q))
        )
      : monthJio

    const rkFiltered = q
      ? monthRK.filter(r =>
          (r['INV NO'] && r['INV NO'].toLowerCase().includes(q)) ||
          (r['PO NO'] && r['PO NO'].toLowerCase().includes(q))
        )
      : monthRK

    const shopifyColumns = [
      { key: 'Invoice No', label: 'Invoice No', align: 'left', render: r => <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{r['Invoice No']}</span> },
      { key: 'Order No', label: 'Order No', align: 'left' },
      { key: 'Invoice Date', label: 'Date', align: 'left' },
      { key: 'BILL TO PARTY', label: 'Customer Name', align: 'left' },
      { key: 'Place of Supply', label: 'City / Destination', align: 'left' },
      { key: 'ITEM - SKU', label: 'Product Item', align: 'left', render: r => <span style={{ maxWidth: 220, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r['ITEM - SKU']}>{r['ITEM - SKU']}</span> },
      { key: 'QTY', label: 'Qty', align: 'right', accessor: r => num(r['QTY']) },
      { key: 'RATE PER ITEM', label: 'Rate', align: 'right', accessor: r => num(r['RATE PER ITEM']), render: r => '₹' + num(r['RATE PER ITEM']).toLocaleString() },
      { key: 'TOTAL', label: 'Total (₹)', align: 'right', accessor: r => num(r['TOTAL']), render: r => <span style={{ color: '#22c55e', fontWeight: 700 }}>₹{num(r['TOTAL']).toLocaleString()}</span> },
    ]

    const jioColumns = [
      { key: 'Number', label: 'Order Number', align: 'left', render: r => <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{r['Number']}</span> },
      {
        key: 'Status',
        label: 'Status',
        align: 'left',
        render: r => (
          <span style={{
            padding: '2px 8px',
            borderRadius: 10,
            fontSize: 11,
            background: r['Status'] === 'shipment_returned' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
            color: r['Status'] === 'shipment_returned' ? '#f87171' : '#eab308'
          }}>
            {r['Status']}
          </span>
        )
      },
      { key: 'Recipient', label: 'Recipient', align: 'left' },
      { key: 'Shipment_item', label: 'Shipment Item', align: 'left', render: r => <span style={{ maxWidth: 220, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r['Shipment_item']}>{r['Shipment_item']}</span> },
      { key: 'Quantity', label: 'Qty', align: 'right', accessor: r => num(r['Quantity']) },
      { key: 'MRP', label: 'MRP (₹)', align: 'right', accessor: r => num(r['MRP']), render: r => '₹' + num(r['MRP']).toLocaleString() },
      { key: 'Payment_method', label: 'Payment Method', align: 'left' },
      { key: 'Shipping_Agent', label: 'Courier Agent', align: 'left', render: r => r['Shipping_Agent'] || '—' },
    ]

    const rkColumns = [
      { key: 'DATE', label: 'Date', align: 'left' },
      { key: 'INV NO', label: 'Invoice No', align: 'left', render: r => <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{r['INV NO']}</span> },
      { key: 'PO NO', label: 'PO No', align: 'left' },
      { key: 'COMPANY NAME', label: 'Company Name', align: 'left' },
      { key: 'INV AMOUNT', label: 'Invoice Amount (₹)', align: 'right', accessor: r => num(r['INV AMOUNT']), render: r => <span style={{ color: '#22c55e', fontWeight: 700 }}>₹{num(r['INV AMOUNT']).toLocaleString()}</span> },
    ]

    return { stats, shopifyFiltered, jioFiltered, rkFiltered, shopifyColumns, jioColumns, rkColumns }
  }, [activeSubTab, cache.channels, debouncedSearch, rowMatchesMonth])

  return (
    <>
      <header>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>💰</span>
            <h1 style={{ margin: 0 }}>Finance &amp; Accounts Dashboard</h1>
          </div>
          <div className="date" style={{ marginTop: 4 }}>
            Multi-Entity Accounts, Invoices, Deductions &amp; Settlements • {scopeLabel}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Month-wise Period Filter Selector */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', background: '#0f172a', padding: '4px 8px', borderRadius: 8, border: '1px solid #334155' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.5 }}>PERIOD:</span>
            <button
              onClick={resetMonths}
              style={{
                padding: '3px 10px',
                borderRadius: 14,
                border: '1px solid ' + (selectedMonths.size === 0 ? '#3b82f6' : '#334155'),
                background: selectedMonths.size === 0 ? 'rgba(59,130,246,0.18)' : '#1e293b',
                color: selectedMonths.size === 0 ? '#38bdf8' : '#94a3b8',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              All
            </button>
            {monthOptions.map(m => {
              const on = selectedMonths.has(m.mk)
              return (
                <button
                  key={m.mk}
                  onClick={() => toggleMonth(m.mk)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 14,
                    border: '1px solid ' + (on ? '#22c55e' : '#334155'),
                    background: on ? 'rgba(34,197,94,0.18)' : '#1e293b',
                    color: on ? '#22c55e' : '#94a3b8',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {m.label}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => fetchDataForTab(activeSubTab, true)}
            disabled={loading}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#38bdf8',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            ↻ {loading ? 'Fetching...' : 'Refresh Sheet'}
          </button>
          <ProfileSection />
        </div>
      </header>

      {/* Sub-tab Navigation */}
      <div style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 20,
        borderBottom: '1px solid #334155',
        paddingBottom: 12
      }}>
        {FINANCE_SUBTABS.map(tab => {
          const isActive = activeSubTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => switchSubTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid ' + (isActive ? '#3b82f6' : '#334155'),
                background: isActive ? 'rgba(59,130,246,0.18)' : '#1e293b',
                color: isActive ? '#38bdf8' : '#94a3b8',
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.3)',
          color: '#f87171',
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>⚠️ {error}</div>
          <button
            onClick={() => fetchDataForTab(activeSubTab, true)}
            style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {loading && !cache[activeSubTab] && (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Loading financial data from Google Sheets...</div>
        </div>
      )}

      {/* ==========================================
          SUBTAB 1: CUMULATIVE OVERVIEW
          ========================================== */}
      {activeSubTab === 'cumulative' && cumulativeData && (
        <>
          {/* Master Stats Grid */}
          <div className="stats-grid" style={{ marginTop: 0 }}>
            {cumulativeData.stats.map(s => (
              <div className="stat-card" key={s.label}>
                <div className="stat-header">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-icon" style={{ background: `${s.color}26`, color: s.color }}>{s.icon}</div>
                </div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Accounts Comparison Bar Chart */}
          <div className="chart-card" style={{ marginTop: 20 }}>
            <div className="chart-title">Platform Accounts Overview: Invoiced vs Received vs Outstanding vs GRN Not Received</div>
            <div style={{ height: 320, marginTop: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cumulativeData.chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.6} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                  <ReTooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    formatter={(val, name) => ['₹' + Number(val).toLocaleString(), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Bar dataKey="Invoiced" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Received" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Outstanding" fill="#eab308" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="GRN Not Received" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Master Summary Table */}
          <div className="recent-orders" style={{ marginTop: 20 }}>
            <div className="orders-header">
              <div className="orders-title">📊 Entity &amp; Platform Cumulative Accounts Statement</div>
              <CSVButton
                makeRows={() => {
                  const head = 'Platform / Entity,Purchase,Total Invoiced,Credit Notes,Debit Notes,GRN Value,Overdue,Not Due,GRN Not Received,Payment Received,Outstanding'
                  const rows = cumulativeData.summaryRows.map(r => [
                    csvEscape(r['Source Sheet']),
                    num(r['PURCHASE']),
                    num(r['Total Invoice Value']),
                    num(r['Total Credit Note']),
                    num(r['Total Debit Note']),
                    num(r['Total GRN Value']),
                    num(r['Total Over Due']),
                    num(r['Total Not Due']),
                    num(r['GRN NOT RECEIVED']),
                    num(r['Total Payment Received']),
                    num(r['Outstanding'])
                  ].join(','))
                  return [head, ...rows]
                }}
                filename="cumulative_accounts_summary.csv"
              />
            </div>
            <table>
              <thead>
                <tr>
                  <th>Platform / Entity</th>
                  <th style={{ textAlign: 'right' }}>Total Invoiced (₹)</th>
                  <th style={{ textAlign: 'right' }}>Credit Note (₹)</th>
                  <th style={{ textAlign: 'right' }}>Debit Note (₹)</th>
                  <th style={{ textAlign: 'right' }}>GRN Value (₹)</th>
                  <th style={{ textAlign: 'right' }}>Overdue (₹)</th>
                  <th style={{ textAlign: 'right' }}>Not Due (₹)</th>
                  <th style={{ textAlign: 'right' }}>GRN Not Received (₹)</th>
                  <th style={{ textAlign: 'right' }}>Received (₹)</th>
                  <th style={{ textAlign: 'right' }}>Outstanding (₹)</th>
                </tr>
              </thead>
              <tbody>
                {cumulativeData.summaryRows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{row['Source Sheet']}</td>
                    <td style={{ textAlign: 'right', color: '#38bdf8' }}>₹{num(row['Total Invoice Value']).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#f97316' }}>{num(row['Total Credit Note']) ? '₹' + num(row['Total Credit Note']).toLocaleString() : '—'}</td>
                    <td style={{ textAlign: 'right', color: '#ef4444' }}>{num(row['Total Debit Note']) ? '₹' + num(row['Total Debit Note']).toLocaleString() : '—'}</td>
                    <td style={{ textAlign: 'right', color: '#06b6d4' }}>₹{num(row['Total GRN Value']).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: num(row['Total Over Due']) ? '#ef4444' : '#64748b', fontWeight: 600 }}>{num(row['Total Over Due']) ? '₹' + num(row['Total Over Due']).toLocaleString() : '₹0'}</td>
                    <td style={{ textAlign: 'right', color: '#22c55e' }}>{num(row['Total Not Due']) ? '₹' + num(row['Total Not Due']).toLocaleString() : '—'}</td>
                    <td style={{ textAlign: 'right', color: num(row['GRN NOT RECEIVED']) ? '#f59e0b' : '#64748b', fontWeight: 600 }}>{num(row['GRN NOT RECEIVED']) ? '₹' + num(row['GRN NOT RECEIVED']).toLocaleString() : '—'}</td>
                    <td style={{ textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>₹{num(row['Total Payment Received']).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#fbbf24', fontWeight: 700 }}>₹{num(row['Outstanding']).toLocaleString()}</td>
                  </tr>
                ))}
                {cumulativeData.grandRow && (
                  <tr style={{ background: 'rgba(59,130,246,0.15)', fontWeight: 700 }}>
                    <td style={{ color: '#38bdf8', borderTop: '2px solid #334155' }}>Grand Total</td>
                    <td style={{ textAlign: 'right', color: '#38bdf8', borderTop: '2px solid #334155' }}>₹{num(cumulativeData.grandRow['Total Invoice Value']).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#f97316', borderTop: '2px solid #334155' }}>₹{num(cumulativeData.grandRow['Total Credit Note']).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#ef4444', borderTop: '2px solid #334155' }}>₹{num(cumulativeData.grandRow['Total Debit Note']).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#06b6d4', borderTop: '2px solid #334155' }}>₹{num(cumulativeData.grandRow['Total GRN Value']).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#ef4444', borderTop: '2px solid #334155' }}>₹{num(cumulativeData.grandRow['Total Over Due']).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#22c55e', borderTop: '2px solid #334155' }}>₹{num(cumulativeData.grandRow['Total Not Due']).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#f59e0b', borderTop: '2px solid #334155' }}>₹{Math.round(cumulativeData.totalGrnNotReceived).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#22c55e', borderTop: '2px solid #334155' }}>₹{num(cumulativeData.grandRow['Total Payment Received']).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: '#fbbf24', borderTop: '2px solid #334155', fontSize: 14 }}>₹{num(cumulativeData.grandRow['Outstanding']).toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Monthly Accounts Statement */}
          {cumulativeData.monthlyRows.length > 0 && (
            <div className="recent-orders" style={{ marginTop: 20 }}>
              <div className="orders-header">
                <div className="orders-title">📅 September 2026 Accounts Statement</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Platform / Source</th>
                    <th style={{ textAlign: 'right' }}>Total Purchase</th>
                    <th style={{ textAlign: 'right' }}>Total Invoice</th>
                    <th style={{ textAlign: 'right' }}>Total GRN</th>
                    <th style={{ textAlign: 'right' }}>Credit Note</th>
                    <th style={{ textAlign: 'right' }}>Debit Note</th>
                  </tr>
                </thead>
                <tbody>
                  {cumulativeData.monthlyRows.map((r, i) => {
                    const isTotal = (r['Platform / Source'] || r['Platform']).toLowerCase().includes('total')
                    return (
                      <tr key={i} style={isTotal ? { background: 'rgba(59,130,246,0.12)', fontWeight: 700 } : {}}>
                        <td style={isTotal ? { color: '#38bdf8', borderTop: '2px solid #334155' } : { fontWeight: 600 }}>{r['Platform / Source'] || r['Platform']}</td>
                        <td style={{ textAlign: 'right', borderTop: isTotal ? '2px solid #334155' : 'none' }}>{num(r['Total Purchase']) ? '₹' + num(r['Total Purchase']).toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'right', borderTop: isTotal ? '2px solid #334155' : 'none', color: '#38bdf8' }}>{num(r['Total Invoice']) ? '₹' + num(r['Total Invoice']).toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'right', borderTop: isTotal ? '2px solid #334155' : 'none', color: '#06b6d4' }}>{num(r['Total GRN']) ? '₹' + num(r['Total GRN']).toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'right', borderTop: isTotal ? '2px solid #334155' : 'none', color: '#f97316' }}>{num(r['Credit Note']) ? '₹' + num(r['Credit Note']).toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'right', borderTop: isTotal ? '2px solid #334155' : 'none', color: '#ef4444' }}>{num(r['Debit Note']) ? '₹' + num(r['Debit Note']).toLocaleString() : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ==========================================
          SUBTAB 2: INSTAMART INVOICES
          ========================================== */}
      {activeSubTab === 'instamart' && instamartData && (
        <>
          <div className="stats-grid" style={{ marginTop: 0 }}>
            {instamartData.stats.map(s => (
              <div className="stat-card" key={s.label}>
                <div className="stat-header">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-icon" style={{ background: `${s.color}26`, color: s.color }}>{s.icon}</div>
                </div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.6 }}>VIEW:</span>
                {[
                  { key: 'All', label: `All Invoices (${instamartData.overdueCount + instamartData.notDueCount})` },
                  { key: 'Overdue', label: `🔴 Overdue (${instamartData.overdueCount})` },
                  { key: 'Not Due', label: `🟢 Current / Not Due (${instamartData.notDueCount})` },
                  { key: 'grn_pending', label: `⚠️ GRN Not Received (${instamartData.grnPendingCount})` }
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setInstaFilter(opt.key)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 14,
                      border: '1px solid ' + (instaFilter === opt.key ? (opt.key === 'grn_pending' ? '#f59e0b' : '#3b82f6') : '#334155'),
                      background: instaFilter === opt.key ? (opt.key === 'grn_pending' ? 'rgba(245,158,11,0.18)' : 'rgba(59,130,246,0.18)') : '#1e293b',
                      color: instaFilter === opt.key ? (opt.key === 'grn_pending' ? '#f59e0b' : '#38bdf8') : '#94a3b8',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="🔍 Search by Invoice, PO, Customer, GRN..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  padding: '7px 12px',
                  fontSize: 12,
                  minWidth: 280,
                  outline: 'none'
                }}
              />
            </div>

            <DataTable
              columns={instamartData.columns}
              rows={instamartData.filtered}
              pageSize={15}
              filename={`instamart_invoices_${instaFilter.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`}
              emptyMessage="No Instamart invoices found matching your filter"
            />
          </div>
        </>
      )}

      {/* ==========================================
          SUBTAB 3: BLINKIT ACCOUNTS
          ========================================== */}
      {activeSubTab === 'blinkit' && blinkitData && (
        <>
          <div className="stats-grid" style={{ marginTop: 0 }}>
            {blinkitData.stats.map(s => (
              <div className="stat-card" key={s.label}>
                <div className="stat-header">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-icon" style={{ background: `${s.color}26`, color: s.color }}>{s.icon}</div>
                </div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.6 }}>CHANNEL:</span>
                {[
                  { key: 'All', label: 'All Blinkit' },
                  { key: 'Vendor', label: `Vendor (${blinkitData.vendorCount})` },
                  { key: 'Seller', label: `Seller (${blinkitData.sellerCount})` },
                  { key: 'grn_pending', label: `⚠️ GRN Not Received (${blinkitData.grnPendingCount})` }
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setBlinkitFilter(opt.key)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 14,
                      border: '1px solid ' + (blinkitFilter === opt.key ? (opt.key === 'grn_pending' ? '#f59e0b' : '#eab308') : '#334155'),
                      background: blinkitFilter === opt.key ? (opt.key === 'grn_pending' ? 'rgba(245,158,11,0.18)' : 'rgba(234,179,8,0.18)') : '#1e293b',
                      color: blinkitFilter === opt.key ? (opt.key === 'grn_pending' ? '#f59e0b' : '#eab308') : '#94a3b8',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="🔍 Search Invoice, PO, Customer..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  padding: '7px 12px',
                  fontSize: 12,
                  minWidth: 260,
                  outline: 'none'
                }}
              />
            </div>

            <DataTable
              columns={blinkitData.columns}
              rows={blinkitData.filtered}
              pageSize={15}
              filename={`blinkit_accounts_${blinkitFilter.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`}
              emptyMessage="No Blinkit records found matching your filter"
            />
          </div>
        </>
      )}

      {/* ==========================================
          SUBTAB 4: AMAZON ACCOUNTS
          ========================================== */}
      {activeSubTab === 'amazon' && amazonData && (
        <>
          <div className="stats-grid" style={{ marginTop: 0 }}>
            {amazonData.stats.map(s => (
              <div className="stat-card" key={s.label}>
                <div className="stat-header">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-icon" style={{ background: `${s.color}26`, color: s.color }}>{s.icon}</div>
                </div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.6 }}>VIEW:</span>
                {[
                  { key: 'All', label: 'All Amazon' },
                  { key: 'Vendor', label: `Vendor Invoices (${amazonData.vendorCount})` },
                  { key: 'Seller', label: `Seller Direct (${amazonData.sellerCount})` },
                  { key: 'pending', label: `⚠️ Pending Settlement (${amazonData.pendingCount})` }
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setAmazonFilter(opt.key)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 14,
                      border: '1px solid ' + (amazonFilter === opt.key ? (opt.key === 'pending' ? '#f59e0b' : '#3b82f6') : '#334155'),
                      background: amazonFilter === opt.key ? (opt.key === 'pending' ? 'rgba(245,158,11,0.18)' : 'rgba(59,130,246,0.18)') : '#1e293b',
                      color: amazonFilter === opt.key ? (opt.key === 'pending' ? '#f59e0b' : '#38bdf8') : '#94a3b8',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="🔍 Search Invoice, UTR, Item..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  padding: '7px 12px',
                  fontSize: 12,
                  minWidth: 260,
                  outline: 'none'
                }}
              />
            </div>

            {amazonFilter !== 'Seller' && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🏢</span>
                  <span>Amazon Vendor Direct Invoices ({amazonData.vendorFiltered.length})</span>
                </div>
                <DataTable
                  columns={amazonData.vendorColumns}
                  rows={amazonData.vendorFiltered}
                  pageSize={10}
                  filename="amazon_vendor_invoices.csv"
                  emptyMessage="No Amazon vendor records found"
                />
              </div>
            )}

            {amazonFilter !== 'Vendor' && amazonFilter !== 'pending' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📦</span>
                  <span>Amazon Seller Dispatch &amp; Tax Billed ({amazonData.sellerFiltered.length})</span>
                </div>
                <DataTable
                  columns={amazonData.sellerColumns}
                  rows={amazonData.sellerFiltered}
                  pageSize={10}
                  filename="amazon_seller_invoices.csv"
                  emptyMessage="No Amazon seller records found"
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ==========================================
          SUBTAB 5: D2C & OTHER CHANNELS
          ========================================== */}
      {activeSubTab === 'channels' && channelsData && (
        <>
          <div className="stats-grid" style={{ marginTop: 0 }}>
            {channelsData.stats.map(s => (
              <div className="stat-card" key={s.label}>
                <div className="stat-header">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-icon" style={{ background: `${s.color}26`, color: s.color }}>{s.icon}</div>
                </div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.6 }}>CHANNEL:</span>
                {[
                  { key: 'Shopify', label: `🛍️ Shopify D2C (${channelsData.shopifyFiltered.length})` },
                  { key: 'RK', label: `🏢 RK Worldinfocom (${channelsData.rkFiltered.length})` },
                  { key: 'JioMart', label: `📱 JioMart Orders (${channelsData.jioFiltered.length})` }
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setChannelFilter(opt.key)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 14,
                      border: '1px solid ' + (channelFilter === opt.key ? '#22c55e' : '#334155'),
                      background: channelFilter === opt.key ? 'rgba(34,197,94,0.18)' : '#1e293b',
                      color: channelFilter === opt.key ? '#22c55e' : '#94a3b8',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="🔍 Search Orders, Items, Customer..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  padding: '7px 12px',
                  fontSize: 12,
                  minWidth: 260,
                  outline: 'none'
                }}
              />
            </div>

            {channelFilter === 'Shopify' && (
              <DataTable
                columns={channelsData.shopifyColumns}
                rows={channelsData.shopifyFiltered}
                pageSize={10}
                filename="shopify_direct_orders.csv"
                emptyMessage="No Shopify direct orders found"
              />
            )}

            {channelFilter === 'RK' && (
              <DataTable
                columns={channelsData.rkColumns}
                rows={channelsData.rkFiltered}
                pageSize={10}
                filename="rk_worldinfocom_invoices.csv"
                emptyMessage="No RK Worldinfocom invoices found"
              />
            )}

            {channelFilter === 'JioMart' && (
              <DataTable
                columns={channelsData.jioColumns}
                rows={channelsData.jioFiltered}
                pageSize={10}
                filename="jiomart_orders.csv"
                emptyMessage="No JioMart orders found"
              />
            )}
          </div>
        </>
      )}
    </>
  )
}
