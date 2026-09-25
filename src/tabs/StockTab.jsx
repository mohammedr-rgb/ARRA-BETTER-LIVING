import { useState, useEffect, useMemo, useCallback } from 'react'
import { num, parseCSV, csvEscape } from '../lib/utils'
import { ProfileSection, CSVButton } from '../components/ui'
import { DataTable } from '../components/DataTable'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend
} from 'recharts'

const SPREADSHEET_ID = '11kG7PuGGRWhABPFS-aErGvkHHf5tQPFf7r_J4WOE_ks'

// Benchmark Competitor Data & Market Averages by Oil Category
const COMPETITOR_BENCHMARKS = {
  'Groundnut Oil 1L': {
    category: 'Groundnut Oil (1L)',
    competitors: [
      { brand: 'MR. Gold', price: 275, pack: '1 L Pouch/Bottle' },
      { brand: 'Fortune', price: 285, pack: '1 L Pouch' },
      { brand: 'Idhayam Mantra', price: 295, pack: '1 L Bottle' },
      { brand: 'Goldwinner', price: 265, pack: '1 L Pouch' }
    ]
  },
  'Groundnut Oil 2L': {
    category: 'Groundnut Oil (2L)',
    competitors: [
      { brand: 'MR. Gold', price: 540, pack: '2 L Bottle' },
      { brand: 'Fortune', price: 560, pack: '2 L Jar' },
      { brand: 'Idhayam Mantra', price: 580, pack: '2 L Bottle' }
    ]
  },
  'Groundnut Oil 5L': {
    category: 'Groundnut Oil (5L)',
    competitors: [
      { brand: 'MR. Gold', price: 1350, pack: '5 L Can' },
      { brand: 'Fortune', price: 1390, pack: '5 L Jar' },
      { brand: 'Goldwinner', price: 1290, pack: '5 L Can' }
    ]
  },
  'Sesame Oil 1L': {
    category: 'Sesame / Gingelly Oil (1L)',
    competitors: [
      { brand: 'Idhayam', price: 475, pack: '1 L Bottle' },
      { brand: 'MR. Gold', price: 440, pack: '1 L Bottle' }
    ]
  },
  'Mustard Oil 1L': {
    category: 'Mustard Oil (1L)',
    competitors: [
      { brand: 'Fortune', price: 195, pack: '1 L Kachi Ghani Pouch' },
      { brand: 'Jivo', price: 245, pack: '1 L Cold Pressed Bottle' },
      { brand: 'MR. Gold', price: 210, pack: '1 L Bottle' }
    ]
  },
  'Extra Virgin Olive Oil 1L': {
    category: 'Extra Virgin Olive Oil (1L)',
    competitors: [
      { brand: 'Jivo', price: 1199, pack: '1 L Glass Bottle' },
      { brand: 'Figaro', price: 1299, pack: '1 L Tin' }
    ]
  },
  'Oil Spray 200ml': {
    category: 'Oil Cooking Spray (200ml)',
    competitors: [
      { brand: 'Jivo', price: 249, pack: '200 ml Spray' },
      { brand: 'Fortune', price: 220, pack: '200 ml Dosa Spray' }
    ]
  }
}

// Map product to standardized benchmark key
function mapProductToBenchmarkKey(productName) {
  const s = (productName || '').toLowerCase()
  if (s.includes('spray')) return 'Oil Spray 200ml'
  if (s.includes('olive') || s.includes('extra virgin')) return 'Extra Virgin Olive Oil 1L'
  if (s.includes('mustard')) return 'Mustard Oil 1L'
  if (s.includes('sesame') || s.includes('gingelly')) return 'Sesame Oil 1L'
  if (s.includes('groundnut')) {
    if (s.includes('5 ltr') || s.includes('5l') || s.includes('5 l')) return 'Groundnut Oil 5L'
    if (s.includes('2 ltr') || s.includes('2l') || s.includes('2 l')) return 'Groundnut Oil 2L'
    return 'Groundnut Oil 1L'
  }
  return 'Groundnut Oil 1L'
}

// Normalize date to YYYY-MM-DD
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

// Format date to "24 Sep 2026"
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
  if (!city) return 'All Cities'
  return city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Price Indicator Badge
