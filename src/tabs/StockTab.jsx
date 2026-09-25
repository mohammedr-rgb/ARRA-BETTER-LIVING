import { useState, useEffect, useMemo, useCallback } from 'react'
import { num, parseCSV, csvEscape } from '../lib/utils'
import { ProfileSection, CSVButton } from '../components/ui'
import { DataTable } from '../components/DataTable'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend
} from 'recharts'

const SPREADSHEET_ID = '11kG7PuGGRWhABPFS-aErGvkHHf5tQPFf7r_J4WOE_ks'

// Normalize any date string to YYYY-MM-DD
function normalizeDateStr(dStr) {
  if (!dStr) return ''
  const s = String(dStr).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const parts = s.split(/[/-]/)
  if (parts.length === 3) {
    let m = parts[0], d = parts[1], y = parts[2]
    if (parts[0].length === 4) { y = parts[0]; m = parts[1]; d = parts[2]; }
    m = m.padStart(2, '0')
    d = d.padStart(2, '0')
    if (y.length === 2) y = '20' + y
    return `${y}-${m}-${d}`
  }
  return s
}

// Format YYYY-MM-DD to readable "24 Sep 2026"
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

// Price Indicator Badge
function PriceChangeBadge({ status, delta, deltaPct }) {
  if (status === 'INCREASED') {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        background: 'rgba(239, 68, 68, 0.15)',
        color: '#f87171',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        whiteSpace: 'nowrap'
      }}>
        ▲ +₹{Math.abs(delta).toFixed(1)} ({deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`})
      </span>
    )
  }
  if (status === 'DECREASED') {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        background: 'rgba(34, 197, 94, 0.15)',
        color: '#4ade80',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        whiteSpace: 'nowrap'
      }}>
        ▼ -₹{Math.abs(delta).toFixed(1)} ({deltaPct}%)
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 8px',
      borderRadius: 6,
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

// Volume Change Pill
function VolumeDeltaBadge({ delta, deltaPct }) {
  const isPos = delta > 0
  const isZero = delta === 0
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      padding: '2px 7px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 600,
      background: isZero ? 'rgba(148, 163, 184, 0.1)' : isPos ? 'rgba(59, 130, 246, 0.15)' : 'rgba(234, 179, 8, 0.15)',
      color: isZero ? '#94a3b8' : isPos ? '#60a5fa' : '#facc15',
      border: `1px solid ${isZero ? 'rgba(148, 163, 184, 0.2)' : isPos ? 'rgba(59, 130, 246, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
      whiteSpace: 'nowrap'
    }}>
      {isPos ? `+${delta}` : delta} ({isPos ? `+${deltaPct}%` : `${deltaPct}%`})
    </span>
  )
}

