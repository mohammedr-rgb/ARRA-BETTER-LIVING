import { useState, useEffect, useMemo, useCallback } from 'react'
import { num, parseCSV, csvEscape } from '../lib/utils'
import { ProfileSection, CSVButton } from '../components/ui'
import { DataTable } from '../components/DataTable'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend
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

// Capitalize City
function formatCityName(city) {
  if (!city) return 'Unknown'
  return city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
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
  const [activeSubTab, setActiveSubTab] = useState('comparison') // 'comparison' | 'city' | 'platform' | 'trend'
  const [platformFilter, setPlatformFilter] = useState('All') // 'All' | 'Instamart' | 'Blinkit'
  const [priceChangeFilter, setPriceChangeFilter] = useState('All') // 'All' | 'INCREASED' | 'DECREASED' | 'STABLE'
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCityDrilldown, setSelectedCityDrilldown] = useState('All')

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

  // ==================== 1. SKU 2-DAY COMPARISON ====================
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
      priceStable
    }
  }, [comparisonData])

  // ==================== 2. CITY-WISE 2-DAY COMPARISON ====================
  const cityComparisonData = useMemo(() => {
    if (!effectiveDayD || !effectiveDayPrev) return []

    const dayDItems = platformFilteredItems.filter(i => i.date === effectiveDayD)
    const dayPrevItems = platformFilteredItems.filter(i => i.date === effectiveDayPrev)

    const map = {}
    const getCityEntry = (city) => {
      const cKey = city || 'unknown'
      if (!map[cKey]) {
        map[cKey] = {
          city: cKey,
          dUnits: 0, dGmv: 0, dSkus: {},
          prevUnits: 0, prevGmv: 0, prevSkus: {},
          platforms: new Set()
        }
      }
      return map[cKey]
    }

    dayDItems.forEach(i => {
      const e = getCityEntry(i.city)
      e.dUnits += i.units
      e.dGmv += i.gmv
      e.platforms.add(i.platform)
      e.dSkus[i.sku] = (e.dSkus[i.sku] || 0) + i.units
    })

    dayPrevItems.forEach(i => {
      const e = getCityEntry(i.city)
      e.prevUnits += i.units
      e.prevGmv += i.gmv
      e.platforms.add(i.platform)
      e.prevSkus[i.sku] = (e.prevSkus[i.sku] || 0) + i.units
    })

    return Object.values(map).map(e => {
      const dAvgPrice = e.dUnits > 0 ? Math.round(e.dGmv / e.dUnits) : 0
      const prevAvgPrice = e.prevUnits > 0 ? Math.round(e.prevGmv / e.prevUnits) : 0
      const priceDelta = dAvgPrice - prevAvgPrice
      const priceDeltaPct = prevAvgPrice > 0 ? Number(((priceDelta / prevAvgPrice) * 100).toFixed(1)) : 0
      const unitDelta = e.dUnits - e.prevUnits
      const unitDeltaPct = e.prevUnits > 0 ? Number(((unitDelta / e.prevUnits) * 100).toFixed(1)) : (e.dUnits > 0 ? 100 : 0)
      const gmvDelta = e.dGmv - e.prevGmv
      const gmvDeltaPct = e.prevGmv > 0 ? Number(((gmvDelta / e.prevGmv) * 100).toFixed(1)) : (e.dGmv > 0 ? 100 : 0)

      let priceStatus = 'STABLE'
      if (priceDelta > 1) priceStatus = 'INCREASED'
      else if (priceDelta < -1) priceStatus = 'DECREASED'

      // Top SKU in city
      const topSKUEntry = Object.entries(e.dSkus).sort((a, b) => b[1] - a[1])[0]
      const topSKU = topSKUEntry ? `${topSKUEntry[0]} (${topSKUEntry[1]} units)` : '—'

      return {
        city: e.city,
        formattedCity: formatCityName(e.city),
        platforms: Array.from(e.platforms).join(', '),
        dUnits: e.dUnits,
        prevUnits: e.prevUnits,
        unitDelta,
        unitDeltaPct,
        dGmv: Math.round(e.dGmv),
        prevGmv: Math.round(e.prevGmv),
        gmvDelta: Math.round(gmvDelta),
        gmvDeltaPct,
        dAvgPrice,
        prevAvgPrice,
        priceDelta,
        priceDeltaPct,
        priceStatus,
        topSKU
      }
    }).sort((a, b) => b.dGmv - a.dGmv)
  }, [platformFilteredItems, effectiveDayD, effectiveDayPrev])

  // Top 10 cities chart data
  const topCitiesChartData = useMemo(() => {
    return cityComparisonData.slice(0, 10).map(c => ({
      city: c.formattedCity,
      dGmv: c.dGmv,
      prevGmv: c.prevGmv,
      dUnits: c.dUnits
    }))
  }, [cityComparisonData])

  // Filtered City SKU drilldown
  const cityDrilldownRows = useMemo(() => {
    if (selectedCityDrilldown === 'All') return []
    const c = selectedCityDrilldown.toLowerCase()
    const dayDItems = platformFilteredItems.filter(i => i.date === effectiveDayD && i.city === c)
    const dayPrevItems = platformFilteredItems.filter(i => i.date === effectiveDayPrev && i.city === c)

    const map = {}
    dayDItems.forEach(i => {
      const key = `${i.platform}___${i.sku}`
      if (!map[key]) map[key] = { sku: i.sku, platform: i.platform, dUnits: 0, dGmv: 0, prevUnits: 0, prevGmv: 0 }
      map[key].dUnits += i.units
      map[key].dGmv += i.gmv
    })
    dayPrevItems.forEach(i => {
      const key = `${i.platform}___${i.sku}`
      if (!map[key]) map[key] = { sku: i.sku, platform: i.platform, dUnits: 0, dGmv: 0, prevUnits: 0, prevGmv: 0 }
      map[key].prevUnits += i.units
      map[key].prevGmv += i.gmv
    })

    return Object.values(map).map(r => {
      const dPrice = r.dUnits > 0 ? (r.dGmv / r.dUnits).toFixed(1) : '0'
      const prevPrice = r.prevUnits > 0 ? (r.prevGmv / r.prevUnits).toFixed(1) : '0'
      const pDelta = Number(dPrice) - Number(prevPrice)
      return {
        ...r,
        dPrice: Number(dPrice),
        prevPrice: Number(prevPrice),
        pDelta: Number(pDelta.toFixed(1)),
        dGmv: Math.round(r.dGmv),
        prevGmv: Math.round(r.prevGmv)
      }
    }).sort((a, b) => b.dGmv - a.dGmv)
  }, [selectedCityDrilldown, platformFilteredItems, effectiveDayD, effectiveDayPrev])

  // ==================== 3. PLATFORM-WISE COMPARISON (Instamart vs Blinkit) ====================
  const platformComparisonSummary = useMemo(() => {
    if (!effectiveDayD || !effectiveDayPrev) return null

    const computeFor = (items, platformName) => {
      const dayD = items.filter(i => i.date === effectiveDayD)
      const dayPrev = items.filter(i => i.date === effectiveDayPrev)

      const dGmv = Math.round(dayD.reduce((s, i) => s + i.gmv, 0))
      const prevGmv = Math.round(dayPrev.reduce((s, i) => s + i.gmv, 0))
      const dUnits = dayD.reduce((s, i) => s + i.units, 0)
      const prevUnits = dayPrev.reduce((s, i) => s + i.units, 0)

      const dAsp = dUnits > 0 ? Number((dGmv / dUnits).toFixed(1)) : 0
      const prevAsp = prevUnits > 0 ? Number((prevGmv / prevUnits).toFixed(1)) : 0
      const gmvGrowth = prevGmv > 0 ? Number((((dGmv - prevGmv) / prevGmv) * 100).toFixed(1)) : 0
      const unitsGrowth = prevUnits > 0 ? Number((((dUnits - prevUnits) / prevUnits) * 100).toFixed(1)) : 0

      const dCities = new Set(dayD.map(i => i.city).filter(Boolean)).size
      const dSkus = new Set(dayD.map(i => i.sku)).size

      return {
        platform: platformName,
        dGmv,
        prevGmv,
        gmvGrowth,
        dUnits,
        prevUnits,
        unitsGrowth,
        dAsp,
        prevAsp,
        aspDelta: Number((dAsp - prevAsp).toFixed(1)),
        dCities,
        dSkus
      }
    }

    const instaStats = computeFor(rawData.insta, 'Instamart')
    const blinkitStats = computeFor(rawData.blinkit, 'Blinkit')

    const totalGmv = instaStats.dGmv + blinkitStats.dGmv
    const totalUnits = instaStats.dUnits + blinkitStats.dUnits

    const instaGmvShare = totalGmv > 0 ? Number(((instaStats.dGmv / totalGmv) * 100).toFixed(1)) : 0
    const blinkitGmvShare = totalGmv > 0 ? Number(((blinkitStats.dGmv / totalGmv) * 100).toFixed(1)) : 0

    const instaUnitShare = totalUnits > 0 ? Number(((instaStats.dUnits / totalUnits) * 100).toFixed(1)) : 0
    const blinkitUnitShare = totalUnits > 0 ? Number(((blinkitStats.dUnits / totalUnits) * 100).toFixed(1)) : 0

    return {
      insta: instaStats,
      blinkit: blinkitStats,
      totalGmv,
      totalUnits,
      instaGmvShare,
      blinkitGmvShare,
      instaUnitShare,
      blinkitUnitShare
    }
  }, [rawData, effectiveDayD, effectiveDayPrev])

  // Cross-Platform SKU Price Matrix (Matching SKUs on Day D)
  const crossPlatformSKUComparison = useMemo(() => {
    if (!effectiveDayD) return []

    const instaDayD = rawData.insta.filter(i => i.date === effectiveDayD)
    const blinkitDayD = rawData.blinkit.filter(i => i.date === effectiveDayD)

    const map = {}
    instaDayD.forEach(i => {
      const key = i.product.toLowerCase().replace(/[^a-z0-9]/g, ' ')
      if (!map[key]) map[key] = { label: i.product, instaPrice: 0, instaUnits: 0, blinkitPrice: 0, blinkitUnits: 0 }
      map[key].instaUnits += i.units
      map[key].instaPrice = i.effectivePrice
    })

    blinkitDayD.forEach(i => {
      const key = i.product.toLowerCase().replace(/[^a-z0-9]/g, ' ')
      if (!map[key]) map[key] = { label: i.product, instaPrice: 0, instaUnits: 0, blinkitPrice: 0, blinkitUnits: 0 }
      map[key].blinkitUnits += i.units
      map[key].blinkitPrice = i.effectivePrice
    })

    return Object.values(map).map(r => {
      const diff = (r.instaPrice > 0 && r.blinkitPrice > 0) ? Number((r.blinkitPrice - r.instaPrice).toFixed(1)) : 0
      return {
        ...r,
        priceDiff: diff,
        status: diff > 0 ? 'Blinkit Higher' : diff < 0 ? 'Instamart Higher' : 'Equal Price'
      }
    }).sort((a, b) => (b.instaUnits + b.blinkitUnits) - (a.instaUnits + a.blinkitUnits))
  }, [rawData, effectiveDayD])

  // ==================== 4. 14-DAY TREND CHART ====================
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

  const makeCityComparisonCSV = () => {
    const headers = ['City', 'Platforms', `Day D (${effectiveDayD}) Units`, `Day D-1 (${effectiveDayPrev}) Units`, 'Unit Delta %', `Day D GMV (₹)`, `Day D-1 GMV (₹)`, 'GMV Delta %', 'Day D Avg Price (₹)', 'Day D-1 Avg Price (₹)', 'Price Delta (₹)', 'Top SKU']
    const lines = cityComparisonData.map(r => [
      csvEscape(r.formattedCity),
      csvEscape(r.platforms),
      r.dUnits,
      r.prevUnits,
      `${r.unitDeltaPct}%`,
      r.dGmv,
      r.prevGmv,
      `${r.gmvDeltaPct}%`,
      r.dAvgPrice,
      r.prevAvgPrice,
      r.priceDelta,
      csvEscape(r.topSKU)
    ].join(','))
    return [headers.join(','), ...lines]
  }

  // DataTable columns for SKU 2-Day Comparison
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

  // DataTable columns for City-Wise Comparison
  const cityComparisonColumns = [
    {
      key: 'formattedCity',
      label: 'City',
      render: r => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, color: '#f8fafc' }}>🏙️ {r.formattedCity}</span>
          <span style={{ fontSize: 10, color: '#64748b' }}>({r.platforms})</span>
        </div>
      )
    },
    {
      key: 'dUnits',
      label: `Day D Units`,
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
      label: `Day D-1 Units`,
      align: 'right',
      render: r => <span style={{ color: '#94a3b8' }}>{r.prevUnits.toLocaleString()}</span>
    },
    {
      key: 'dGmv',
      label: `Day D Sales (GMV)`,
      align: 'right',
      render: r => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ fontWeight: 700, color: '#34d399' }}>₹{r.dGmv.toLocaleString()}</span>
          <span style={{ fontSize: 10, color: r.gmvDelta >= 0 ? '#34d399' : '#f87171' }}>
            {r.gmvDelta >= 0 ? `+${r.gmvDeltaPct}%` : `${r.gmvDeltaPct}%`}
          </span>
        </div>
      )
    },
    {
      key: 'prevGmv',
      label: `Day D-1 Sales`,
      align: 'right',
      render: r => <span style={{ color: '#94a3b8' }}>₹{r.prevGmv.toLocaleString()}</span>
    },
    {
      key: 'dAvgPrice',
      label: `Day D ASP`,
      align: 'right',
      render: r => <span style={{ fontWeight: 700, color: '#c084fc' }}>₹{r.dAvgPrice}</span>
    },
    {
      key: 'topSKU',
      label: 'Top Volume SKU',
      render: r => <span style={{ fontSize: 12, color: '#cbd5e1' }}>{r.topSKU}</span>
    }
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
            {kpiStats.aspDelta > 0 ? `▲ +₹${kpiStats.aspDelta} price hike` : kpiStats.aspDelta < 0 ? `▼ -₹${Math.abs(kpiStats.aspDelta)} price drop` : '━ Stable across days'}
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
            { id: 'comparison', label: '📊 SKU Comparison' },
            { id: 'city', label: '🏙️ City-Wise Comparison' },
            { id: 'platform', label: '⚡ Platform-Wise (Insta vs Blinkit)' },
            { id: 'trend', label: '📈 14-Day Velocity & Trend' }
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
          {/* TAB 1: 2-DAY SKU COMPARISON MATRIX */}
          {activeSubTab === 'comparison' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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

          {/* TAB 2: CITY-WISE COMPARISON VIEW */}
          {activeSubTab === 'city' && (
            <div>
              {/* City Top Ranking Chart */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                    Top 10 Performing Cities (Day D vs Day D-1 GMV Sales)
                  </h3>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Comparing sales revenue across leading geographic markets on <strong>{formatPrettyDate(effectiveDayD)}</strong>
                  </div>
                </div>

                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topCitiesChartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="city" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                      <ReTooltip
                        contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: 8, color: '#f8fafc' }}
                        formatter={(val, name) => [`₹${val.toLocaleString()}`, name === 'dGmv' ? `Day D (${effectiveDayD})` : `Day D-1 (${effectiveDayPrev})`]}
                      />
                      <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} formatter={name => name === 'dGmv' ? `Day D Sales` : `Day D-1 Sales`} />
                      <Bar dataKey="dGmv" fill="#3b82f6" radius={[4, 4, 0, 0]} name="dGmv" />
                      <Bar dataKey="prevGmv" fill="#64748b" radius={[4, 4, 0, 0]} name="prevGmv" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* City Comparison Table */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                      All Cities 2-Day Performance &amp; Pricing Table
                    </h3>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      Tracking {cityComparisonData.length} active cities across platforms
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <select
                      value={selectedCityDrilldown}
                      onChange={e => setSelectedCityDrilldown(e.target.value)}
                      style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f8fafc', padding: '5px 10px', fontSize: 12 }}
                    >
                      <option value="All">Select City Drilldown...</option>
                      {cityComparisonData.map(c => <option key={c.city} value={c.city}>{c.formattedCity}</option>)}
                    </select>
                    <CSVButton makeRows={makeCityComparisonCSV} filename={`city_2day_comparison_${effectiveDayD}.csv`} />
                  </div>
                </div>

                <DataTable
                  columns={cityComparisonColumns}
                  rows={cityComparisonData}
                  pageSize={15}
                  emptyMessage="No city records found for the selected period."
                />
              </div>

              {/* City SKU Drilldown Modal / Section */}
              {selectedCityDrilldown !== 'All' && (
                <div style={{ background: '#0f172a', border: '1px solid #3b82f6', borderRadius: 12, padding: 18, marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#60a5fa' }}>
                        🏙️ SKU Price &amp; Volume Drilldown for {formatCityName(selectedCityDrilldown)}
                      </h4>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        Day D vs Day D-1 performance in this specific market
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedCityDrilldown('All')}
                      style={{ background: '#334155', border: 'none', borderRadius: 6, color: '#f8fafc', padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
                    >
                      ✕ Close Drilldown
                    </button>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                        <th style={{ padding: '8px 6px' }}>Platform</th>
                        <th style={{ padding: '8px 6px' }}>SKU</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>Day D Units</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>Day D-1 Units</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>Day D Price</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>Day D-1 Price</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>Day D GMV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cityDrilldownRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                          <td style={{ padding: '8px 6px', color: r.platform === 'Instamart' ? '#fb923c' : '#facc15', fontWeight: 600 }}>
                            {r.platform === 'Instamart' ? '⚡ Insta' : '🟡 Blinkit'}
                          </td>
                          <td style={{ padding: '8px 6px', fontWeight: 600, color: '#f8fafc' }}>{r.sku}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#60a5fa', fontWeight: 700 }}>{r.dUnits}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#94a3b8' }}>{r.prevUnits}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#f1f5f9', fontWeight: 700 }}>₹{r.dPrice}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#94a3b8' }}>₹{r.prevPrice}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>₹{r.dGmv.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PLATFORM-WISE COMPARISON (Instamart vs Blinkit) */}
          {activeSubTab === 'platform' && platformComparisonSummary && (
            <div>
              {/* Head-to-Head Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
                {/* Instamart Card */}
                <div style={{ background: '#1e293b', border: '1px solid rgba(249, 115, 22, 0.4)', borderRadius: 12, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>⚡</span>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fb923c' }}>Swiggy Instamart</h3>
                    </div>
                    <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', fontSize: 11, fontWeight: 700 }}>
                      {platformComparisonSummary.instaGmvShare}% Sales Share
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div style={{ background: '#0f172a', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Day D Sales (GMV)</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#34d399', marginTop: 3 }}>
                        ₹{platformComparisonSummary.insta.dGmv.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, color: platformComparisonSummary.insta.gmvGrowth >= 0 ? '#34d399' : '#f87171', marginTop: 2 }}>
                        {platformComparisonSummary.insta.gmvGrowth >= 0 ? `▲ +${platformComparisonSummary.insta.gmvGrowth}%` : `▼ ${platformComparisonSummary.insta.gmvGrowth}%`} vs D-1
                      </div>
                    </div>

                    <div style={{ background: '#0f172a', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Day D Volume</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', marginTop: 3 }}>
                        {platformComparisonSummary.insta.dUnits.toLocaleString()} units
                      </div>
                      <div style={{ fontSize: 10, color: platformComparisonSummary.insta.unitsGrowth >= 0 ? '#60a5fa' : '#facc15', marginTop: 2 }}>
                        {platformComparisonSummary.insta.unitsGrowth >= 0 ? `▲ +${platformComparisonSummary.insta.unitsGrowth}%` : `▼ ${platformComparisonSummary.insta.unitsGrowth}%`} vs D-1
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1', paddingTop: 8, borderTop: '1px solid #334155' }}>
                    <span>Effective ASP: <strong style={{ color: '#c084fc' }}>₹{platformComparisonSummary.insta.dAsp}</strong></span>
                    <span>Active Cities: <strong style={{ color: '#f8fafc' }}>{platformComparisonSummary.insta.dCities}</strong></span>
                    <span>Active SKUs: <strong style={{ color: '#f8fafc' }}>{platformComparisonSummary.insta.dSkus}</strong></span>
                  </div>
                </div>

                {/* Blinkit Card */}
                <div style={{ background: '#1e293b', border: '1px solid rgba(234, 179, 8, 0.4)', borderRadius: 12, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>🟡</span>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#facc15' }}>Blinkit</h3>
                    </div>
                    <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', fontSize: 11, fontWeight: 700 }}>
                      {platformComparisonSummary.blinkitGmvShare}% Sales Share
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div style={{ background: '#0f172a', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Day D Sales (GMV)</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#34d399', marginTop: 3 }}>
                        ₹{platformComparisonSummary.blinkit.dGmv.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, color: platformComparisonSummary.blinkit.gmvGrowth >= 0 ? '#34d399' : '#f87171', marginTop: 2 }}>
                        {platformComparisonSummary.blinkit.gmvGrowth >= 0 ? `▲ +${platformComparisonSummary.blinkit.gmvGrowth}%` : `▼ ${platformComparisonSummary.blinkit.gmvGrowth}%`} vs D-1
                      </div>
                    </div>

                    <div style={{ background: '#0f172a', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Day D Volume</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', marginTop: 3 }}>
                        {platformComparisonSummary.blinkit.dUnits.toLocaleString()} units
                      </div>
                      <div style={{ fontSize: 10, color: platformComparisonSummary.blinkit.unitsGrowth >= 0 ? '#60a5fa' : '#facc15', marginTop: 2 }}>
                        {platformComparisonSummary.blinkit.unitsGrowth >= 0 ? `▲ +${platformComparisonSummary.blinkit.unitsGrowth}%` : `▼ ${platformComparisonSummary.blinkit.unitsGrowth}%`} vs D-1
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1', paddingTop: 8, borderTop: '1px solid #334155' }}>
                    <span>Effective ASP: <strong style={{ color: '#c084fc' }}>₹{platformComparisonSummary.blinkit.dAsp}</strong></span>
                    <span>Active Cities: <strong style={{ color: '#f8fafc' }}>{platformComparisonSummary.blinkit.dCities}</strong></span>
                    <span>Active SKUs: <strong style={{ color: '#f8fafc' }}>{platformComparisonSummary.blinkit.dSkus}</strong></span>
                  </div>
                </div>
              </div>

              {/* Cross-Platform SKU Price Matrix */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
                <div style={{ marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                    Cross-Platform SKU Pricing &amp; Unit Sales Matrix
                  </h3>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Side-by-side comparison of product prices and volumes on Instamart vs Blinkit on <strong>{formatPrettyDate(effectiveDayD)}</strong>
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '10px 8px' }}>Product</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#fb923c' }}>⚡ Insta Price</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#fb923c' }}>⚡ Insta Units</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#facc15' }}>🟡 Blinkit Price</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#facc15' }}>🟡 Blinkit Units</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }}>Price Variance Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossPlatformSKUComparison.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 600, color: '#f8fafc' }}>{r.label}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#f1f5f9' }}>
                          {r.instaPrice > 0 ? `₹${r.instaPrice}` : '—'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#60a5fa', fontWeight: 600 }}>
                          {r.instaUnits > 0 ? r.instaUnits.toLocaleString() : '0'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#f1f5f9' }}>
                          {r.blinkitPrice > 0 ? `₹${r.blinkitPrice}` : '—'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#60a5fa', fontWeight: 600 }}>
                          {r.blinkitUnits > 0 ? r.blinkitUnits.toLocaleString() : '0'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          {r.instaPrice > 0 && r.blinkitPrice > 0 ? (
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: r.priceDiff !== 0 ? 'rgba(234, 179, 8, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                              color: r.priceDiff !== 0 ? '#facc15' : '#4ade80'
                            }}>
                              {r.priceDiff !== 0 ? `Diff: ₹${Math.abs(r.priceDiff)} (${r.status})` : '✓ Parity Price'}
                            </span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: 11 }}>Single Platform SKU</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: 14-DAY PRICE & VOLUME TREND */}
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
        </>
      )}
    </>
  )
}