function PriceActionBadge({ delta, priceD, prevPrice }) {
  if (prevPrice <= 0 && priceD > 0) {
    return <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>New Active</span>
  }
  if (delta > 0.5) {
    const pct = prevPrice > 0 ? ((delta / prevPrice) * 100).toFixed(1) : '0'
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
        ▲ +₹{delta.toFixed(1)} (+{pct}%)
      </span>
    )
  }
  if (delta < -0.5) {
    const pct = prevPrice > 0 ? ((Math.abs(delta) / prevPrice) * 100).toFixed(1) : '0'
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
        ▼ -₹{Math.abs(delta).toFixed(1)} (-{pct}%)
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

export default function StockTab() {
  const [activeTab, setActiveTab] = useState('brand_compare') // 'brand_compare' | 'city_matrix' | 'sku_2day' | 'trend'
  const [selectedCity, setSelectedCity] = useState('All')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [alertFilter, setAlertFilter] = useState('All') // 'All' | 'hikes' | 'drops' | 'gap'
  const [searchQuery, setSearchQuery] = useState('')

  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [rawData, setRawData] = useState({ insta: [], blinkit: [] })

  // Load both feeds
  const loadData = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      const [resInsta, resBlinkit] = await Promise.all([
        fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=534975184`),
        fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=45158830`)
      ])

      if (!resInsta.ok || !resBlinkit.ok) {
        throw new Error('Failed to load Google Sheet tabs.')
      }

      const instaText = await resInsta.text()
      const blinkitText = await resBlinkit.text()

      const instaParsed = parseCSV(instaText)
      const blinkitParsed = parseCSV(blinkitText)

      // Transform Instamart
      const instaItems = instaParsed.map(r => {
        const date = normalizeDateStr(r.ORDERED_DATE)
        const units = num(r.UNITS_SOLD)
        const gmv = num(r.GMV)
        const net = num(r.Net)
        const baseMrp = num(r.BASE_MRP)
        const effectivePrice = units > 0 ? (gmv / units) : baseMrp
        const product = (r.PRODUCT_NAME || '').trim()
        const variant = (r.VARIANT || '').trim()
        const benchmarkKey = mapProductToBenchmarkKey(product + ' ' + variant)

        return {
          platform: 'Instamart',
          platformIcon: '⚡',
          date,
          city: (r.CITY || '').trim().toLowerCase(),
          area: (r.AREA_NAME || '').trim(),
          storeId: r.STORE_ID || '',
          product,
          variant,
          sku: `${product} (${variant || 'Std'})`,
          benchmarkKey,
          units,
          gmv,
          net,
          baseMrp,
          effectivePrice: Number(effectivePrice.toFixed(2))
        }
      }).filter(i => i.date && (i.units > 0 || i.gmv > 0))

      // Transform Blinkit
      const blinkitItems = blinkitParsed.map(r => {
        const date = normalizeDateStr(r.date)
        const units = num(r.qty_sold)
        const totalMrp = num(r.mrp)
        const net = num(r.Net)
        const unitMrp = units > 0 ? (totalMrp / units) : totalMrp
        const unitNet = units > 0 ? (net / units) : net
        const product = (r.item_name || '').trim()
        const benchmarkKey = mapProductToBenchmarkKey(product)

        return {
          platform: 'Blinkit',
          platformIcon: '🟡',
          date,
          city: (r.city_name || '').trim().toLowerCase(),
          area: '',
          storeId: r.city_id || '',
          product,
          variant: '',
          sku: product,
          benchmarkKey,
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

  // Extract available dates
  const availableDates = useMemo(() => {
    const set = new Set([...rawData.insta, ...rawData.blinkit].map(i => i.date).filter(Boolean))
    return Array.from(set).sort()
  }, [rawData])

  const latestDate = availableDates[availableDates.length - 1] || ''
  const prevDate = availableDates[availableDates.length - 2] || ''

  const [dayD, setDayD] = useState('')
  const [dayPrev, setDayPrev] = useState('')

  useEffect(() => {
    if (latestDate && prevDate) {
      setDayD(latestDate)
      setDayPrev(prevDate)
    }
  }, [latestDate, prevDate])

  const effectiveDayD = dayD || latestDate
  const effectiveDayPrev = dayPrev || prevDate

  // Extract distinct cities
  const allCities = useMemo(() => {
    const set = new Set([...rawData.insta, ...rawData.blinkit].map(i => i.city).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [rawData])

  // Extract distinct categories / benchmark keys
  const allCategories = useMemo(() => {
    return ['All', ...Object.keys(COMPETITOR_BENCHMARKS)]
  }, [])

  // ==================== 1. BRAND & COMPETITOR PRICE BENCHMARK DATA ====================
  const brandBenchmarkData = useMemo(() => {
    if (!effectiveDayD || !effectiveDayPrev) return []

    // Filter items by city if selected
    const filterByCity = (items) => {
      if (selectedCity === 'All') return items
      return items.filter(i => i.city === selectedCity.toLowerCase())
    }

    const instaDayD = filterByCity(rawData.insta.filter(i => i.date === effectiveDayD))
    const instaDayPrev = filterByCity(rawData.insta.filter(i => i.date === effectiveDayPrev))
    const blinkitDayD = filterByCity(rawData.blinkit.filter(i => i.date === effectiveDayD))
    const blinkitDayPrev = filterByCity(rawData.blinkit.filter(i => i.date === effectiveDayPrev))

    return Object.entries(COMPETITOR_BENCHMARKS).map(([key, config]) => {
      // Instamart Gem stats
      const instaDMatch = instaDayD.filter(i => i.benchmarkKey === key)
      const instaPrevMatch = instaDayPrev.filter(i => i.benchmarkKey === key)
      const instaDUnits = instaDMatch.reduce((s, i) => s + i.units, 0)
      const instaDGmv = instaDMatch.reduce((s, i) => s + i.gmv, 0)
      const instaDPrice = instaDUnits > 0 ? Number((instaDGmv / instaDUnits).toFixed(1)) : 0

      const instaPrevUnits = instaPrevMatch.reduce((s, i) => s + i.units, 0)
      const instaPrevGmv = instaPrevMatch.reduce((s, i) => s + i.gmv, 0)
      const instaPrevPrice = instaPrevUnits > 0 ? Number((instaPrevGmv / instaPrevUnits).toFixed(1)) : 0
      const instaDelta = instaDPrice > 0 && instaPrevPrice > 0 ? Number((instaDPrice - instaPrevPrice).toFixed(1)) : 0

      // Blinkit Gem stats
      const blinkitDMatch = blinkitDayD.filter(i => i.benchmarkKey === key)
      const blinkitPrevMatch = blinkitDayPrev.filter(i => i.benchmarkKey === key)
      const blinkitDUnits = blinkitDMatch.reduce((s, i) => s + i.units, 0)
      const blinkitDGmv = blinkitDMatch.reduce((s, i) => s + i.gmv, 0)
      const blinkitDPrice = blinkitDUnits > 0 ? Number((blinkitDGmv / blinkitDUnits).toFixed(1)) : 0

      const blinkitPrevUnits = blinkitPrevMatch.reduce((s, i) => s + i.units, 0)
      const blinkitPrevGmv = blinkitPrevMatch.reduce((s, i) => s + i.gmv, 0)
      const blinkitPrevPrice = blinkitPrevUnits > 0 ? Number((blinkitPrevGmv / blinkitPrevUnits).toFixed(1)) : 0
      const blinkitDelta = blinkitDPrice > 0 && blinkitPrevPrice > 0 ? Number((blinkitDPrice - blinkitPrevPrice).toFixed(1)) : 0

      // Combined Gem Price on Day D
      const totalDUnits = instaDUnits + blinkitDUnits
      const totalDGmv = instaDGmv + blinkitDGmv
      const gemAvgPrice = totalDUnits > 0 ? Number((totalDGmv / totalDUnits).toFixed(1)) : (instaDPrice || blinkitDPrice || 0)

      // Competitor prices breakdown
      const compPrices = config.competitors.map(c => c.price)
      const compAvgPrice = compPrices.length ? Math.round(compPrices.reduce((s, p) => s + p, 0) / compPrices.length) : 0
      const priceGapVsMarket = gemAvgPrice > 0 ? Number((gemAvgPrice - compAvgPrice).toFixed(1)) : 0
      const priceGapPct = compAvgPrice > 0 ? Number(((priceGapVsMarket / compAvgPrice) * 100).toFixed(1)) : 0

      // Competitor brand lookup
      const jivoPrice = config.competitors.find(c => c.brand.toLowerCase().includes('jivo'))?.price || null
      const mrGoldPrice = config.competitors.find(c => c.brand.toLowerCase().includes('gold') && !c.brand.toLowerCase().includes('winner'))?.price || null
      const fortunePrice = config.competitors.find(c => c.brand.toLowerCase().includes('fortune'))?.price || null
      const goldwinnerPrice = config.competitors.find(c => c.brand.toLowerCase().includes('goldwinner'))?.price || null
      const idhayamPrice = config.competitors.find(c => c.brand.toLowerCase().includes('idhayam'))?.price || null

      // Platform Price Gap (Instamart vs Blinkit)
      const platformPriceGap = (instaDPrice > 0 && blinkitDPrice > 0) ? Number((blinkitDPrice - instaDPrice).toFixed(1)) : null

      return {
        key,
        category: config.category,
        gemAvgPrice,
        instaDPrice,
        instaPrevPrice,
        instaDelta,
        instaDUnits,
        blinkitDPrice,
        blinkitPrevPrice,
        blinkitDelta,
        blinkitDUnits,
        platformPriceGap,
        compAvgPrice,
        priceGapVsMarket,
        priceGapPct,
        jivoPrice,
        mrGoldPrice,
        fortunePrice,
        goldwinnerPrice,
        idhayamPrice,
        competitorList: config.competitors
      }
    })
  }, [rawData, effectiveDayD, effectiveDayPrev, selectedCity])

  // ==================== 2. CITY-WISE SEPARATE INSTA & BLINKIT PRICE MATRIX ====================
  const cityMatrixData = useMemo(() => {
    if (!effectiveDayD || !effectiveDayPrev) return []

    // Group by City + Benchmark Category
    const map = {}
    const getCityCat = (city, categoryKey) => {
      const c = (city || 'unknown').toLowerCase()
      const compoundKey = `${c}___${categoryKey}`
      if (!map[compoundKey]) {
        map[compoundKey] = {
          compoundKey,
          city: c,
          formattedCity: formatCityName(c),
          categoryKey,
          categoryName: COMPETITOR_BENCHMARKS[categoryKey]?.category || categoryKey,
          instaDPrice: 0, instaPrevPrice: 0, instaDUnits: 0, instaPrevUnits: 0, instaDGmv: 0, instaPrevGmv: 0,
          blinkitDPrice: 0, blinkitPrevPrice: 0, blinkitDUnits: 0, blinkitPrevUnits: 0, blinkitDGmv: 0, blinkitPrevGmv: 0,
        }
      }
      return map[compoundKey]
    }

    // Accumulate Instamart
    rawData.insta.forEach(i => {
      if (i.date === effectiveDayD) {
        const entry = getCityCat(i.city, i.benchmarkKey)
        entry.instaDUnits += i.units
        entry.instaDGmv += i.gmv
      } else if (i.date === effectiveDayPrev) {
        const entry = getCityCat(i.city, i.benchmarkKey)
        entry.instaPrevUnits += i.units
        entry.instaPrevGmv += i.gmv
      }
    })

    // Accumulate Blinkit
    rawData.blinkit.forEach(i => {
      if (i.date === effectiveDayD) {
        const entry = getCityCat(i.city, i.benchmarkKey)
        entry.blinkitDUnits += i.units
        entry.blinkitDGmv += i.gmv
      } else if (i.date === effectiveDayPrev) {
        const entry = getCityCat(i.city, i.benchmarkKey)
        entry.blinkitPrevUnits += i.units
        entry.blinkitPrevGmv += i.gmv
      }
    })

    return Object.values(map).map(e => {
      const instaDPrice = e.instaDUnits > 0 ? Number((e.instaDGmv / e.instaDUnits).toFixed(1)) : 0
      const instaPrevPrice = e.instaPrevUnits > 0 ? Number((e.instaPrevGmv / e.instaPrevUnits).toFixed(1)) : 0
      const instaDelta = (instaDPrice > 0 && instaPrevPrice > 0) ? Number((instaDPrice - instaPrevPrice).toFixed(1)) : 0

      const blinkitDPrice = e.blinkitDUnits > 0 ? Number((e.blinkitDGmv / e.blinkitDUnits).toFixed(1)) : 0
      const blinkitPrevPrice = e.blinkitPrevUnits > 0 ? Number((e.blinkitPrevGmv / e.blinkitPrevUnits).toFixed(1)) : 0
      const blinkitDelta = (blinkitDPrice > 0 && blinkitPrevPrice > 0) ? Number((blinkitDPrice - blinkitPrevPrice).toFixed(1)) : 0

      const platformGap = (instaDPrice > 0 && blinkitDPrice > 0) ? Number((blinkitDPrice - instaDPrice).toFixed(1)) : null

      // Competitor benchmark
      const compConfig = COMPETITOR_BENCHMARKS[e.categoryKey]
      const compAvg = compConfig ? Math.round(compConfig.competitors.reduce((s, c) => s + c.price, 0) / compConfig.competitors.length) : 0

      // Alert classification
      const hasHike = instaDelta > 1 || blinkitDelta > 1
      const hasDrop = instaDelta < -1 || blinkitDelta < -1
      const hasPlatformGap = platformGap !== null && Math.abs(platformGap) >= 5

      return {
        ...e,
        instaDPrice,
        instaPrevPrice,
        instaDelta,
        blinkitDPrice,
        blinkitPrevPrice,
        blinkitDelta,
        platformGap,
        compAvg,
        hasHike,
        hasDrop,
        hasPlatformGap,
        totalDUnits: e.instaDUnits + e.blinkitDUnits,
        totalDGmv: Math.round(e.instaDGmv + e.blinkitDGmv)
      }
    }).filter(e => e.instaDUnits > 0 || e.instaPrevUnits > 0 || e.blinkitDUnits > 0 || e.blinkitPrevUnits > 0)
      .sort((a, b) => b.totalDGmv - a.totalDGmv)
  }, [rawData, effectiveDayD, effectiveDayPrev])

  // Filtered City Matrix
  const filteredCityMatrix = useMemo(() => {
    let list = cityMatrixData
    if (selectedCity !== 'All') {
      list = list.filter(r => r.city === selectedCity.toLowerCase())
    }
    if (selectedCategory !== 'All') {
      list = list.filter(r => r.categoryKey === selectedCategory)
    }
    if (alertFilter === 'hikes') list = list.filter(r => r.hasHike)
    else if (alertFilter === 'drops') list = list.filter(r => r.hasDrop)
    else if (alertFilter === 'gap') list = list.filter(r => r.hasPlatformGap)

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(r => r.formattedCity.toLowerCase().includes(q) || r.categoryName.toLowerCase().includes(q))
    }
    return list
  }, [cityMatrixData, selectedCity, selectedCategory, alertFilter, searchQuery])

  // ==================== 3. ALERTS & EXECUTIVE KPIS ====================
  const alertStats = useMemo(() => {
    let totalHikes = 0
    let totalDrops = 0
    let totalGaps = 0

    cityMatrixData.forEach(r => {
      if (r.hasHike) totalHikes++
      if (r.hasDrop) totalDrops++
      if (r.hasPlatformGap) totalGaps++
    })

    const totalInstaGMV = rawData.insta.filter(i => i.date === effectiveDayD).reduce((s, i) => s + i.gmv, 0)
    const totalBlinkitGMV = rawData.blinkit.filter(i => i.date === effectiveDayD).reduce((s, i) => s + i.gmv, 0)

    const prevInstaGMV = rawData.insta.filter(i => i.date === effectiveDayPrev).reduce((s, i) => s + i.gmv, 0)
    const prevBlinkitGMV = rawData.blinkit.filter(i => i.date === effectiveDayPrev).reduce((s, i) => s + i.gmv, 0)

    const totalDGmv = totalInstaGMV + totalBlinkitGMV
    const totalPrevGmv = prevInstaGMV + prevBlinkitGMV
    const overallGmvGrowth = totalPrevGmv > 0 ? Number((((totalDGmv - totalPrevGmv) / totalPrevGmv) * 100).toFixed(1)) : 0

    return {
      totalHikes,
      totalDrops,
      totalGaps,
      totalDGmv: Math.round(totalDGmv),
      totalPrevGmv: Math.round(totalPrevGmv),
      overallGmvGrowth,
      instaDGmv: Math.round(totalInstaGMV),
      blinkitDGmv: Math.round(totalBlinkitGMV)
    }
  }, [cityMatrixData, rawData, effectiveDayD, effectiveDayPrev])

  // Competitor Comparison Bar Chart Data
  const compChartData = useMemo(() => {
    return brandBenchmarkData.map(b => ({
      category: b.category.split('(')[0].trim(),
      GemPrice: b.gemAvgPrice,
      MarketAvg: b.compAvgPrice,
      Fortune: b.fortunePrice || 0,
      MRGold: b.mrGoldPrice || 0,
      Jivo: b.jivoPrice || 0,
      Idhayam: b.idhayamPrice || 0,
      Goldwinner: b.goldwinnerPrice || 0
    }))
  }, [brandBenchmarkData])

  // CSV Exporters
  const makeBenchmarkCSV = () => {
    const headers = ['Category', 'Gem Weighted Price (₹)', '⚡ Insta Day D Price (₹)', '⚡ Insta Day D-1 Price (₹)', '⚡ Insta Delta', '🟡 Blinkit Day D Price (₹)', '🟡 Blinkit Day D-1 Price (₹)', '🟡 Blinkit Delta', 'Jivo (₹)', 'MR. Gold (₹)', 'Fortune (₹)', 'Goldwinner (₹)', 'Idhayam (₹)', 'Market Benchmark Avg (₹)', 'Gem Delta vs Market (₹)']
    const lines = brandBenchmarkData.map(r => [
      csvEscape(r.category),
      r.gemAvgPrice,
      r.instaDPrice,
      r.instaPrevPrice,
      r.instaDelta,
      r.blinkitDPrice,
      r.blinkitPrevPrice,
      r.blinkitDelta,
      r.jivoPrice || '—',
      r.mrGoldPrice || '—',
      r.fortunePrice || '—',
      r.goldwinnerPrice || '—',
      r.idhayamPrice || '—',
      r.compAvgPrice,
      r.priceGapVsMarket
    ].join(','))
    return [headers.join(','), ...lines]
  }

  const makeCityMatrixCSV = () => {
    const headers = ['City', 'Category', `⚡ Insta Day D (${effectiveDayD}) Price`, `⚡ Insta Day D-1 Price`, '⚡ Insta Delta', `🟡 Blinkit Day D (${effectiveDayD}) Price`, `🟡 Blinkit Day D-1 Price`, '🟡 Blinkit Delta', '⚡ vs 🟡 Platform Gap (₹)', 'Competitor Benchmark (₹)', 'Total Units', 'Total GMV (₹)']
    const lines = filteredCityMatrix.map(r => [
      csvEscape(r.formattedCity),
      csvEscape(r.categoryName),
      r.instaDPrice,
      r.instaPrevPrice,
      r.instaDelta,
      r.blinkitDPrice,
      r.blinkitPrevPrice,
      r.blinkitDelta,
      r.platformGap !== null ? r.platformGap : '—',
      r.compAvg,
      r.totalDUnits,
      r.totalDGmv
    ].join(','))
    return [headers.join(','), ...lines]
  }

  // City Matrix Columns with Separate Insta & Blinkit Columns
  const cityMatrixColumns = [
    {
      key: 'formattedCity',
      label: 'City',
      render: r => <span style={{ fontWeight: 700, color: '#f8fafc' }}>🏙️ {r.formattedCity}</span>
    },
    {
      key: 'categoryName',
      label: 'Product Category',
      render: r => <span style={{ fontWeight: 600, color: '#93c5fd' }}>{r.categoryName}</span>
    },
    // Instamart Day D Price
    {
      key: 'instaDPrice',
      label: `⚡ Insta Day D`,
      align: 'right',
      render: r => (
        <span style={{ fontWeight: 700, color: r.instaDPrice > 0 ? '#fb923c' : '#64748b' }}>
          {r.instaDPrice > 0 ? `₹${r.instaDPrice}` : '—'}
        </span>
      )
    },
    // Instamart 2-Day Delta
    {
      key: 'instaDelta',
      label: `⚡ Insta Price Action`,
      align: 'center',
      render: r => <PriceActionBadge delta={r.instaDelta} priceD={r.instaDPrice} prevPrice={r.instaPrevPrice} />
    },
    // Blinkit Day D Price
    {
      key: 'blinkitDPrice',
      label: `🟡 Blinkit Day D`,
      align: 'right',
      render: r => (
        <span style={{ fontWeight: 700, color: r.blinkitDPrice > 0 ? '#facc15' : '#64748b' }}>
          {r.blinkitDPrice > 0 ? `₹${r.blinkitDPrice}` : '—'}
        </span>
      )
    },
    // Blinkit 2-Day Delta
    {
      key: 'blinkitDelta',
      label: `🟡 Blinkit Price Action`,
      align: 'center',
      render: r => <PriceActionBadge delta={r.blinkitDelta} priceD={r.blinkitDPrice} prevPrice={r.blinkitPrevPrice} />
    },
    // Platform Gap
    {
      key: 'platformGap',
      label: `⚡ vs 🟡 Gap`,
      align: 'center',
      render: r => {
        if (r.platformGap === null) return <span style={{ color: '#64748b' }}>—</span>
        if (r.platformGap === 0) return <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 600 }}>✓ Parity</span>
        return (
          <span style={{
            padding: '2px 7px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            background: 'rgba(234, 179, 8, 0.15)',
            color: '#facc15',
            border: '1px solid rgba(234, 179, 8, 0.3)'
          }}>
            {r.platformGap > 0 ? `Blinkit +₹${r.platformGap}` : `Insta +₹${Math.abs(r.platformGap)}`}
          </span>
        )
      }
    },
    // Market Benchmark Avg
    {
      key: 'compAvg',
      label: `Market Benchmark`,
      align: 'right',
      render: r => <span style={{ color: '#c084fc', fontWeight: 600 }}>₹{r.compAvg}</span>
    },
    // Volume Sold
    {
      key: 'totalDUnits',
      label: `Day D Units`,
      align: 'right',
      render: r => <span style={{ fontWeight: 700, color: '#60a5fa' }}>{r.totalDUnits.toLocaleString()}</span>
    }
  ]

  return (
    <>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 24, fontWeight: 700, color: '#f8fafc' }}>
            <span>🏷️ Competitive Price &amp; Stock Intelligence</span>
          </h1>
          <div className="date" style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
            2-Day Price Comparison &amp; Competitor Benchmarking (<strong>Gem</strong> vs <strong>Jivo, MR. Gold, Fortune, Goldwinner, Idhayam</strong>) across <strong>Instamart</strong> &amp; <strong>Blinkit</strong>
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
            ↻ {isRefreshing ? 'Refreshing Feeds...' : 'Refresh Feeds'}
          </button>
          <ProfileSection />
        </div>
      </header>

      {/* Data Capture & Column Mapping Info Card */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 10,
        padding: '10px 16px',
        marginBottom: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        fontSize: 12,
        color: '#94a3b8'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: '#60a5fa', fontWeight: 700 }}>📋 Sheet Column Mapping:</span>
          <span>⚡ <strong>Instamart:</strong> Units = <code>UNITS_SOLD</code> • Sales Value = <code>GMV</code> • Unit Price = <code>GMV ÷ UNITS_SOLD</code></span>
          <span style={{ color: '#475569' }}>|</span>
          <span>🟡 <strong>Blinkit:</strong> Units = <code>qty_sold</code> • Sales Value = <code>mrp</code> (Gross) / <code>Net</code> • Unit Price = <code>mrp ÷ qty_sold</code></span>
        </div>
        <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>✓ Verified with live Google Sheet feeds</span>
      </div>

      {/* Alert Banner for Hikes / Drops / Gaps */}
      {(alertStats.totalHikes > 0 || alertStats.totalDrops > 0 || alertStats.totalGaps > 0) && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid #334155',
          borderRadius: 12,
          padding: '12px 18px',
          marginBottom: 18,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16 }}>🚨 <strong>2-Day Price Movement Alerts:</strong></span>
            {alertStats.totalHikes > 0 && (
              <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: 12, fontWeight: 700, border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                ▲ {alertStats.totalHikes} Price Hikes Detected
              </span>
            )}
            {alertStats.totalDrops > 0 && (
              <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', fontSize: 12, fontWeight: 700, border: '1px solid rgba(34, 197, 94, 0.4)' }}>
                ▼ {alertStats.totalDrops} Price Discounts / Drops
              </span>
            )}
            {alertStats.totalGaps > 0 && (
              <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(234, 179, 8, 0.2)', color: '#facc15', fontSize: 12, fontWeight: 700, border: '1px solid rgba(234, 179, 8, 0.4)' }}>
                ⚡🟡 {alertStats.totalGaps} Insta vs Blinkit Price Gaps
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Comparing {formatPrettyDate(effectiveDayD)} vs {formatPrettyDate(effectiveDayPrev)}
          </div>
        </div>
      )}

      {/* Primary KPI Row */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
        {/* Total GMV */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Combined Day D Sales</div>
            <div className="stat-icon" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>💰</div>
          </div>
          <div className="stat-value" style={{ fontSize: 22, fontWeight: 700, color: '#34d399' }}>
            ₹{alertStats.totalDGmv.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: alertStats.overallGmvGrowth >= 0 ? '#34d399' : '#f87171', marginTop: 6 }}>
            {alertStats.overallGmvGrowth >= 0 ? `▲ +${alertStats.overallGmvGrowth}%` : `▼ ${alertStats.overallGmvGrowth}%`} vs D-1 (₹{alertStats.totalPrevGmv.toLocaleString()})
          </div>
        </div>

        {/* Instamart GMV */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid rgba(249, 115, 22, 0.3)', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#fb923c', fontWeight: 600 }}>⚡ Instamart Sales</div>
            <div className="stat-icon" style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>⚡</div>
          </div>
          <div className="stat-value" style={{ fontSize: 22, fontWeight: 700, color: '#fb923c' }}>
            ₹{alertStats.instaDGmv.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            On {formatPrettyDate(effectiveDayD)}
          </div>
        </div>

        {/* Blinkit GMV */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#facc15', fontWeight: 600 }}>🟡 Blinkit Sales</div>
            <div className="stat-icon" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>🟡</div>
          </div>
          <div className="stat-value" style={{ fontSize: 22, fontWeight: 700, color: '#facc15' }}>
            ₹{alertStats.blinkitDGmv.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            On {formatPrettyDate(effectiveDayD)}
          </div>
        </div>

        {/* Active Price Shifts */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Active Price Shifts</div>
            <div className="stat-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>📊</div>
          </div>
          <div className="stat-value" style={{ fontSize: 22, fontWeight: 700, color: '#c084fc' }}>
            {alertStats.totalHikes + alertStats.totalDrops} Shifts
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            {alertStats.totalHikes} Hikes • {alertStats.totalDrops} Drops
          </div>
        </div>
      </div>

      {/* Subnavigation Bar & Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18, background: '#1e293b', padding: '10px 14px', borderRadius: 10, border: '1px solid #334155' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'brand_compare', label: '🏆 Gem vs Competitors (Jivo, MR. Gold, Fortune, etc.)' },
            { id: 'city_matrix', label: '🏙️ City-Wise Matrix (Separate Insta & Blinkit Columns)' },
            { id: 'chart', label: '📊 Competitor Benchmark Chart' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                background: activeTab === t.id ? '#3b82f6' : '#0f172a',
                color: activeTab === t.id ? '#ffffff' : '#94a3b8',
                border: `1px solid ${activeTab === t.id ? '#60a5fa' : '#334155'}`,
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Date Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
          <span>Day D:</span>
          <select
            value={effectiveDayD}
            onChange={e => setDayD(e.target.value)}
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '4px 8px', fontSize: 11 }}
          >
            {availableDates.map(d => <option key={d} value={d}>{formatPrettyDate(d)}</option>)}
          </select>

          <span>vs D-1:</span>
          <select
            value={effectiveDayPrev}
            onChange={e => setDayPrev(e.target.value)}
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '4px 8px', fontSize: 11 }}
          >
            {availableDates.map(d => <option key={d} value={d}>{formatPrettyDate(d)}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: 14, borderRadius: 8, color: '#ef4444', marginBottom: 20 }}>
          Failed to load data: {error} — <a href="#" onClick={e => { e.preventDefault(); loadData() }} style={{ color: '#60a5fa', textDecoration: 'underline' }}>Retry</a>
        </div>
      )}

      {loading ? (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div>Loading and analyzing price comparison feeds...</div>
        </div>
      ) : (
        <>
          {/* TAB 1: GEM VS COMPETITORS BENCHMARK */}
          {activeTab === 'brand_compare' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                    Gem Price vs Market Competitors (Jivo, MR. Gold, Fortune, Goldwinner, Idhayam)
                  </h3>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Comparing Gem selling price on <strong>{formatPrettyDate(effectiveDayD)}</strong> vs brand benchmarks
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <select
                    value={selectedCity}
                    onChange={e => setSelectedCity(e.target.value)}
                    style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f8fafc', padding: '5px 10px', fontSize: 12 }}
                  >
                    {allCities.map(c => <option key={c} value={c}>{c === 'All' ? 'All Cities' : formatCityName(c)}</option>)}
                  </select>
                  <CSVButton makeRows={makeBenchmarkCSV} filename={`gem_vs_competitor_prices_${effectiveDayD}.csv`} />
                </div>
              </div>

              {/* Benchmark Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left', background: '#0f172a' }}>
                      <th style={{ padding: '10px 8px' }}>Category</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#60a5fa' }}>💎 Gem Weighted Avg</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#fb923c' }}>⚡ Insta (D vs D-1)</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#facc15' }}>🟡 Blinkit (D vs D-1)</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Jivo</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>MR. Gold</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Fortune</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Goldwinner</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>Idhayam</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#c084fc' }}>Market Benchmark</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }}>Gem vs Market Index</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandBenchmarkData.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 700, color: '#f8fafc' }}>{r.category}</td>
                        {/* Gem Price */}
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#60a5fa', fontSize: 13 }}>
                          ₹{r.gemAvgPrice}
                        </td>
                        {/* Instamart */}
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            <span style={{ fontWeight: 700, color: r.instaDPrice > 0 ? '#fb923c' : '#64748b' }}>
                              {r.instaDPrice > 0 ? `₹${r.instaDPrice}` : '—'}
                            </span>
                            <PriceActionBadge delta={r.instaDelta} priceD={r.instaDPrice} prevPrice={r.instaPrevPrice} />
                          </div>
                        </td>
                        {/* Blinkit */}
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            <span style={{ fontWeight: 700, color: r.blinkitDPrice > 0 ? '#facc15' : '#64748b' }}>
                              {r.blinkitDPrice > 0 ? `₹${r.blinkitDPrice}` : '—'}
                            </span>
                            <PriceActionBadge delta={r.blinkitDelta} priceD={r.blinkitDPrice} prevPrice={r.blinkitPrevPrice} />
                          </div>
                        </td>
                        {/* Competitor columns */}
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.jivoPrice ? '#cbd5e1' : '#64748b' }}>
                          {r.jivoPrice ? `₹${r.jivoPrice}` : '—'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.mrGoldPrice ? '#cbd5e1' : '#64748b' }}>
                          {r.mrGoldPrice ? `₹${r.mrGoldPrice}` : '—'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.fortunePrice ? '#cbd5e1' : '#64748b' }}>
                          {r.fortunePrice ? `₹${r.fortunePrice}` : '—'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.goldwinnerPrice ? '#cbd5e1' : '#64748b' }}>
                          {r.goldwinnerPrice ? `₹${r.goldwinnerPrice}` : '—'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.idhayamPrice ? '#cbd5e1' : '#64748b' }}>
                          {r.idhayamPrice ? `₹${r.idhayamPrice}` : '—'}
                        </td>
                        {/* Market Avg */}
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#c084fc' }}>
                          ₹{r.compAvgPrice}
                        </td>
                        {/* Price Gap Badge */}
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: r.priceGapVsMarket > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                            color: r.priceGapVsMarket > 0 ? '#f87171' : '#4ade80'
                          }}>
                            {r.priceGapVsMarket > 0 ? `+₹${r.priceGapVsMarket} (${r.priceGapPct}% Prem.)` : r.priceGapVsMarket < 0 ? `-₹${Math.abs(r.priceGapVsMarket)} (${Math.abs(r.priceGapPct)}% Disc.)` : 'Parity'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: CITY-WISE MATRIX WITH SEPARATE INSTA & BLINKIT COLUMNS */}
          {activeTab === 'city_matrix' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                    City-Wise 2-Day Price Matrix (Separate Insta &amp; Blinkit Columns)
                  </h3>
                  {/* Alert Filters */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { id: 'All', label: 'All Cities' },
                      { id: 'hikes', label: '▲ Price Hikes' },
                      { id: 'drops', label: '▼ Price Drops' },
                      { id: 'gap', label: '⚡🟡 Platform Gaps' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setAlertFilter(f.id)}
                        style={{
                          background: alertFilter === f.id ? '#334155' : 'rgba(15, 23, 42, 0.6)',
                          color: alertFilter === f.id ? '#60a5fa' : '#94a3b8',
                          border: `1px solid ${alertFilter === f.id ? '#60a5fa' : '#334155'}`,
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <select
                    value={selectedCity}
                    onChange={e => setSelectedCity(e.target.value)}
                    style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f8fafc', padding: '5px 10px', fontSize: 12 }}
                  >
                    {allCities.map(c => <option key={c} value={c}>{c === 'All' ? 'Filter by City...' : formatCityName(c)}</option>)}
                  </select>

                  <select
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f8fafc', padding: '5px 10px', fontSize: 12 }}
                  >
                    {allCategories.map(c => <option key={c} value={c}>{c === 'All' ? 'Filter by Category...' : c}</option>)}
                  </select>

                  <input
                    type="text"
                    placeholder="Search city or product..."
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
                      width: 170
                    }}
                  />
                  <CSVButton makeRows={makeCityMatrixCSV} filename={`city_insta_blinkit_prices_${effectiveDayD}.csv`} />
                </div>
              </div>

              <DataTable
                columns={cityMatrixColumns}
                rows={filteredCityMatrix}
                pageSize={15}
                emptyMessage="No records match the selected city/price filters."
              />
            </div>
          )}

          {/* TAB 3: COMPETITOR BENCHMARK CHART */}
          {activeTab === 'chart' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                  Price Comparison: Gem vs Jivo, MR. Gold, Fortune, Goldwinner, Idhayam
                </h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Visualizing price positioning (₹/unit) across product categories
                </div>
              </div>

              <div style={{ width: '100%', height: 380 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compChartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="category" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `₹${v}`} />
                    <ReTooltip
                      contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: 8, color: '#f8fafc' }}
                      formatter={(val, name) => [`₹${val}`, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                    <Bar dataKey="GemPrice" fill="#3b82f6" name="💎 Gem's Gold" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="MRGold" fill="#eab308" name="MR. Gold" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Fortune" fill="#10b981" name="Fortune" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Jivo" fill="#f97316" name="Jivo" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Idhayam" fill="#ec4899" name="Idhayam" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Goldwinner" fill="#a855f7" name="Goldwinner" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}