import { useState, useEffect, useMemo, useCallback } from 'react'
import { parseCSV, csvEscape } from '../lib/utils'
import { ProfileSection, CSVButton } from '../components/ui'
import { DataTable } from '../components/DataTable'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend, LineChart, Line
} from 'recharts'

const PARITY_SPREADSHEET_ID = '1w7PsIoiwh5U1jmgkFoD1VWeWYwSZ56Tmbe-0F5OdTe8'
const GID_COMPETITORS = '888123456' // Raw Data Competitors
const GID_INSTA = '12345678'       // Raw Data of Insta
const GID_BLINKIT = '712798484'     // Raw Data of Blinkit

// Helper to extract clean numeric price
function extractPriceNum(val) {
  if (!val) return null
  const s = String(val).replace(/₹/g, '').replace(/,/g, '').trim()
  if (s === '*' || s === '-' || s.toLowerCase() === 'missing' || s.toLowerCase() === 'n/a' || !s) return null
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)/)
  if (m) {
    const n = parseFloat(m[1])
    return isNaN(n) ? null : n
  }
  return null
}

// Capitalize city name
function formatCity(c) {
  if (!c) return 'All Cities'
  return c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

// Format date: "2026-09-29" -> "29 Sep"
function formatShortDate(dStr) {
  if (!dStr) return '—'
  try {
    const [y, m, d] = dStr.split('-').map(Number)
    if (!y || !m || !d) return dStr
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${d} ${months[m - 1]}`
  } catch {
    return dStr
  }
}

// Format date: "2026-09-29" -> "29 Sep 2026"
function formatPrettyDate(dStr) {
  if (!dStr) return 'N/A'
  try {
    const [y, m, d] = dStr.split('-').map(Number)
    if (!y || !m || !d) return dStr
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${d} ${months[m - 1]} ${y}`
  } catch {
    return dStr
  }
}

// Parse Raw Data Competitors
function parseCompetitorRawData(csvText) {
  const rows = parseCSV(csvText)
  const items = []
  for (const r of rows) {
    const cols = Object.values(r)
    const date = (r._col_0 || r.Date || cols[0] || '').trim()
    const city = (r._col_1 || r.City || cols[1] || '').trim().toUpperCase()
    const product = (r._col_2 || r.Product || cols[2] || '').trim()
    const brand = (r._col_3 || r.Brand || cols[3] || '').trim()
    const rawPrice = (r._col_4 || r.Price || cols[4] || '').trim()
    const price = extractPriceNum(rawPrice)

    if (!date.startsWith('202') || !city || city === 'CITY' || !product || !brand) continue

    items.push({
      date,
      city,
      product,
      brand,
      price,
      rawPrice,
    })
  }
  return items
}

// Parse Raw Data of Insta
function parseInstaRawData(csvText) {
  const rows = parseCSV(csvText)
  const items = []
  for (const r of rows) {
    const cols = Object.values(r)
    const date = (r._col_0 || r.Date || cols[0] || '').trim()
    const city = (r._col_1 || r.City || cols[1] || '').trim().toUpperCase()
    const product = (r._col_2 || r.Product || cols[2] || '').trim()
    const availability = (r._col_3 || r.Availability || cols[3] || '').trim()
    const mrp = extractPriceNum(r._col_4 || r.MRP || cols[4])
    const gem = extractPriceNum(r._col_5 || r.Gem || cols[5])

    if (!date.startsWith('202') || !city || city === 'CITY' || !product || product.toLowerCase() === 'product') continue

    items.push({
      date,
      city,
      product,
      availability: availability || 'Available',
      mrp,
      gem,
    })
  }
  return items
}

// Price Delta Badge
function PriceDeltaBadge({ delta, priceD, prevPrice, showStable = true }) {
  if (prevPrice === null || prevPrice === undefined || prevPrice === 0) {
    if (priceD > 0) return <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>New</span>
    return <span style={{ color: '#64748b' }}>—</span>
  }
  if (delta > 0.4) {
    const pct = prevPrice > 0 ? ((delta / prevPrice) * 100).toFixed(1) : '0'
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        background: 'rgba(239, 68, 68, 0.15)',
        color: '#f87171',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        whiteSpace: 'nowrap'
      }}>
        ▲ +₹{delta.toFixed(1)} (+{pct}%)
      </span>
    )
  }
  if (delta < -0.4) {
    const pct = prevPrice > 0 ? ((Math.abs(delta) / prevPrice) * 100).toFixed(1) : '0'
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        background: 'rgba(34, 197, 94, 0.15)',
        color: '#4ade80',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        whiteSpace: 'nowrap'
      }}>
        ▼ -₹{Math.abs(delta).toFixed(1)} (-{pct}%)
      </span>
    )
  }
  if (!showStable) return null
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 6px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      background: 'rgba(148, 163, 184, 0.12)',
      color: '#94a3b8',
      border: '1px solid rgba(148, 163, 184, 0.25)',
      whiteSpace: 'nowrap'
    }}>
      ━ Stable
    </span>
  )
}

// Availability Status Pill
function AvailabilityPill({ status }) {
  const s = (status || '').toLowerCase()
  if (s.includes('avail')) {
    return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)' }}>✓ Available</span>
  }
  if (s.includes('out') || s.includes('stock') || s === 'oos') {
    return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>⛔ Out of Stock</span>
  }
  if (s.includes('miss')) {
    return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)' }}>⚠️ Missing</span>
  }
  return <span style={{ color: '#64748b', fontSize: 11 }}>{status || '—'}</span>
}