export default function StockTab() {
  const [activeSubTab, setActiveSubTab] = useState('comparison') // 'comparison' | 'pricelog' | 'insta' | 'blinkit' | 'city'
  const [platformFilter, setPlatformFilter] = useState('All') // 'All' | 'Instamart' | 'Blinkit'
  const [priceChangeFilter, setPriceChangeFilter] = useState('All') // 'All' | 'INCREASED' | 'DECREASED' | 'STABLE'
  const [searchQuery, setSearchQuery] = useState('')

  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [rawData, setRawData] = useState({ insta: [], blinkit: [] })

  // Load both sheets concurrently
  const loadData = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      const [resInsta, resBlinkit] = await Promise.all([
        fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=534975184`),
        fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=45158830`)
      ])

      if (!resInsta.ok || !resBlinkit.ok) {
        throw new Error('Failed to fetch data from one or more sheets.')
      }

      const instaText = await resInsta.text()
      const blinkitText = await resBlinkit.text()

      const instaParsed = parseCSV(instaText)
      const blinkitParsed = parseCSV(blinkitText)

      // Transform Instamart Rows
      const instaItems = instaParsed.map(r => {
        const date = normalizeDateStr(r.ORDERED_DATE)
        const units = num(r.UNITS_SOLD)
        const gmv = num(r.GMV)
        const net = num(r.Net)
        const baseMrp = num(r.BASE_MRP)
        const effectivePrice = units > 0 ? (gmv / units) : baseMrp
        return {
          platform: 'Instamart',
          platformIcon: '⚡',
          date,
          city: (r.CITY || '').trim().toLowerCase(),
          area: (r.AREA_NAME || '').trim(),
          storeId: r.STORE_ID || '',
          product: (r.PRODUCT_NAME || '').trim(),
          variant: (r.VARIANT || '').trim(),
          sku: `${(r.PRODUCT_NAME || '').trim()} (${(r.VARIANT || 'Std').trim()})`,
          itemCode: r.ITEM_CODE || '',
          units,
          gmv,
          net,
          baseMrp,
          effectivePrice: Number(effectivePrice.toFixed(2))
        }
      }).filter(i => i.date && (i.units > 0 || i.gmv > 0))

      // Transform Blinkit Rows
      const blinkitItems = blinkitParsed.map(r => {
        const date = normalizeDateStr(r.date)
        const units = num(r.qty_sold)
        const totalMrp = num(r.mrp)
        const net = num(r.Net)
        const unitMrp = units > 0 ? (totalMrp / units) : totalMrp
        const unitNet = units > 0 ? (net / units) : net
        return {
          platform: 'Blinkit',
          platformIcon: '🟡',
          date,
          city: (r.city_name || '').trim().toLowerCase(),
          area: '',
          storeId: r.city_id || '',
          product: (r.item_name || '').trim(),
          variant: '',
          sku: (r.item_name || '').trim(),
          itemCode: r.item_id || '',
          units,
          gmv: totalMrp,
          net,
          baseMrp: Number(unitMrp.toFixed(2)),
          effectivePrice: Number(unitNet.toFixed(2))
        }
      }).filter(i => i.date && (i.units > 0 || i.gmv > 0))

      setRawData({ insta: instaItems, blinkit: blinkitItems })
      setLoading(false)
      setIsRefreshing(false)
    } catch (e) {
      setError(e.message || 'Error loading stock feeds')
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Merged normalized item list
  const allItems = useMemo(() => {
    return [...rawData.insta, ...rawData.blinkit]
  }, [rawData])

  // Filtered by selected platform
  const platformFilteredItems = useMemo(() => {
    if (platformFilter === 'Instamart') return rawData.insta
    if (platformFilter === 'Blinkit') return rawData.blinkit
    return allItems
  }, [platformFilter, rawData, allItems])

  // Find the last 2 available data dates
  const availableDates = useMemo(() => {
    const set = new Set(platformFilteredItems.map(i => i.date).filter(Boolean))
    return Array.from(set).sort()
  }, [platformFilteredItems])

  const latestDate = availableDates[availableDates.length - 1] || ''
  const prevDate = availableDates[availableDates.length - 2] || ''

  // Custom comparison day selection (default to latest 2 days)
  const [selectedDayD, setSelectedDayD] = useState('')
  const [selectedDayPrev, setSelectedDayPrev] = useState('')

  useEffect(() => {
    if (latestDate && prevDate) {
      setSelectedDayD(latestDate)
      setSelectedDayPrev(prevDate)
    }
  }, [latestDate, prevDate])

  const effectiveDayD = selectedDayD || latestDate
  const effectiveDayPrev = selectedDayPrev || prevDate

  // Compute 2-Day Comparison Analysis
  const comparisonData = useMemo(() => {
    if (!effectiveDayD || !effectiveDayPrev) return []

    const dayDItems = platformFilteredItems.filter(i => i.date === effectiveDayD)
    const dayPrevItems = platformFilteredItems.filter(i => i.date === effectiveDayPrev)

    const map = {}
    const getEntry = (sku, platform) => {
      const key = `${platform}___${sku}`
      if (!map[key]) {
        map[key] = {
          key,
          sku,
          platform,
          dUnits: 0,
          dGmv: 0,
          dNet: 0,
          dPrices: [],
          dCities: new Set(),
          prevUnits: 0,
          prevGmv: 0,
          prevNet: 0,
          prevPrices: [],
          prevCities: new Set()
        }
      }
      return map[key]
    }

    dayDItems.forEach(i => {
      const e = getEntry(i.sku, i.platform)
      e.dUnits += i.units
      e.dGmv += i.gmv
      e.dNet += i.net
      if (i.effectivePrice > 0) e.dPrices.push(i.effectivePrice)
      if (i.city) e.dCities.add(i.city)
    })

    dayPrevItems.forEach(i => {
      const e = getEntry(i.sku, i.platform)
      e.prevUnits += i.units
      e.prevGmv += i.gmv
      e.prevNet += i.net
      if (i.effectivePrice > 0) e.prevPrices.push(i.effectivePrice)
      if (i.city) e.prevCities.add(i.city)
    })

    return Object.values(map).map(e => {
      const dAvgPrice = e.dUnits > 0 ? (e.dGmv / e.dUnits) : (e.dPrices.length ? e.dPrices[0] : 0)
      const prevAvgPrice = e.prevUnits > 0 ? (e.prevGmv / e.prevUnits) : (e.prevPrices.length ? e.prevPrices[0] : 0)
      const priceDelta = dAvgPrice - prevAvgPrice
      const priceDeltaPct = prevAvgPrice > 0 ? ((priceDelta / prevAvgPrice) * 100) : 0
      const unitDelta = e.dUnits - e.prevUnits
      const unitDeltaPct = e.prevUnits > 0 ? ((unitDelta / e.prevUnits) * 100) : (e.dUnits > 0 ? 100 : 0)
      const gmvDelta = e.dGmv - e.prevGmv
      const gmvDeltaPct = e.prevGmv > 0 ? ((gmvDelta / e.prevGmv) * 100) : (e.dGmv > 0 ? 100 : 0)

      let priceStatus = 'STABLE'
      if (priceDelta > 0.5) priceStatus = 'INCREASED'
      else if (priceDelta < -0.5) priceStatus = 'DECREASED'

      return {
        key: e.key,
        sku: e.sku,
        platform: e.platform,
        platformIcon: e.platform === 'Instamart' ? '⚡' : '🟡',
        dUnits: e.dUnits,
        prevUnits: e.prevUnits,
        unitDelta,
        unitDeltaPct: Number(unitDeltaPct.toFixed(1)),
        dGmv: Math.round(e.dGmv),
        prevGmv: Math.round(e.prevGmv),
        gmvDelta: Math.round(gmvDelta),
        gmvDeltaPct: Number(gmvDeltaPct.toFixed(1)),
        dAvgPrice: Number(dAvgPrice.toFixed(2)),
        prevAvgPrice: Number(prevAvgPrice.toFixed(2)),
        priceDelta: Number(priceDelta.toFixed(2)),
        priceDeltaPct: Number(priceDeltaPct.toFixed(1)),
        priceStatus,
        dCityCount: e.dCities.size,
        prevCityCount: e.prevCities.size
      }
    })
  }, [platformFilteredItems, effectiveDayD, effectiveDayPrev])

  // Filter comparison by search and price change status
  const filteredComparison = useMemo(() => {
    let list = comparisonData
    if (priceChangeFilter !== 'All') {
      list = list.filter(r => r.priceStatus === priceChangeFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(r => r.sku.toLowerCase().includes(q) || r.platform.toLowerCase().includes(q))
    }
    return list.sort((a, b) => b.dGmv - a.dGmv)
  }, [comparisonData, priceChangeFilter, searchQuery])

  // Aggregate Executive KPIs for the 2-day period
  const kpiStats = useMemo(() => {
    let totalDGmv = 0
    let totalPrevGmv = 0
    let totalDUnits = 0
    let totalPrevUnits = 0
    let priceHikes = 0
    let priceDrops = 0
    let priceStable = 0

    comparisonData.forEach(r => {
      totalDGmv += r.dGmv
      totalPrevGmv += r.prevGmv
      totalDUnits += r.dUnits
      totalPrevUnits += r.prevUnits
      if (r.priceStatus === 'INCREASED') priceHikes++
      else if (r.priceStatus === 'DECREASED') priceDrops++
      else priceStable++
    })

    const gmvGrowth = totalPrevGmv > 0 ? (((totalDGmv - totalPrevGmv) / totalPrevGmv) * 100).toFixed(1) : '0.0'
    const unitsGrowth = totalPrevUnits > 0 ? (((totalDUnits - totalPrevUnits) / totalPrevUnits) * 100).toFixed(1) : '0.0'
    const dAsp = totalDUnits > 0 ? (totalDGmv / totalDUnits).toFixed(1) : '0.0'
    const prevAsp = totalPrevUnits > 0 ? (totalPrevGmv / totalPrevUnits).toFixed(1) : '0.0'
    const aspDelta = (Number(dAsp) - Number(prevAsp)).toFixed(1)

    // Find top SKU by volume on Day D
    const topSKU = [...comparisonData].sort((a, b) => b.dUnits - a.dUnits)[0] || null

    return {
      totalDGmv,
      totalPrevGmv,
      gmvGrowth: Number(gmvGrowth),
      totalDUnits,
      totalPrevUnits,
      unitsGrowth: Number(unitsGrowth),
      dAsp: Number(dAsp),
      prevAsp: Number(prevAsp),
      aspDelta: Number(aspDelta),
      priceHikes,
      priceDrops,
      priceStable,
      topSKU
    }
  }, [comparisonData])

  // Daily Trend Chart Data (Last 14 days)
  const chartTrendData = useMemo(() => {
    const recentDates = availableDates.slice(-14)
    const map = {}
    recentDates.forEach(d => {
      map[d] = { date: formatPrettyDate(d), rawDate: d, gmv: 0, units: 0, asp: 0 }
    })

    platformFilteredItems.forEach(i => {
      if (map[i.date]) {
        map[i.date].gmv += i.gmv
        map[i.date].units += i.units
      }
    })

    return Object.values(map).map(d => ({
      ...d,
      gmv: Math.round(d.gmv),
      asp: d.units > 0 ? Math.round(d.gmv / d.units) : 0
    }))
  }, [availableDates, platformFilteredItems])

  // City-wise Price Variance Explorer
  const cityVarianceData = useMemo(() => {
    const dayItems = platformFilteredItems.filter(i => i.date === effectiveDayD)
    const map = {}

    dayItems.forEach(i => {
      const key = `${i.sku}___${i.city}`
      if (!map[key]) {
        map[key] = {
          sku: i.sku,
          platform: i.platform,
          city: i.city ? (i.city.charAt(0).toUpperCase() + i.city.slice(1)) : 'Unknown',
          units: 0,
          gmv: 0,
          prices: []
        }
      }
      map[key].units += i.units
      map[key].gmv += i.gmv
      if (i.effectivePrice > 0) map[key].prices.push(i.effectivePrice)
    })

    return Object.values(map).map(r => {
      const avgPrice = r.units > 0 ? (r.gmv / r.units) : (r.prices.length ? r.prices[0] : 0)
      return {
        ...r,
        avgPrice: Number(avgPrice.toFixed(2)),
        gmv: Math.round(r.gmv)
      }
    }).sort((a, b) => b.units - a.units)
  }, [platformFilteredItems, effectiveDayD])

  // CSV Exporters
  const makeComparisonCSV = () => {
    const headers = ['Platform', 'SKU', `Day D (${effectiveDayD}) Units`, `Day D-1 (${effectiveDayPrev}) Units`, 'Unit Delta', 'Unit Delta %', `Day D Price (₹)`, `Day D-1 Price (₹)`, 'Price Delta (₹)', 'Price Delta %', 'Price Status', `Day D GMV (₹)`, `Day D-1 GMV (₹)`, 'GMV Delta (₹)']
    const lines = filteredComparison.map(r => [
      csvEscape(r.platform),
      csvEscape(r.sku),
      r.dUnits,
      r.prevUnits,
      r.unitDelta,
      `${r.unitDeltaPct}%`,
      r.dAvgPrice,
      r.prevAvgPrice,
      r.priceDelta,
      `${r.priceDeltaPct}%`,
      r.priceStatus,
      r.dGmv,
      r.prevGmv,
      r.gmvDelta
    ].join(','))
    return [headers.join(','), ...lines]
  }

  const makeCityCSV = () => {
    const headers = ['Platform', 'SKU', 'City', 'Units Sold', 'Avg Price (₹)', 'Total GMV (₹)']
    const lines = cityVarianceData.map(r => [
      csvEscape(r.platform),
      csvEscape(r.sku),
      csvEscape(r.city),
      r.units,
      r.avgPrice,
      r.gmv
    ].join(','))
    return [headers.join(','), ...lines]
  }

  // DataTable columns for 2-Day Comparison
  const comparisonColumns = [
    {
      key: 'platform',
      label: 'Platform',
      render: r => (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 8px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 700,
          background: r.platform === 'Instamart' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(234, 179, 8, 0.15)',
          color: r.platform === 'Instamart' ? '#fb923c' : '#facc15',
          border: `1px solid ${r.platform === 'Instamart' ? 'rgba(249, 115, 22, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`
        }}>
          {r.platformIcon} {r.platform}
        </span>
      )
    },
    {
      key: 'sku',
      label: 'Product / SKU',
      render: r => <span style={{ fontWeight: 600, color: '#f8fafc' }}>{r.sku}</span>
    },
    {
      key: 'priceStatus',
      label: 'Price Action',
      render: r => <PriceChangeBadge status={r.priceStatus} delta={r.priceDelta} deltaPct={r.priceDeltaPct} />
    },
    {
      key: 'dAvgPrice',
      label: `Day D (₹)`,
      align: 'right',
      render: r => <span style={{ fontWeight: 700, color: '#f1f5f9' }}>₹{r.dAvgPrice}</span>
    },
    {
      key: 'prevAvgPrice',
      label: `Day D-1 (₹)`,
      align: 'right',
      render: r => <span style={{ color: '#94a3b8' }}>₹{r.prevAvgPrice}</span>
    },
    {
      key: 'dUnits',
      label: `Day D Qty`,
      align: 'right',
      render: r => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ fontWeight: 700, color: '#60a5fa' }}>{r.dUnits.toLocaleString()}</span>
          <VolumeDeltaBadge delta={r.unitDelta} deltaPct={r.unitDeltaPct} />
        </div>
      )
    },
    {
      key: 'prevUnits',
      label: `Day D-1 Qty`,
      align: 'right',
      render: r => <span style={{ color: '#94a3b8' }}>{r.prevUnits.toLocaleString()}</span>
    },
    {
      key: 'dGmv',
      label: `Day D Sales`,
      align: 'right',
      render: r => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ fontWeight: 700, color: '#34d399' }}>₹{r.dGmv.toLocaleString()}</span>
          <span style={{ fontSize: 10, color: r.gmvDelta >= 0 ? '#34d399' : '#f87171' }}>
            {r.gmvDelta >= 0 ? `+₹${r.gmvDelta.toLocaleString()}` : `-₹${Math.abs(r.gmvDelta).toLocaleString()}`}
          </span>
        </div>
      )
    },
    {
      key: 'prevGmv',
      label: `Day D-1 Sales`,
      align: 'right',
      render: r => <span style={{ color: '#94a3b8' }}>₹{r.prevGmv.toLocaleString()}</span>
    }
  ]

  // City Variance Columns
  const cityColumns = [
    {
      key: 'platform',
      label: 'Platform',
      render: r => (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 7px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          background: r.platform === 'Instamart' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(234, 179, 8, 0.15)',
          color: r.platform === 'Instamart' ? '#fb923c' : '#facc15'
        }}>
          {r.platform === 'Instamart' ? '⚡' : '🟡'} {r.platform}
        </span>
      )
    },
    { key: 'sku', label: 'Product / SKU', render: r => <span style={{ fontWeight: 600, color: '#f8fafc' }}>{r.sku}</span> },
    { key: 'city', label: 'City', render: r => <span style={{ color: '#cbd5e1', fontWeight: 500 }}>🏙️ {r.city}</span> },
    { key: 'units', label: 'Units Sold', align: 'right', render: r => <span style={{ fontWeight: 700, color: '#60a5fa' }}>{r.units.toLocaleString()}</span> },
    { key: 'avgPrice', label: 'Avg Effective Price', align: 'right', render: r => <span style={{ fontWeight: 700, color: '#f1f5f9' }}>₹{r.avgPrice}</span> },
    { key: 'gmv', label: 'GMV Revenue', align: 'right', render: r => <span style={{ fontWeight: 700, color: '#34d399' }}>₹{r.gmv.toLocaleString()}</span> }
  ]

  return (
    <>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 24, fontWeight: 700, color: '#f8fafc' }}>
            <span>📦 Stock &amp; Pricing Intelligence</span>
          </h1>
          <div className="date" style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
            Comparing last 2 days (<strong>{formatPrettyDate(effectiveDayD)}</strong> vs <strong>{formatPrettyDate(effectiveDayPrev)}</strong>) across Instamart &amp; Blinkit
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={loadData}
            disabled={isRefreshing}
            style={{
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 8,
              color: '#3b82f6',
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: isRefreshing ? 0.6 : 1
            }}
          >
            ↻ {isRefreshing ? 'Refreshing Feeds...' : 'Refresh Stock Feeds'}
          </button>
          <ProfileSection />
        </div>
      </header>

      {/* Primary KPI Row */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        {/* Latest GMV */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Day D Sales (GMV)</div>
            <div className="stat-icon" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>💰</div>
          </div>
          <div className="stat-value" style={{ fontSize: 22, fontWeight: 700, color: '#34d399' }}>
            ₹{kpiStats.totalDGmv.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: kpiStats.gmvGrowth >= 0 ? '#34d399' : '#f87171', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{kpiStats.gmvGrowth >= 0 ? '▲' : '▼'} {kpiStats.gmvGrowth >= 0 ? `+${kpiStats.gmvGrowth}%` : `${kpiStats.gmvGrowth}%`}</span>
            <span style={{ color: '#64748b' }}>vs D-1 (₹{kpiStats.totalPrevGmv.toLocaleString()})</span>
          </div>
        </div>

        {/* Latest Units Sold */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Day D Volume (Units)</div>
            <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>📦</div>
          </div>
          <div className="stat-value" style={{ fontSize: 22, fontWeight: 700, color: '#60a5fa' }}>
            {kpiStats.totalDUnits.toLocaleString()} units
          </div>
          <div style={{ fontSize: 11, color: kpiStats.unitsGrowth >= 0 ? '#60a5fa' : '#facc15', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{kpiStats.unitsGrowth >= 0 ? '▲' : '▼'} {kpiStats.unitsGrowth >= 0 ? `+${kpiStats.unitsGrowth}%` : `${kpiStats.unitsGrowth}%`}</span>
            <span style={{ color: '#64748b' }}>vs D-1 ({kpiStats.totalPrevUnits.toLocaleString()} units)</span>
          </div>
        </div>

        {/* Weighted ASP / Price */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Effective Avg Price (ASP)</div>
            <div className="stat-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>🏷️</div>
          </div>
          <div className="stat-value" style={{ fontSize: 22, fontWeight: 700, color: '#c084fc' }}>
            ₹{kpiStats.dAsp}
          </div>
          <div style={{ fontSize: 11, color: kpiStats.aspDelta > 0 ? '#f87171' : kpiStats.aspDelta < 0 ? '#4ade80' : '#94a3b8', marginTop: 6 }}>
            {kpiStats.aspDelta > 0 ? `▲ +₹${kpiStats.aspDelta} price increase` : kpiStats.aspDelta < 0 ? `▼ -₹${Math.abs(kpiStats.aspDelta)} price drop` : '━ Stable across days'}
          </div>
        </div>

        {/* Price Change Indicators */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>SKU Price Movements</div>
            <div className="stat-icon" style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>📊</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', fontSize: 12, fontWeight: 700 }}>
              ▲ {kpiStats.priceHikes} Hikes
            </span>
            <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontSize: 12, fontWeight: 700 }}>
              ▼ {kpiStats.priceDrops} Drops
            </span>
            <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
              ━ {kpiStats.priceStable} Stable
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
            Total {comparisonData.length} monitored SKUs
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18, background: '#1e293b', padding: '10px 14px', borderRadius: 10, border: '1px solid #334155' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'comparison', label: '📊 2-Day Comparison Matrix' },
            { id: 'trend', label: '📈 14-Day Price & Volume Trend' },
            { id: 'city', label: '🏙️ City / Store Price Variance' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                background: activeSubTab === tab.id ? '#3b82f6' : '#0f172a',
                color: activeSubTab === tab.id ? '#ffffff' : '#94a3b8',
                border: `1px solid ${activeSubTab === tab.id ? '#60a5fa' : '#334155'}`,
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Platform & Date Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Platform Toggle */}
          <div style={{ display: 'flex', background: '#0f172a', borderRadius: 8, padding: 3, border: '1px solid #334155' }}>
            {['All', 'Instamart', 'Blinkit'].map(p => (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                style={{
                  background: platformFilter === p ? '#334155' : 'transparent',
                  color: platformFilter === p ? '#f8fafc' : '#94a3b8',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {p === 'Instamart' ? '⚡ Insta' : p === 'Blinkit' ? '🟡 Blinkit' : '🌐 All'}
              </button>
            ))}
          </div>

          {/* Date Picker D vs D-1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
            <span>Day D:</span>
            <select
              value={effectiveDayD}
              onChange={e => setSelectedDayD(e.target.value)}
              style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '4px 8px', fontSize: 11 }}
            >
              {availableDates.map(d => <option key={d} value={d}>{formatPrettyDate(d)}</option>)}
            </select>

            <span>vs D-1:</span>
            <select
              value={effectiveDayPrev}
              onChange={e => setSelectedDayPrev(e.target.value)}
              style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '4px 8px', fontSize: 11 }}
            >
              {availableDates.map(d => <option key={d} value={d}>{formatPrettyDate(d)}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: 14, borderRadius: 8, color: '#ef4444', marginBottom: 20 }}>
          Failed to load stock data feeds: {error} — <a href="#" onClick={e => { e.preventDefault(); loadData() }} style={{ color: '#60a5fa', textDecoration: 'underline' }}>Retry</a>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div>Loading and synchronizing Raw Data of Insta &amp; Blinkit...</div>
        </div>
      ) : (
        <>
          {/* TAB 1: 2-DAY COMPARISON MATRIX */}
          {activeSubTab === 'comparison' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                    SKU 2-Day Price &amp; Volume Comparison
                  </h3>
                  {/* Price Filter Chips */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { id: 'All', label: 'All SKUs' },
                      { id: 'INCREASED', label: '▲ Price Hikes' },
                      { id: 'DECREASED', label: '▼ Price Drops' },
                      { id: 'STABLE', label: '━ Stable' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setPriceChangeFilter(f.id)}
                        style={{
                          background: priceChangeFilter === f.id ? '#334155' : 'rgba(15, 23, 42, 0.6)',
                          color: priceChangeFilter === f.id ? '#60a5fa' : '#94a3b8',
                          border: `1px solid ${priceChangeFilter === f.id ? '#60a5fa' : '#334155'}`,
                          borderRadius: 6,
                          padding: '3px 9px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="text"
                    placeholder="Search SKU or platform..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: 6,
                      color: '#f8fafc',
                      padding: '5px 12px',
                      fontSize: 12,
                      outline: 'none',
                      width: 200
                    }}
                  />
                  <CSVButton makeRows={makeComparisonCSV} filename={`stock_2day_comparison_${effectiveDayD}.csv`} />
                </div>
              </div>

              <DataTable
                columns={comparisonColumns}
                rows={filteredComparison}
                pageSize={15}
                emptyMessage="No SKU data matches the selected filters."
              />
            </div>
          )}

          {/* TAB 2: 14-DAY PRICE & VOLUME TREND */}
          {activeSubTab === 'trend' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                  14-Day Sales Velocity &amp; Average Selling Price (ASP) Movement
                </h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Tracking daily aggregate GMV (₹) and effective ASP (₹/unit)
                </div>
              </div>

              <div style={{ width: '100%', height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis yAxisId="left" stroke="#34d399" fontSize={11} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#c084fc" fontSize={11} tickFormatter={v => `₹${v}`} />
                    <ReTooltip
                      contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: 8, color: '#f8fafc' }}
                      formatter={(val, name) => [name === 'Sales (GMV)' ? `₹${val.toLocaleString()}` : name === 'Units Sold' ? `${val.toLocaleString()} units` : `₹${val}`, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="gmv" name="Sales (GMV)" stroke="#34d399" strokeWidth={2.5} dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="asp" name="Effective ASP" stroke="#c084fc" strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* TAB 3: CITY / STORE PRICE VARIANCE */}
          {activeSubTab === 'city' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                    City-Level Price &amp; Volume Breakdown on Day D ({formatPrettyDate(effectiveDayD)})
                  </h3>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Highlighting regional price differences across cities (e.g. Chennai, Salem, Hyderabad, Coimbatore)
                  </div>
                </div>
                <CSVButton makeRows={makeCityCSV} filename={`city_price_variance_${effectiveDayD}.csv`} />
              </div>

              <DataTable
                columns={cityColumns}
                rows={cityVarianceData}
                pageSize={15}
                emptyMessage="No city variance records found for this date."
              />
            </div>
          )}
        </>
      )}
    </>
  )
}