export default function StockTab() {
  const [activeSubTab, setActiveSubTab] = useState('competitors') // 'competitors' | 'insta_avail' | 'parity_matrix' | 'alerts' | 'trends'
  const [selectedCity, setSelectedCity] = useState('All')
  const [selectedProduct, setSelectedProduct] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [alertFilter, setAlertFilter] = useState('All') // 'All' | 'hikes' | 'drops' | 'newly_oos' | 'restocked' | 'premium'

  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [competitorData, setCompetitorData] = useState([])
  const [instaData, setInstaData] = useState([])

  // Fetch all required data sheets
  const loadData = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      const [resComp, resInsta] = await Promise.all([
        fetch(`https://docs.google.com/spreadsheets/d/${PARITY_SPREADSHEET_ID}/export?format=csv&gid=${GID_COMPETITORS}`),
        fetch(`https://docs.google.com/spreadsheets/d/${PARITY_SPREADSHEET_ID}/export?format=csv&gid=${GID_INSTA}`)
      ])

      if (!resComp.ok || !resInsta.ok) {
        throw new Error('Failed to fetch data from Parity spreadsheet.')
      }

      const compText = await resComp.text()
      const instaText = await resInsta.text()

      const parsedComp = parseCompetitorRawData(compText)
      const parsedInsta = parseInstaRawData(instaText)

      setCompetitorData(parsedComp)
      setInstaData(parsedInsta)
      setLoading(false)
      setIsRefreshing(false)
    } catch (e) {
      setError(e.message || 'Error fetching Parity data')
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Extract available dates for Competitors
  const compDates = useMemo(() => {
    const set = new Set(competitorData.map(r => r.date).filter(Boolean))
    return Array.from(set).sort()
  }, [competitorData])

  // Extract available dates for Insta
  const instaDates = useMemo(() => {
    const set = new Set(instaData.map(r => r.date).filter(Boolean))
    return Array.from(set).sort()
  }, [instaData])

  // Selected Day D, D-1, D-2
  const latestCompDate = compDates[compDates.length - 1] || '2026-09-29'
  const prevCompDate = compDates[compDates.length - 2] || '2026-09-28'
  const prev2CompDate = compDates[compDates.length - 3] || '2026-09-27'

  const [selectedDate, setSelectedDate] = useState('')

  useEffect(() => {
    if (latestCompDate && !selectedDate) {
      setSelectedDate(latestCompDate)
    }
  }, [latestCompDate, selectedDate])

  const dayD = selectedDate || latestCompDate
  const dateIndex = compDates.indexOf(dayD)
  const dayDMinus1 = dateIndex > 0 ? compDates[dateIndex - 1] : prevCompDate
  const dayDMinus2 = dateIndex > 1 ? compDates[dateIndex - 2] : prev2CompDate

  // Dates for Instamart 3-day tracking
  const latestInstaDate = instaDates[instaDates.length - 1] || dayD
  const instaDIndex = instaDates.indexOf(latestInstaDate)
  const instaD = latestInstaDate
  const instaD1 = instaDIndex > 0 ? instaDates[instaDIndex - 1] : '2026-09-28'
  const instaD2 = instaDIndex > 1 ? instaDates[instaDIndex - 2] : '2026-09-27'
  const instaD3 = instaDIndex > 2 ? instaDates[instaDIndex - 3] : '2026-09-26'

  // Distinct cities list across both sources
  const allCities = useMemo(() => {
    const set = new Set([
      ...competitorData.map(r => r.city),
      ...instaData.map(r => r.city)
    ].filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [competitorData, instaData])

  // Distinct products list
  const allCompProducts = useMemo(() => {
    const set = new Set(competitorData.map(r => r.product).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [competitorData])

  const allInstaProducts = useMemo(() => {
    const set = new Set(instaData.map(r => r.product).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [instaData])

  // =========================================================================
  // 1. COMPETITOR & GEM PRICE TRACKING (DOD & LAST 2 DAYS)
  // =========================================================================
  const competitorTrackingData = useMemo(() => {
    // Filter data for Day D, D-1, D-2
    const rowsD = competitorData.filter(r => r.date === dayD)
    const rowsD1 = competitorData.filter(r => r.date === dayDMinus1)
    const rowsD2 = competitorData.filter(r => r.date === dayDMinus2)

    // Build lookup maps: city||product||brand -> price
    const mapD = {}
    const mapD1 = {}
    const mapD2 = {}

    rowsD.forEach(r => { mapD[`${r.city}||${r.product}||${r.brand}`] = r.price })
    rowsD1.forEach(r => { mapD1[`${r.city}||${r.product}||${r.brand}`] = r.price })
    rowsD2.forEach(r => { mapD2[`${r.city}||${r.product}||${r.brand}`] = r.price })

    // Find all unique City + Product pairs on Day D (or across days)
    const pairMap = {}
    const processRows = (rows) => {
      rows.forEach(r => {
        const key = `${r.city}||${r.product}`
        if (!pairMap[key]) {
          pairMap[key] = { city: r.city, product: r.product, brands: new Set() }
        }
        pairMap[key].brands.add(r.brand)
      })
    }
    processRows(rowsD)
    processRows(rowsD1)

    const list = []
    for (const [key, info] of Object.entries(pairMap)) {
      const city = info.city
      const product = info.product

      if (selectedCity !== 'All' && city !== selectedCity) continue
      if (selectedProduct !== 'All' && product !== selectedProduct) continue

      const gemD = mapD[`${city}||${product}||Gem`] ?? null
      const gemD1 = mapD1[`${city}||${product}||Gem`] ?? null
      const gemD2 = mapD2[`${city}||${product}||Gem`] ?? null

      const gemDoD = (gemD !== null && gemD1 !== null) ? (gemD - gemD1) : 0
      const gem2Day = (gemD !== null && gemD2 !== null) ? (gemD - gemD2) : 0

      // Collect competitor prices on Day D
      const compPricesD = []
      const brandDetails = []

      // Top known competitor brands in order
      const topBrands = ['Jivo', 'Idhayam', 'Mr. Gold', 'VVD', 'Fortune', 'Gold winner', 'TATA', '24 Mantra', 'Dhara', 'Saffola', 'Gulab', 'Gemini', 'Farm SE', 'Pro nature']
      const allBrandsPresent = [...new Set([...topBrands, ...Array.from(info.brands)])].filter(b => b !== 'Gem')

      allBrandsPresent.forEach(b => {
        const pD = mapD[`${city}||${product}||${b}`] ?? null
        const pD1 = mapD1[`${city}||${product}||${b}`] ?? null
        const pD2 = mapD2[`${city}||${product}||${b}`] ?? null

        if (pD !== null || pD1 !== null) {
          const doD = (pD !== null && pD1 !== null) ? (pD - pD1) : 0
          if (pD !== null) compPricesD.push(pD)
          brandDetails.push({
            brand: b,
            priceD: pD,
            priceD1: pD1,
            priceD2: pD2,
            doD,
          })
        }
      })

      const compAvg = compPricesD.length ? Math.round((compPricesD.reduce((s, v) => s + v, 0) / compPricesD.length) * 10) / 10 : null
      const lowestCompPrice = compPricesD.length ? Math.min(...compPricesD) : null
      const lowestBrand = brandDetails.find(b => b.priceD === lowestCompPrice)?.brand || '—'

      const gemVsMarketDiff = (gemD !== null && compAvg !== null) ? Math.round((gemD - compAvg) * 10) / 10 : null
      const gemVsMarketPct = (gemD !== null && compAvg !== null && compAvg > 0) ? Math.round(((gemD - compAvg) / compAvg) * 1000) / 10 : null

      const gemVsLowestDiff = (gemD !== null && lowestCompPrice !== null) ? Math.round((gemD - lowestCompPrice) * 10) / 10 : null

      list.push({
        id: key,
        city,
        product,
        gemD,
        gemD1,
        gemD2,
        gemDoD,
        gem2Day,
        compAvg,
        lowestCompPrice,
        lowestBrand,
        gemVsMarketDiff,
        gemVsMarketPct,
        gemVsLowestDiff,
        brandDetails,
        activeCompetitorsCount: compPricesD.length,
        // Specific brand shortcuts for table columns
        jivoD: mapD[`${city}||${product}||Jivo`] ?? null,
        jivoD1: mapD1[`${city}||${product}||Jivo`] ?? null,
        idhayamD: mapD[`${city}||${product}||Idhayam`] ?? null,
        idhayamD1: mapD1[`${city}||${product}||Idhayam`] ?? null,
        mrGoldD: mapD[`${city}||${product}||Mr. Gold`] ?? null,
        mrGoldD1: mapD1[`${city}||${product}||Mr. Gold`] ?? null,
        vvdD: mapD[`${city}||${product}||VVD`] ?? null,
        vvdD1: mapD1[`${city}||${product}||VVD`] ?? null,
        fortuneD: mapD[`${city}||${product}||Fortune`] ?? null,
        fortuneD1: mapD1[`${city}||${product}||Fortune`] ?? null,
        goldwinnerD: mapD[`${city}||${product}||Gold winner`] ?? null,
        goldwinnerD1: mapD1[`${city}||${product}||Gold winner`] ?? null,
      })
    }

    return list.sort((a, b) => a.city.localeCompare(b.city) || a.product.localeCompare(b.product))
  }, [competitorData, dayD, dayDMinus1, dayDMinus2, selectedCity, selectedProduct])

  // =========================================================================
  // 2. INSTAMART SKU AVAILABILITY TRACKER (DOD & LAST 3 DAYS)
  // =========================================================================
  const instaAvailabilityData = useMemo(() => {
    // Map items by city + product + date
    const map = {}
    instaData.forEach(r => {
      const key = `${r.city}||${r.product}`
      if (!map[key]) {
        map[key] = {
          city: r.city,
          product: r.product,
          byDate: {}
        }
      }
      map[key].byDate[r.date] = r
    })

    const list = []
    for (const [key, item] of Object.entries(map)) {
      if (selectedCity !== 'All' && item.city !== selectedCity) continue
      if (selectedProduct !== 'All' && item.product !== selectedProduct) continue

      const d0 = item.byDate[instaD] || null
      const d1 = item.byDate[instaD1] || null
      const d2 = item.byDate[instaD2] || null
      const d3 = item.byDate[instaD3] || null

      const statusD0 = d0 ? d0.availability : 'Missing'
      const statusD1 = d1 ? d1.availability : 'Missing'
      const statusD2 = d2 ? d2.availability : 'Missing'
      const statusD3 = d3 ? d3.availability : 'Missing'

      const isAvailD0 = statusD0.toLowerCase().includes('avail')
      const isAvailD1 = statusD1.toLowerCase().includes('avail')
      const isAvailD2 = statusD2.toLowerCase().includes('avail')

      const isOosD0 = statusD0.toLowerCase().includes('out') || statusD0.toLowerCase().includes('stock')
      const isOosD1 = statusD1.toLowerCase().includes('out') || statusD1.toLowerCase().includes('stock')

      // Classify Availability Shift
      let shift = 'Stable Available'
      let shiftColor = '#4ade80'
      let shiftIcon = '✅'

      if (isOosD0 && isAvailD1) {
        shift = 'Newly Out of Stock'
        shiftColor = '#f87171'
        shiftIcon = '⛔'
      } else if (isAvailD0 && isOosD1) {
        shift = 'Restocked'
        shiftColor = '#38bdf8'
        shiftIcon = '🔄'
      } else if (isOosD0 && isOosD1) {
        shift = 'Persistently OOS'
        shiftColor = '#f43f5e'
        shiftIcon = '⚠️'
      } else if (statusD0.toLowerCase().includes('miss')) {
        shift = 'Missing / Delisted'
        shiftColor = '#facc15'
        shiftIcon = '❓'
      } else if (!isAvailD0) {
        shift = 'Out of Stock'
        shiftColor = '#f87171'
        shiftIcon = '⛔'
      }

      const mrp = d0?.mrp || d1?.mrp || null
      const gemPriceD0 = d0?.gem || null
      const gemPriceD1 = d1?.gem || null
      const gemPriceD2 = d2?.gem || null

      const priceDoD = (gemPriceD0 !== null && gemPriceD1 !== null) ? (gemPriceD0 - gemPriceD1) : 0
      const discountPct = (mrp && gemPriceD0) ? Math.round(((mrp - gemPriceD0) / mrp) * 100) : null

      list.push({
        id: key,
        city: item.city,
        product: item.product,
        statusD0,
        statusD1,
        statusD2,
        statusD3,
        isAvailD0,
        isOosD0,
        shift,
        shiftColor,
        shiftIcon,
        mrp,
        gemPriceD0,
        gemPriceD1,
        gemPriceD2,
        priceDoD,
        discountPct,
      })
    }

    return list.sort((a, b) => {
      // Show newly OOS and OOS first, then restocked, then alphabetical
      const order = { 'Newly Out of Stock': 1, 'Persistently OOS': 2, 'Out of Stock': 3, 'Restocked': 4, 'Missing / Delisted': 5, 'Stable Available': 6 }
      const diff = (order[a.shift] || 9) - (order[b.shift] || 9)
      if (diff !== 0) return diff
      return a.city.localeCompare(b.city) || a.product.localeCompare(b.product)
    })
  }, [instaData, instaD, instaD1, instaD2, instaD3, selectedCity, selectedProduct])

  // =========================================================================
  // 3. EXECUTIVE KPI CALCULATIONS
  // =========================================================================
  const executiveKPIs = useMemo(() => {
    // 1. Gem Price KPIs (from Competitor Tracking)
    const gemPricesD = competitorTrackingData.map(r => r.gemD).filter(p => p !== null)
    const gemPricesD1 = competitorTrackingData.map(r => r.gemD1).filter(p => p !== null)
    const gemPricesD2 = competitorTrackingData.map(r => r.gemD2).filter(p => p !== null)

    const avgGemPrice = gemPricesD.length ? Math.round((gemPricesD.reduce((s, v) => s + v, 0) / gemPricesD.length) * 10) / 10 : 0
    const avgGemPriceD1 = gemPricesD1.length ? Math.round((gemPricesD1.reduce((s, v) => s + v, 0) / gemPricesD1.length) * 10) / 10 : 0
    const avgGemPriceD2 = gemPricesD2.length ? Math.round((gemPricesD2.reduce((s, v) => s + v, 0) / gemPricesD2.length) * 10) / 10 : 0

    const gemDoDDelta = avgGemPriceD1 > 0 ? Math.round((avgGemPrice - avgGemPriceD1) * 10) / 10 : 0
    const gem2DayDelta = avgGemPriceD2 > 0 ? Math.round((avgGemPrice - avgGemPriceD2) * 10) / 10 : 0

    // 2. Market Competitor Average
    const marketAvgs = competitorTrackingData.map(r => r.compAvg).filter(p => p !== null)
    const marketAvgPrice = marketAvgs.length ? Math.round((marketAvgs.reduce((s, v) => s + v, 0) / marketAvgs.length) * 10) / 10 : 0

    const gemVsMarketDiff = (avgGemPrice && marketAvgPrice) ? Math.round((avgGemPrice - marketAvgPrice) * 10) / 10 : 0
    const gemVsMarketPct = (avgGemPrice && marketAvgPrice) ? Math.round(((avgGemPrice - marketAvgPrice) / marketAvgPrice) * 1000) / 10 : 0

    // 3. Instamart Availability KPIs (3-day DoD)
    const totalInstaSKUs = instaAvailabilityData.length
    const availCountD0 = instaAvailabilityData.filter(r => r.isAvailD0).length
    const availCountD1 = instaAvailabilityData.filter(r => (r.statusD1 || '').toLowerCase().includes('avail')).length
    const availCountD2 = instaAvailabilityData.filter(r => (r.statusD2 || '').toLowerCase().includes('avail')).length

    const oosCountD0 = instaAvailabilityData.filter(r => r.isOosD0).length
    const newlyOosCount = instaAvailabilityData.filter(r => r.shift === 'Newly Out of Stock').length
    const restockedCount = instaAvailabilityData.filter(r => r.shift === 'Restocked').length
    const missingCount = instaAvailabilityData.filter(r => r.statusD0.toLowerCase().includes('miss')).length

    const availRateD0 = totalInstaSKUs > 0 ? Math.round((availCountD0 / totalInstaSKUs) * 1000) / 10 : 0
    const availRateD1 = totalInstaSKUs > 0 ? Math.round((availCountD1 / totalInstaSKUs) * 1000) / 10 : 0
    const availRateD2 = totalInstaSKUs > 0 ? Math.round((availCountD2 / totalInstaSKUs) * 1000) / 10 : 0

    const availDoDDelta = Math.round((availRateD0 - availRateD1) * 10) / 10

    return {
      avgGemPrice,
      avgGemPriceD1,
      gemDoDDelta,
      gem2DayDelta,
      marketAvgPrice,
      gemVsMarketDiff,
      gemVsMarketPct,
      totalInstaSKUs,
      availCountD0,
      availRateD0,
      availRateD1,
      availRateD2,
      availDoDDelta,
      oosCountD0,
      newlyOosCount,
      restockedCount,
      missingCount,
      activeCitiesCount: new Set(competitorTrackingData.map(r => r.city)).size,
    }
  }, [competitorTrackingData, instaAvailabilityData])

  // =========================================================================
  // 4. PRICE ALERTS & STOCK SHIFTS
  // =========================================================================
  const alertsList = useMemo(() => {
    const list = []

    // 1. Competitor Price Shifts
    competitorTrackingData.forEach(row => {
      // Gem price shift
      if (Math.abs(row.gemDoD) > 0.4) {
        list.push({
          type: row.gemDoD > 0 ? 'Gem Price Hike' : 'Gem Price Drop',
          category: row.gemDoD > 0 ? 'hikes' : 'drops',
          severity: row.gemDoD > 0 ? 'warning' : 'success',
          city: row.city,
          product: row.product,
          brand: '💎 Gem',
          currentPrice: row.gemD,
          prevPrice: row.gemD1,
          delta: row.gemDoD,
          message: `Gem price shifted from ₹${row.gemD1} to ₹${row.gemD} (DoD: ${row.gemDoD > 0 ? '+' : ''}₹${row.gemDoD.toFixed(1)})`
        })
      }

      // Competitor brand shifts
      row.brandDetails.forEach(b => {
        if (Math.abs(b.doD) > 0.4) {
          list.push({
            type: b.doD > 0 ? `${b.brand} Price Hike` : `${b.brand} Price Drop`,
            category: b.doD > 0 ? 'hikes' : 'drops',
            severity: b.doD > 0 ? 'info' : 'warning',
            city: row.city,
            product: row.product,
            brand: b.brand,
            currentPrice: b.priceD,
            prevPrice: b.priceD1,
            delta: b.doD,
            message: `${b.brand} price shifted from ₹${b.priceD1} to ₹${b.priceD} (DoD: ${b.doD > 0 ? '+' : ''}₹${b.doD.toFixed(1)})`
          })
        }
      })

      // High Premium Alert (>+8% over market)
      if (row.gemVsMarketPct !== null && row.gemVsMarketPct >= 8) {
        list.push({
          type: 'Gem High Premium Alert',
          category: 'premium',
          severity: 'danger',
          city: row.city,
          product: row.product,
          brand: '💎 Gem vs Market',
          currentPrice: row.gemD,
          prevPrice: row.compAvg,
          delta: row.gemVsMarketDiff,
          message: `Gem is ₹${row.gemVsMarketDiff} (+${row.gemVsMarketPct}%) above market average (₹${row.compAvg}) in ${formatCity(row.city)}`
        })
      }
    })

    // 2. Instamart Stock Availability Shifts
    instaAvailabilityData.forEach(row => {
      if (row.shift === 'Newly Out of Stock') {
        list.push({
          type: 'Newly Out of Stock',
          category: 'newly_oos',
          severity: 'danger',
          city: row.city,
          product: row.product,
          brand: 'Instamart',
          currentPrice: row.gemPriceD0,
          prevPrice: null,
          delta: null,
          message: `${row.product} in ${formatCity(row.city)} went Out of Stock on Instamart today!`
        })
      } else if (row.shift === 'Restocked') {
        list.push({
          type: 'Restocked on Instamart',
          category: 'restocked',
          severity: 'success',
          city: row.city,
          product: row.product,
          brand: 'Instamart',
          currentPrice: row.gemPriceD0,
          prevPrice: null,
          delta: null,
          message: `${row.product} in ${formatCity(row.city)} is now back in stock on Instamart!`
        })
      }
    })

    if (alertFilter === 'All') return list
    return list.filter(a => a.category === alertFilter)
  }, [competitorTrackingData, instaAvailabilityData, alertFilter])

  // =========================================================================
  // 5. CSV EXPORTS
  // =========================================================================
  const exportCompetitorsCSV = () => {
    const rows = ['Competitor Price Tracking (DoD & Last 2 Days)']
    rows.push(`Primary Date (Day D): ${dayD}, Comparison Date (Day D-1): ${dayDMinus1}, 2-Day Prior (Day D-2): ${dayDMinus2}`)
    rows.push('')
    rows.push('City,Product,Gem Price (D),Gem Price (D-1),Gem DoD Delta,Gem 2-Day Delta,Market Competitor Avg,Gem vs Market Diff,Gem vs Market %,Lowest Competitor Brand,Lowest Price,Jivo (D),Idhayam (D),Mr. Gold (D),VVD (D),Fortune (D)')
    competitorTrackingData.forEach(r => {
      rows.push([
        csvEscape(r.city),
        csvEscape(r.product),
        r.gemD || '—',
        r.gemD1 || '—',
        r.gemDoD || 0,
        r.gem2Day || 0,
        r.compAvg || '—',
        r.gemVsMarketDiff || '—',
        r.gemVsMarketPct ? `${r.gemVsMarketPct}%` : '—',
        csvEscape(r.lowestBrand),
        r.lowestCompPrice || '—',
        r.jivoD || '—',
        r.idhayamD || '—',
        r.mrGoldD || '—',
        r.vvdD || '—',
        r.fortuneD || '—',
      ].join(','))
    })
    return rows
  }

  const exportInstaAvailabilityCSV = () => {
    const rows = ['Instamart SKU Availability Tracker (DoD & Last 3 Days)']
    rows.push(`Dates Tracked: ${instaD} (D), ${instaD1} (D-1), ${instaD2} (D-2), ${instaD3} (D-3)`)
    rows.push('')
    rows.push('City,Product,Status (D),Status (D-1),Status (D-2),Status (D-3),Stock Shift Classification,MRP (₹),Gem Price (D),Gem Price (D-1),Price DoD Delta,Discount % off MRP')
    instaAvailabilityData.forEach(r => {
      rows.push([
        csvEscape(r.city),
        csvEscape(r.product),
        r.statusD0,
        r.statusD1,
        r.statusD2,
        r.statusD3,
        csvEscape(r.shift),
        r.mrp || '—',
        r.gemPriceD0 || '—',
        r.gemPriceD1 || '—',
        r.priceDoD || 0,
        r.discountPct ? `${r.discountPct}%` : '—',
      ].join(','))
    })
    return rows
  }

  // =========================================================================
  // 6. TABLE COLUMNS DEFINITIONS
  // =========================================================================

  // Competitor Tracking Columns
  const competitorColumns = [
    {
      key: 'city',
      label: 'City',
      accessor: r => r.city,
      render: r => <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{formatCity(r.city)}</span>
    },
    {
      key: 'product',
      label: 'Product',
      accessor: r => r.product,
      render: r => <span style={{ color: '#38bdf8', fontWeight: 600 }}>{r.product}</span>
    },
    {
      key: 'gemD',
      label: `💎 Gem (${formatShortDate(dayD)})`,
      align: 'right',
      accessor: r => r.gemD,
      render: r => <span style={{ fontWeight: 700, color: '#3b82f6', fontSize: 13 }}>{r.gemD ? `₹${r.gemD}` : '—'}</span>
    },
    {
      key: 'gemD1',
      label: `Gem (${formatShortDate(dayDMinus1)})`,
      align: 'right',
      accessor: r => r.gemD1,
      render: r => <span style={{ color: '#94a3b8', fontSize: 12 }}>{r.gemD1 ? `₹${r.gemD1}` : '—'}</span>
    },
    {
      key: 'gemDoD',
      label: 'Gem DoD Delta',
      align: 'center',
      accessor: r => r.gemDoD,
      render: r => <PriceDeltaBadge delta={r.gemDoD} priceD={r.gemD} prevPrice={r.gemD1} />
    },
    {
      key: 'compAvg',
      label: 'Market Avg',
      align: 'right',
      accessor: r => r.compAvg,
      render: r => <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{r.compAvg ? `₹${r.compAvg}` : '—'}</span>
    },
    {
      key: 'gemVsMarket',
      label: 'Gem vs Market',
      align: 'center',
      accessor: r => r.gemVsMarketDiff,
      render: r => {
        if (r.gemVsMarketDiff === null) return <span style={{ color: '#64748b' }}>—</span>
        const isPrem = r.gemVsMarketDiff > 0.5
        const isDisc = r.gemVsMarketDiff < -0.5
        return (
          <span style={{
            padding: '2px 8px',
            borderRadius: 5,
            fontSize: 11,
            fontWeight: 700,
            background: isPrem ? 'rgba(239, 68, 68, 0.15)' : isDisc ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
            color: isPrem ? '#f87171' : isDisc ? '#4ade80' : '#94a3b8',
            border: `1px solid ${isPrem ? 'rgba(239, 68, 68, 0.3)' : isDisc ? 'rgba(34, 197, 94, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
            whiteSpace: 'nowrap'
          }}>
            {isPrem ? `+₹${r.gemVsMarketDiff} (+${r.gemVsMarketPct}%)` : isDisc ? `-₹${Math.abs(r.gemVsMarketDiff)} (${r.gemVsMarketPct}%)` : 'Parity'}
          </span>
        )
      }
    },
    {
      key: 'jivo',
      label: 'Jivo',
      align: 'right',
      accessor: r => r.jivoD,
      render: r => <span style={{ color: r.jivoD ? '#cbd5e1' : '#64748b' }}>{r.jivoD ? `₹${r.jivoD}` : '—'}</span>
    },
    {
      key: 'idhayam',
      label: 'Idhayam',
      align: 'right',
      accessor: r => r.idhayamD,
      render: r => <span style={{ color: r.idhayamD ? '#cbd5e1' : '#64748b' }}>{r.idhayamD ? `₹${r.idhayamD}` : '—'}</span>
    },
    {
      key: 'mrGold',
      label: 'Mr. Gold',
      align: 'right',
      accessor: r => r.mrGoldD,
      render: r => <span style={{ color: r.mrGoldD ? '#cbd5e1' : '#64748b' }}>{r.mrGoldD ? `₹${r.mrGoldD}` : '—'}</span>
    },
    {
      key: 'vvd',
      label: 'VVD',
      align: 'right',
      accessor: r => r.vvdD,
      render: r => <span style={{ color: r.vvdD ? '#cbd5e1' : '#64748b' }}>{r.vvdD ? `₹${r.vvdD}` : '—'}</span>
    },
    {
      key: 'fortune',
      label: 'Fortune',
      align: 'right',
      accessor: r => r.fortuneD,
      render: r => <span style={{ color: r.fortuneD ? '#cbd5e1' : '#64748b' }}>{r.fortuneD ? `₹${r.fortuneD}` : '—'}</span>
    },
    {
      key: 'lowest',
      label: 'Lowest Competitor',
      align: 'right',
      accessor: r => r.lowestCompPrice,
      render: r => r.lowestCompPrice ? (
        <span style={{ fontSize: 11, color: '#facc15' }}>
          <strong>{r.lowestBrand}:</strong> ₹{r.lowestCompPrice}
        </span>
      ) : <span style={{ color: '#64748b' }}>—</span>
    }
  ]

  // Instamart Availability Columns
  const instaColumns = [
    {
      key: 'city',
      label: 'City',
      accessor: r => r.city,
      render: r => <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{formatCity(r.city)}</span>
    },
    {
      key: 'product',
      label: 'SKU / Product',
      accessor: r => r.product,
      render: r => <span style={{ color: '#38bdf8', fontWeight: 600 }}>{r.product}</span>
    },
    {
      key: 'statusD0',
      label: `Status (${formatShortDate(instaD)})`,
      align: 'center',
      accessor: r => r.statusD0,
      render: r => <AvailabilityPill status={r.statusD0} />
    },
    {
      key: 'statusD1',
      label: `Status (${formatShortDate(instaD1)})`,
      align: 'center',
      accessor: r => r.statusD1,
      render: r => <AvailabilityPill status={r.statusD1} />
    },
    {
      key: 'statusD2',
      label: `Status (${formatShortDate(instaD2)})`,
      align: 'center',
      accessor: r => r.statusD2,
      render: r => <AvailabilityPill status={r.statusD2} />
    },
    {
      key: 'shift',
      label: 'Stock Shift Classification',
      align: 'center',
      accessor: r => r.shift,
      render: r => (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 700,
          background: `${r.shiftColor}20`,
          color: r.shiftColor,
          border: `1px solid ${r.shiftColor}40`,
          whiteSpace: 'nowrap'
        }}>
          {r.shiftIcon} {r.shift}
        </span>
      )
    },
    {
      key: 'mrp',
      label: 'MRP (₹)',
      align: 'right',
      accessor: r => r.mrp,
      render: r => <span style={{ color: '#94a3b8' }}>{r.mrp ? `₹${r.mrp}` : '—'}</span>
    },
    {
      key: 'gemPriceD0',
      label: `Gem Price (${formatShortDate(instaD)})`,
      align: 'right',
      accessor: r => r.gemPriceD0,
      render: r => <span style={{ fontWeight: 700, color: '#22c55e' }}>{r.gemPriceD0 ? `₹${r.gemPriceD0}` : '—'}</span>
    },
    {
      key: 'priceDoD',
      label: 'Price DoD Delta',
      align: 'center',
      accessor: r => r.priceDoD,
      render: r => <PriceDeltaBadge delta={r.priceDoD} priceD={r.gemPriceD0} prevPrice={r.gemPriceD1} />
    },
    {
      key: 'discountPct',
      label: 'Discount %',
      align: 'right',
      accessor: r => r.discountPct,
      render: r => r.discountPct !== null ? (
        <span style={{ fontWeight: 600, color: '#c084fc' }}>{r.discountPct}% off</span>
      ) : <span style={{ color: '#64748b' }}>—</span>
    }
  ]

  // Filtered rows for Search
  const filteredCompetitorRows = useMemo(() => {
    if (!searchQuery.trim()) return competitorTrackingData
    const q = searchQuery.toLowerCase()
    return competitorTrackingData.filter(r => r.city.toLowerCase().includes(q) || r.product.toLowerCase().includes(q))
  }, [competitorTrackingData, searchQuery])

  const filteredInstaRows = useMemo(() => {
    if (!searchQuery.trim()) return instaAvailabilityData
    const q = searchQuery.toLowerCase()
    return instaAvailabilityData.filter(r => r.city.toLowerCase().includes(q) || r.product.toLowerCase().includes(q) || r.shift.toLowerCase().includes(q))
  }, [instaAvailabilityData, searchQuery])

  return (
    <>
      {/* HEADER SECTION */}
      <header>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>🔍</span>
            <h1 style={{ margin: 0 }}>Stock &amp; Price Parity Intelligence</h1>
          </div>
          <div className="date" style={{ marginTop: 4 }}>
            Day-on-Day (DoD) Competitor Price Tracking &amp; Instamart 3-Day Availability Monitor • Source: Google Sheets
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Date Selector Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1e293b', padding: '4px 8px', borderRadius: 8, border: '1px solid #334155' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>PRIMARY DATE:</span>
            <select
              value={dayD}
              onChange={e => setSelectedDate(e.target.value)}
              style={{
                background: '#0f172a',
                color: '#38bdf8',
                border: '1px solid #38bdf8',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {compDates.map(d => (
                <option key={d} value={d}>{formatPrettyDate(d)} (Day D)</option>
              ))}
            </select>
          </div>

          <button
            onClick={loadData}
            disabled={isRefreshing}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#38bdf8',
              fontSize: 12,
              fontWeight: 600,
              cursor: isRefreshing ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {isRefreshing ? '🔄 Refreshing...' : '🔄 Refresh Data'}
          </button>

          <a
            href={`https://docs.google.com/spreadsheets/d/${PARITY_SPREADSHEET_ID}/edit?usp=sharing`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              color: '#4ade80',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none'
            }}
          >
            📊 Source Sheet
          </a>

          <ProfileSection />
        </div>
      </header>

      {/* TOP EXECUTIVE KPI CARDS */}
      <div className="stats-grid" style={{ marginTop: 16, marginBottom: 20 }}>
        {/* Card 1: Gem Average Price */}
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">💎 Gem Avg Price (Day D)</div>
            <div className="stat-icon" style={{ background: '#3b82f626', color: '#3b82f6' }}>💰</div>
          </div>
          <div className="stat-value">₹{executiveKPIs.avgGemPrice}</div>
          <div style={{ fontSize: 11, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <PriceDeltaBadge delta={executiveKPIs.gemDoDDelta} priceD={executiveKPIs.avgGemPrice} prevPrice={executiveKPIs.avgGemPriceD1} />
            <span style={{ color: '#94a3b8' }}>vs {formatShortDate(dayDMinus1)}</span>
            {executiveKPIs.gem2DayDelta !== 0 && (
              <span style={{ color: '#64748b', fontSize: 10 }}>• 2-Day: {executiveKPIs.gem2DayDelta > 0 ? '+' : ''}₹{executiveKPIs.gem2DayDelta} vs {formatShortDate(dayDMinus2)}</span>
            )}
          </div>
        </div>

        {/* Card 2: Competitor Market Average Price */}
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">🏷️ Competitor Market Avg</div>
            <div className="stat-icon" style={{ background: '#eab30826', color: '#eab308' }}>⚖️</div>
          </div>
          <div className="stat-value">₹{executiveKPIs.marketAvgPrice}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            Average across {executiveKPIs.activeCitiesCount} active markets
          </div>
        </div>

        {/* Card 3: Gem vs Market Gap */}
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">📊 Gem vs Market Parity</div>
            <div className="stat-icon" style={{ background: executiveKPIs.gemVsMarketDiff > 0 ? '#ef444426' : '#22c55e26', color: executiveKPIs.gemVsMarketDiff > 0 ? '#f87171' : '#22c55e' }}>🎯</div>
          </div>
          <div className="stat-value" style={{ color: executiveKPIs.gemVsMarketDiff > 0 ? '#f87171' : '#4ade80' }}>
            {executiveKPIs.gemVsMarketDiff > 0 ? `+₹${executiveKPIs.gemVsMarketDiff}` : `-₹${Math.abs(executiveKPIs.gemVsMarketDiff)}`}
          </div>
          <div style={{ fontSize: 11, marginTop: 6 }}>
            <span style={{ color: executiveKPIs.gemVsMarketDiff > 0 ? '#f87171' : '#4ade80', fontWeight: 700 }}>
              {executiveKPIs.gemVsMarketDiff > 0 ? `▲ +${executiveKPIs.gemVsMarketPct}% Premium` : `▼ ${executiveKPIs.gemVsMarketPct}% Discount`}
            </span>
            <span style={{ color: '#94a3b8' }}> vs competitor brands</span>
          </div>
        </div>

        {/* Card 4: Instamart Availability Rate */}
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">📦 Instamart Availability</div>
            <div className="stat-icon" style={{ background: '#22c55e26', color: '#22c55e' }}>🛒</div>
          </div>
          <div className="stat-value" style={{ color: executiveKPIs.availRateD0 >= 80 ? '#22c55e' : executiveKPIs.availRateD0 >= 60 ? '#eab308' : '#ef4444' }}>
            {executiveKPIs.availRateD0}%
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            {executiveKPIs.availCountD0} / {executiveKPIs.totalInstaSKUs} SKUs Available • 3-Day: {executiveKPIs.availRateD2}% → {executiveKPIs.availRateD1}% → <strong style={{ color: '#f1f5f9' }}>{executiveKPIs.availRateD0}%</strong>
          </div>
        </div>

        {/* Card 5: Instamart Out of Stock */}
        <div className="stat-card">
          <div className="stat-header">
            <div className="stat-label">⛔ Instamart OOS SKUs</div>
            <div className="stat-icon" style={{ background: '#ef444426', color: '#ef4444' }}>🚨</div>
          </div>
          <div className="stat-value" style={{ color: '#f87171' }}>{executiveKPIs.oosCountD0}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
            {executiveKPIs.newlyOosCount > 0 ? (
              <span style={{ color: '#f87171', fontWeight: 700 }}>▲ {executiveKPIs.newlyOosCount} newly OOS</span>
            ) : (
              <span style={{ color: '#4ade80' }}>✓ No newly OOS</span>
            )}
            <span>• {executiveKPIs.restockedCount} Restocked</span>
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS & SUB-TABS BAR */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        background: '#1e293b',
        padding: '12px 16px',
        borderRadius: '12px 12px 0 0',
        border: '1px solid #334155',
        borderBottom: 'none'
      }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'competitors', label: `📊 Competitor Price Tracking (${filteredCompetitorRows.length})` },
            { id: 'insta_avail', label: `📦 Instamart 3-Day Availability (${filteredInstaRows.length})` },
            { id: 'alerts', label: `⚡ Price & Stock Alerts (${alertsList.length})` },
            { id: 'trends', label: '📈 Visual Trends & Charts' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid ' + (activeSubTab === t.id ? '#3b82f6' : '#334155'),
                background: activeSubTab === t.id ? '#3b82f6' : '#0f172a',
                color: activeSubTab === t.id ? '#ffffff' : '#94a3b8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Global Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* City Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>CITY:</span>
            <select
              value={selectedCity}
              onChange={e => setSelectedCity(e.target.value)}
              style={{
                background: '#0f172a',
                color: '#f1f5f9',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {allCities.map(c => (
                <option key={c} value={c}>{formatCity(c)}</option>
              ))}
            </select>
          </div>

          {/* Product Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>PRODUCT:</span>
            <select
              value={selectedProduct}
              onChange={e => setSelectedProduct(e.target.value)}
              style={{
                background: '#0f172a',
                color: '#f1f5f9',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <option value="All">All Products</option>
              {activeSubTab === 'competitors'
                ? allCompProducts.filter(p => p !== 'All').map(p => <option key={p} value={p}>{p}</option>)
                : allInstaProducts.filter(p => p !== 'All').map(p => <option key={p} value={p}>{p}</option>)
              }
            </select>
          </div>

          {/* Search Box */}
          <input
            type="text"
            placeholder="Search city, SKU..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#f1f5f9',
              padding: '4px 10px',
              fontSize: 12,
              width: 150
            }}
          />

          {/* Export CSV Button */}
          {activeSubTab === 'competitors' && (
            <CSVButton makeRows={exportCompetitorsCSV} filename={`competitor_price_tracking_${dayD}.csv`} />
          )}
          {activeSubTab === 'insta_avail' && (
            <CSVButton makeRows={exportInstaAvailabilityCSV} filename={`instamart_availability_tracking_${instaD}.csv`} />
          )}
        </div>
      </div>

      {/* CONTENT AREA BASED ON SUB-TAB */}
      <div style={{
        background: '#1e293b',
        borderRadius: '0 0 12px 12px',
        border: '1px solid #334155',
        overflow: 'hidden',
        marginBottom: 24,
        padding: activeSubTab === 'trends' ? 20 : 0
      }}>
        {/* SUB-TAB 1: COMPETITOR PRICE TRACKING */}
        {activeSubTab === 'competitors' && (
          <div>
            <div style={{ padding: '12px 16px', background: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Comparing <strong>💎 Gem</strong> vs <strong>Jivo, Idhayam, Mr. Gold, VVD, Fortune, Gold winner, etc.</strong> across <strong>{filteredCompetitorRows.length}</strong> city-product pairs • <strong>Day D ({formatPrettyDate(dayD)})</strong> vs <strong>Day D-1 ({formatPrettyDate(dayDMinus1)})</strong> vs <strong>Day D-2 ({formatPrettyDate(dayDMinus2)})</strong>
              </div>
            </div>
            <DataTable
              columns={competitorColumns}
              rows={filteredCompetitorRows}
              pageSize={15}
              filename={`competitor_prices_${dayD}.csv`}
              emptyMessage="No competitor records matching the selected filters"
            />
          </div>
        )}

        {/* SUB-TAB 2: INSTAMART 3-DAY AVAILABILITY TRACKER */}
        {activeSubTab === 'insta_avail' && (
          <div>
            <div style={{ padding: '12px 16px', background: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Tracking <strong>{filteredInstaRows.length}</strong> SKUs across <strong>25 cities</strong> on Instamart • Multi-Day Window: <strong>{formatPrettyDate(instaD3)} (D-3) → {formatPrettyDate(instaD2)} (D-2) → {formatPrettyDate(instaD1)} (D-1) → {formatPrettyDate(instaD)} (Day D)</strong>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                <span style={{ color: '#4ade80' }}>● {executiveKPIs.availCountD0} Available</span>
                <span style={{ color: '#f87171' }}>● {executiveKPIs.oosCountD0} OOS</span>
                <span style={{ color: '#facc15' }}>● {executiveKPIs.missingCount} Missing</span>
              </div>
            </div>
            <DataTable
              columns={instaColumns}
              rows={filteredInstaRows}
              pageSize={15}
              filename={`instamart_availability_${instaD}.csv`}
              emptyMessage="No Instamart records matching the selected filters"
            />
          </div>
        )}

        {/* SUB-TAB 3: ALERTS & STOCK SHIFTS */}
        {activeSubTab === 'alerts' && (
          <div style={{ padding: 20 }}>
            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { id: 'All', label: `All Alerts (${alertsList.length})` },
                { id: 'hikes', label: '🚀 Price Hikes' },
                { id: 'drops', label: '📉 Price Drops' },
                { id: 'newly_oos', label: '⛔ Newly Out of Stock' },
                { id: 'restocked', label: '🔄 Restocked SKUs' },
                { id: 'premium', label: '⚠️ High Premium vs Market' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setAlertFilter(f.id)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: '1px solid ' + (alertFilter === f.id ? '#3b82f6' : '#334155'),
                    background: alertFilter === f.id ? '#3b82f6' : '#0f172a',
                    color: alertFilter === f.id ? '#ffffff' : '#94a3b8',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {alertsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>No Alerts in this Category</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>All tracked prices and stock statuses are stable.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                {alertsList.map((alert, idx) => {
                  const borderCol = alert.severity === 'danger' ? '#ef4444' : alert.severity === 'warning' ? '#eab308' : alert.severity === 'success' ? '#22c55e' : '#3b82f6'
                  return (
                    <div
                      key={idx}
                      style={{
                        background: '#0f172a',
                        border: `1px solid ${borderCol}50`,
                        borderLeft: `4px solid ${borderCol}`,
                        borderRadius: 8,
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: borderCol }}>{alert.type}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{formatCity(alert.city)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{alert.product}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{alert.message}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 4: VISUAL TRENDS & CHARTS */}
        {activeSubTab === 'trends' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Chart 1: Price Comparison by City */}
            <div style={{ background: '#0f172a', padding: 16, borderRadius: 8, border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, color: '#f1f5f9' }}>Pet 1 L Price Comparison by City (Gem vs Competitors)</h3>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Day D ({formatPrettyDate(dayD)}) benchmark across major markets</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={competitorTrackingData.filter(r => r.product === 'Pet 1 L' && r.gemD !== null).slice(0, 10)}
                  margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="city" stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={formatCity} angle={-25} textAnchor="end" />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={v => `₹${v}`} />
                  <ReTooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                    formatter={(val, name) => [`₹${val}`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Bar dataKey="gemD" name="💎 Gem" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="jivoD" name="Jivo" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="compAvg" name="Market Avg" fill="#eab308" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Instamart City Availability Heatmap / Bar */}
            <div style={{ background: '#0f172a', padding: 16, borderRadius: 8, border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, color: '#f1f5f9' }}>Instamart SKUs Available vs Out of Stock by City</h3>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Stock health across top active cities on Instamart ({formatPrettyDate(instaD)})</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={(() => {
                    const cityMap = {}
                    instaAvailabilityData.forEach(r => {
                      if (!cityMap[r.city]) cityMap[r.city] = { city: r.city, available: 0, oos: 0, missing: 0 }
                      if (r.isAvailD0) cityMap[r.city].available += 1
                      else if (r.isOosD0) cityMap[r.city].oos += 1
                      else cityMap[r.city].missing += 1
                    })
                    return Object.values(cityMap).sort((a, b) => b.available - a.available).slice(0, 12)
                  })()}
                  margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="city" stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={formatCity} angle={-25} textAnchor="end" />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <ReTooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Bar dataKey="available" name="✓ Available" fill="#22c55e" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="oos" name="⛔ Out of Stock" fill="#ef4444" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="missing" name="⚠️ Missing" fill="#eab308" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </>
  )
}