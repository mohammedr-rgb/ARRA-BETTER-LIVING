import { useState, useEffect, useMemo, useCallback } from 'react'
import { parseCSV, csvEscape } from '../lib/utils'
import { ProfileSection, CSVButton } from '../components/ui'
import { DataTable } from '../components/DataTable'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend
} from 'recharts'

const PARITY_SPREADSHEET_ID = '1w7PsIoiwh5U1jmgkFoD1VWeWYwSZ56Tmbe-0F5OdTe8'

// Helper to clean price: "₹192.00" -> 192, "280(bottle)" -> 280, "*" -> null
function extractPriceNum(val) {
  if (!val) return null
  const s = String(val).trim()
  if (s === '*' || s === '-' || s.toLowerCase() === 'missing' || s.toLowerCase() === 'n/a') return null
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)/)
  if (m) {
    const n = parseFloat(m[1])
    return isNaN(n) ? null : n
  }
  return null
}

// Extract pack type from string: e.g. "197 (pouch)" -> "Pouch"
function extractPackTag(val) {
  if (!val) return ''
  const m = String(val).match(/\(([^)]+)\)/)
  return m ? m[1].trim() : ''
}

// Capitalize city name
function formatCity(c) {
  if (!c) return 'All Cities'
  return c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

// Normalize product name across platforms
function normalizeProductName(p) {
  const s = (p || '').trim().toLowerCase()
  if (s === '1l pouch' || s === '1l groundnut' || s === '1l groundnut (pouch)') return 'Groundnut Oil 1L (Pouch)'
  if (s === '1l sb' || s === '1l groundnut (bottle)') return 'Groundnut Oil 1L (Smart Bottle)'
  if (s === '2l bottle') return 'Groundnut Oil 2L (Bottle)'
  if (s === '500ml sb') return 'Groundnut Oil 500ml (Smart Bottle)'
  if (s === '200 ml spray' || s === 'ovlive spray' || s === 'olive spray') return 'Oil Spray 200ml'
  if (s === '1l olive') return 'Extra Virgin Olive Oil 1L'
  if (s === '1l sesame') return 'Sesame / Gingelly Oil 1L'
  if (s === '1l mustard') return 'Mustard Oil 1L'
  return p
}

// Format date: "2026-09-25" -> "25 Sep 2026"
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

// Price Delta Badge
function PriceDeltaBadge({ delta, priceD, prevPrice }) {
  if (prevPrice === null || prevPrice === undefined || prevPrice === 0) {
    if (priceD > 0) return <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>New</span>
    return <span style={{ color: '#64748b' }}>—</span>
  }
  if (delta > 0.5) {
    const pct = prevPrice > 0 ? ((delta / prevPrice) * 100).toFixed(1) : '0'
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 7px',
        borderRadius: 5,
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
        gap: 3,
        padding: '2px 7px',
        borderRadius: 5,
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
      padding: '2px 7px',
      borderRadius: 5,
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

// Availability Pill
function AvailabilityBadge({ status }) {
  const s = (status || '').toLowerCase()
  if (s.includes('avail')) {
    return <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)' }}>✓ Available</span>
  }
  if (s.includes('out') || s.includes('stock')) {
    return <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>⛔ Out of Stock</span>
  }
  if (s.includes('miss')) {
    return <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)' }}>⚠️ Missing</span>
  }
  return <span style={{ color: '#64748b', fontSize: 11 }}>{status || '—'}</span>
}

export default function StockTab() {
  const [activeSubTab, setActiveSubTab] = useState('benchmarking') // 'benchmarking' | 'city_matrix' | 'alerts_2day' | 'chart'
  const [selectedCity, setSelectedCity] = useState('All')
  const [selectedProduct, setSelectedProduct] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [alertFilter, setAlertFilter] = useState('All') // 'All' | 'hikes' | 'drops' | 'gaps' | 'oos'

  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [rawData, setRawData] = useState({ insta: [], blinkit: [] })

  // Fetch both sheets from Parity workbook
  const loadData = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      const [resInsta, resBlinkit] = await Promise.all([
        fetch(`https://docs.google.com/spreadsheets/d/${PARITY_SPREADSHEET_ID}/gviz/tq?sheet=Raw%20Data%20of%20Insta&tqx=out:csv`),
        fetch(`https://docs.google.com/spreadsheets/d/${PARITY_SPREADSHEET_ID}/gviz/tq?sheet=Raw%20Data%20of%20Blinkit&tqx=out:csv`)
      ])

      if (!resInsta.ok || !resBlinkit.ok) {
        throw new Error('Failed to fetch from Parity spreadsheet.')
      }

      const instaText = await resInsta.text()
      const blinkitText = await resBlinkit.text()

      const instaParsed = parseCSV(instaText)
      const blinkitParsed = parseCSV(blinkitText)

      // Transform Instamart Rows
      const instaItems = instaParsed.map(r => {
        const date = (r.Date || '').trim()
        const city = (r.City || '').trim().toUpperCase()
        const rawProduct = (r.Product || '').trim()
        const product = normalizeProductName(rawProduct)
        const availability = (r.Availability || 'Available').trim()
        const mrp = extractPriceNum(r.MRP)
        const gem = extractPriceNum(r.Gem)
        const jivo = extractPriceNum(r.Jivo)
        const mrGold = extractPriceNum(r['MR. Gold'])
        const fortune = extractPriceNum(r.Fortune)
        const goldwinner = extractPriceNum(r.Goldwinner)
        const idhayam = extractPriceNum(r.Idhayam)

        return {
          platform: 'Instamart',
          date,
          city,
          rawProduct,
          product,
          availability,
          mrp,
          gem,
          jivo,
          mrGold,
          fortune,
          goldwinner,
          idhayam
        }
      }).filter(r => r.date && r.city && r.city !== 'CITY' && r.product && r.product !== 'Product')

      // Transform Blinkit Rows
      const blinkitItems = blinkitParsed.map(r => {
        const date = (r.Date || '').trim()
        const city = (r.Cities || '').trim().toUpperCase()
        const rawProduct = (r.Product || '').trim()
        const product = normalizeProductName(rawProduct)
        const gem = extractPriceNum(r.Gem)
        const gemPack = extractPackTag(r.Gem)
        const jivo = extractPriceNum(r.Jivo)
        const mrGold = extractPriceNum(r['MR. Gold'])
        const fortune = extractPriceNum(r.Fortune)
        const goldwinner = extractPriceNum(r.Goldwinner)
        const idhayam = extractPriceNum(r.Idhayam)

        return {
          platform: 'Blinkit',
          date,
          city,
          rawProduct,
          product,
          gem,
          gemPack,
          jivo,
          mrGold,
          fortune,
          goldwinner,
          idhayam,
          availability: gem > 0 ? 'Available' : 'Out of Stock'
        }
      }).filter(r => r.date && r.city && r.city !== 'CITIES' && r.product && r.product !== 'Product')

      setRawData({ insta: instaItems, blinkit: blinkitItems })
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

  // Extract available dates for Instamart
  const instaDates = useMemo(() => {
    const set = new Set(rawData.insta.map(r => r.date).filter(Boolean))
    return Array.from(set).sort()
  }, [rawData.insta])

  const latestInstaDate = instaDates[instaDates.length - 1] || '2026-09-25'
  const prevInstaDate = instaDates[instaDates.length - 2] || '2026-09-24'

  const [dayD, setDayD] = useState('')
  const [dayPrev, setDayPrev] = useState('')

  useEffect(() => {
    if (latestInstaDate && prevInstaDate) {
      setDayD(latestInstaDate)
      setDayPrev(prevInstaDate)
    }
  }, [latestInstaDate, prevInstaDate])

  const effectiveDayD = dayD || latestInstaDate
  const effectiveDayPrev = dayPrev || prevInstaDate

  // Distinct cities list
  const allCities = useMemo(() => {
    const set = new Set([...rawData.insta.map(r => r.city), ...rawData.blinkit.map(r => r.city)].filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [rawData])

  // Distinct products list
  const allProducts = useMemo(() => {
    const set = new Set([...rawData.insta.map(r => r.product), ...rawData.blinkit.map(r => r.product)].filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [rawData])

  // ==================== 1. COMPETITOR BENCHMARKING (GEM VS JIVO, MR. GOLD, FORTUNE, GOLDWINNER, IDHAYAM) ====================
  const competitorBenchmarkData = useMemo(() => {
    const filterCity = (list) => {
      if (selectedCity === 'All') return list
      return list.filter(r => r.city === selectedCity)
    }

    const instaDayD = filterCity(rawData.insta.filter(r => r.date === effectiveDayD))
    const blinkitDayD = filterCity(rawData.blinkit.filter(r => r.date === effectiveDayD))

    // Group by Product
    const map = {}
    const getProdEntry = (prod) => {
      if (!map[prod]) {
        map[prod] = {
          product: prod,
          mrps: [],
          gemPrices: [],
          jivoPrices: [],
          mrGoldPrices: [],
          fortunePrices: [],
          goldwinnerPrices: [],
          idhayamPrices: [],
          availabilities: { Available: 0, OutOfStock: 0, Missing: 0 },
          cityCount: new Set()
        }
      }
      return map[prod]
    }

    instaDayD.forEach(r => {
      const e = getProdEntry(r.product)
      if (r.mrp) e.mrps.push(r.mrp)
      if (r.gem) e.gemPrices.push(r.gem)
      if (r.jivo) e.jivoPrices.push(r.jivo)
      if (r.mrGold) e.mrGoldPrices.push(r.mrGold)
      if (r.fortune) e.fortunePrices.push(r.fortune)
      if (r.goldwinner) e.goldwinnerPrices.push(r.goldwinner)
      if (r.idhayam) e.idhayamPrices.push(r.idhayam)
      if (r.city) e.cityCount.add(r.city)

      const av = (r.availability || '').toLowerCase()
      if (av.includes('avail')) e.availabilities.Available++
      else if (av.includes('out') || av.includes('stock')) e.availabilities.OutOfStock++
      else if (av.includes('miss')) e.availabilities.Missing++
    })

    blinkitDayD.forEach(r => {
      const e = getProdEntry(r.product)
      if (r.gem) e.gemPrices.push(r.gem)
      if (r.jivo) e.jivoPrices.push(r.jivo)
      if (r.mrGold) e.mrGoldPrices.push(r.mrGold)
      if (r.fortune) e.fortunePrices.push(r.fortune)
      if (r.goldwinner) e.goldwinnerPrices.push(r.goldwinner)
      if (r.idhayam) e.idhayamPrices.push(r.idhayam)
      if (r.city) e.cityCount.add(r.city)
    })

    const avgOf = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null

    return Object.values(map).map(e => {
      const avgMrp = avgOf(e.mrps)
      const avgGem = avgOf(e.gemPrices)
      const avgJivo = avgOf(e.jivoPrices)
      const avgMrGold = avgOf(e.mrGoldPrices)
      const avgFortune = avgOf(e.fortunePrices)
      const avgGoldwinner = avgOf(e.goldwinnerPrices)
      const avgIdhayam = avgOf(e.idhayamPrices)

      // Calculate Market Competitor Average (excluding Gem)
      const compPrices = [avgJivo, avgMrGold, avgFortune, avgGoldwinner, avgIdhayam].filter(Boolean)
      const marketAvg = compPrices.length ? Math.round(compPrices.reduce((s, v) => s + v, 0) / compPrices.length) : null

      const discountOffMrp = (avgMrp && avgGem) ? Math.round(((avgMrp - avgGem) / avgMrp) * 100) : 0
      const gemVsMarketDiff = (avgGem && marketAvg) ? Math.round(avgGem - marketAvg) : 0
      const gemVsMarketPct = (avgGem && marketAvg) ? Number((((avgGem - marketAvg) / marketAvg) * 100).toFixed(1)) : 0

      // Identify lowest price brand
      const brandMap = { 'Gem': avgGem, 'Jivo': avgJivo, 'MR. Gold': avgMrGold, 'Fortune': avgFortune, 'Goldwinner': avgGoldwinner, 'Idhayam': avgIdhayam }
      let lowestBrand = '—'
      let lowestPrice = Infinity
      Object.entries(brandMap).forEach(([b, p]) => {
        if (p && p < lowestPrice) {
          lowestPrice = p
          lowestBrand = b
        }
      })

      return {
        product: e.product,
        avgMrp,
        discountOffMrp,
        avgGem,
        avgJivo,
        avgMrGold,
        avgFortune,
        avgGoldwinner,
        avgIdhayam,
        marketAvg,
        gemVsMarketDiff,
        gemVsMarketPct,
        lowestBrand: lowestPrice < Infinity ? `${lowestBrand} (₹${lowestPrice})` : '—',
        activeCities: e.cityCount.size,
        availabilities: e.availabilities
      }
    }).sort((a, b) => (b.avgGem || 0) - (a.avgGem || 0))
  }, [rawData, effectiveDayD, selectedCity])

  // ==================== 2. CITY-WISE PARITY MATRIX (SEPARATE INSTA & BLINKIT COLUMNS) ====================
  const cityParityMatrix = useMemo(() => {
    // Map items on Day D & Day D-1 by City + Product
    const map = {}
    const getEntry = (city, product) => {
      const key = `${city}___${product}`
      if (!map[key]) {
        map[key] = {
          key,
          city,
          product,
          formattedCity: formatCity(city),
          instaDPrice: null,
          instaPrevPrice: null,
          instaAvailability: '—',
          instaMrp: null,
          blinkitDPrice: null,
          blinkitPack: '',
          jivo: null,
          mrGold: null,
          fortune: null,
          goldwinner: null,
          idhayam: null
        }
      }
      return map[key]
    }

    // Instamart Day D
    rawData.insta.filter(r => r.date === effectiveDayD).forEach(r => {
      const e = getEntry(r.city, r.product)
      e.instaDPrice = r.gem
      e.instaAvailability = r.availability
      e.instaMrp = r.mrp
      if (r.jivo) e.jivo = r.jivo
      if (r.mrGold) e.mrGold = r.mrGold
      if (r.fortune) e.fortune = r.fortune
      if (r.goldwinner) e.goldwinner = r.goldwinner
      if (r.idhayam) e.idhayam = r.idhayam
    })

    // Instamart Day D-1
    rawData.insta.filter(r => r.date === effectiveDayPrev).forEach(r => {
      const e = getEntry(r.city, r.product)
      e.instaPrevPrice = r.gem
    })

    // Blinkit Day D
    rawData.blinkit.filter(r => r.date === effectiveDayD).forEach(r => {
      const e = getEntry(r.city, r.product)
      e.blinkitDPrice = r.gem
      e.blinkitPack = r.gemPack
      if (r.jivo) e.jivo = r.jivo
      if (r.mrGold) e.mrGold = r.mrGold
      if (r.fortune) e.fortune = r.fortune
      if (r.goldwinner) e.goldwinner = r.goldwinner
      if (r.idhayam) e.idhayam = r.idhayam
    })

    return Object.values(map).map(e => {
      const instaDelta = (e.instaDPrice !== null && e.instaPrevPrice !== null) ? Number((e.instaDPrice - e.instaPrevPrice).toFixed(1)) : 0
      const platformGap = (e.instaDPrice !== null && e.blinkitDPrice !== null) ? Number((e.blinkitDPrice - e.instaDPrice).toFixed(1)) : null

      const compPrices = [e.jivo, e.mrGold, e.fortune, e.goldwinner, e.idhayam].filter(Boolean)
      const compAvg = compPrices.length ? Math.round(compPrices.reduce((s, v) => s + v, 0) / compPrices.length) : null

      const hasHike = instaDelta > 1
      const hasDrop = instaDelta < -1
      const hasPlatformGap = platformGap !== null && Math.abs(platformGap) >= 2
      const isOOS = e.instaAvailability.toLowerCase().includes('out') || e.instaAvailability.toLowerCase().includes('miss')

      return {
        ...e,
        instaDelta,
        platformGap,
        compAvg,
        hasHike,
        hasDrop,
        hasPlatformGap,
        isOOS
      }
    }).sort((a, b) => a.city.localeCompare(b.city))
  }, [rawData, effectiveDayD, effectiveDayPrev])

  // Filtered City Parity Matrix
  const filteredCityMatrix = useMemo(() => {
    let list = cityParityMatrix
    if (selectedCity !== 'All') list = list.filter(r => r.city === selectedCity)
    if (selectedProduct !== 'All') list = list.filter(r => r.product === selectedProduct)

    if (alertFilter === 'hikes') list = list.filter(r => r.hasHike)
    else if (alertFilter === 'drops') list = list.filter(r => r.hasDrop)
    else if (alertFilter === 'gaps') list = list.filter(r => r.hasPlatformGap)
    else if (alertFilter === 'oos') list = list.filter(r => r.isOOS)

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(r => r.formattedCity.toLowerCase().includes(q) || r.product.toLowerCase().includes(q))
    }
    return list
  }, [cityParityMatrix, selectedCity, selectedProduct, alertFilter, searchQuery])

  // ==================== 3. 2-DAY PRICE MOVEMENT & ALERTS LOG ====================
  const priceAlertsList = useMemo(() => {
    return cityParityMatrix.filter(r => r.hasHike || r.hasDrop || r.hasPlatformGap || r.isOOS)
  }, [cityParityMatrix])

  // ==================== 4. EXECUTIVE STATS ====================
  const executiveKPIs = useMemo(() => {
    let totalHikes = 0
    let totalDrops = 0
    let totalGaps = 0
    let totalOOS = 0

    cityParityMatrix.forEach(r => {
      if (r.hasHike) totalHikes++
      if (r.hasDrop) totalDrops++
      if (r.hasPlatformGap) totalGaps++
      if (r.isOOS) totalOOS++
    })

    const gemPrices = cityParityMatrix.map(r => r.instaDPrice || r.blinkitDPrice).filter(Boolean)
    const avgGemPrice = gemPrices.length ? Math.round(gemPrices.reduce((s, p) => s + p, 0) / gemPrices.length) : 0

    const prevGemPrices = cityParityMatrix.map(r => r.instaPrevPrice).filter(Boolean)
    const avgPrevGemPrice = prevGemPrices.length ? Math.round(prevGemPrices.reduce((s, p) => s + p, 0) / prevGemPrices.length) : 0
    const avgGemDelta = avgPrevGemPrice > 0 ? (avgGemPrice - avgPrevGemPrice) : 0

    const totalAvailable = cityParityMatrix.filter(r => !r.isOOS).length
    const availabilityRate = cityParityMatrix.length > 0 ? Math.round((totalAvailable / cityParityMatrix.length) * 100) : 100

    return {
      totalHikes,
      totalDrops,
      totalGaps,
      totalOOS,
      avgGemPrice,
      avgPrevGemPrice,
      avgGemDelta,
      availabilityRate,
      monitoredCities: new Set(cityParityMatrix.map(r => r.city)).size
    }
  }, [cityParityMatrix])

  // Bar Chart Data for Competitor Comparison
  const chartData = useMemo(() => {
    return competitorBenchmarkData.map(r => ({
      product: r.product.split('(')[0].trim(),
      Gem: r.avgGem || 0,
      Jivo: r.avgJivo || 0,
      MRGold: r.avgMrGold || 0,
      Fortune: r.avgFortune || 0,
      Goldwinner: r.avgGoldwinner || 0,
      Idhayam: r.avgIdhayam || 0,
      MarketAvg: r.marketAvg || 0
    }))
  }, [competitorBenchmarkData])

  // CSV Exporters
  const makeBenchmarkCSV = () => {
    const headers = ['Product', 'MRP (₹)', 'Gem Avg Price (₹)', 'Discount off MRP %', 'Jivo (₹)', 'MR. Gold (₹)', 'Fortune (₹)', 'Goldwinner (₹)', 'Idhayam (₹)', 'Market Competitor Avg (₹)', 'Gem vs Market (₹)', 'Lowest Price Brand', 'Active Cities']
    const lines = competitorBenchmarkData.map(r => [
      csvEscape(r.product),
      r.avgMrp || '—',
      r.avgGem || '—',
      `${r.discountOffMrp}%`,
      r.avgJivo || '—',
      r.avgMrGold || '—',
      r.avgFortune || '—',
      r.avgGoldwinner || '—',
      r.avgIdhayam || '—',
      r.marketAvg || '—',
      r.gemVsMarketDiff,
      csvEscape(r.lowestBrand),
      r.activeCities
    ].join(','))
    return [headers.join(','), ...lines]
  }

  const makeCityMatrixCSV = () => {
    const headers = ['City', 'Product', 'Availability', `⚡ Insta Day D (${effectiveDayD}) (₹)`, `⚡ Insta Day D-1 (${effectiveDayPrev}) (₹)`, '⚡ Insta Delta (₹)', `🟡 Blinkit Day D (${effectiveDayD}) (₹)`, '🟡 Blinkit Pack Type', '⚡ vs 🟡 Platform Gap (₹)', 'Jivo (₹)', 'MR. Gold (₹)', 'Fortune (₹)', 'Goldwinner (₹)', 'Idhayam (₹)', 'Competitor Benchmark Avg (₹)']
    const lines = filteredCityMatrix.map(r => [
      csvEscape(r.formattedCity),
      csvEscape(r.product),
      csvEscape(r.instaAvailability),
      r.instaDPrice !== null ? r.instaDPrice : '—',
      r.instaPrevPrice !== null ? r.instaPrevPrice : '—',
      r.instaDelta,
      r.blinkitDPrice !== null ? r.blinkitDPrice : '—',
      csvEscape(r.blinkitPack),
      r.platformGap !== null ? r.platformGap : '—',
      r.jivo || '—',
      r.mrGold || '—',
      r.fortune || '—',
      r.goldwinner || '—',
      r.idhayam || '—',
      r.compAvg || '—'
    ].join(','))
    return [headers.join(','), ...lines]
  }

  // Columns for City Parity Matrix (Separate Insta & Blinkit Columns)
  const cityMatrixColumns = [
    {
      key: 'formattedCity',
      label: 'City',
      render: r => <span style={{ fontWeight: 700, color: '#f8fafc' }}>🏙️ {r.formattedCity}</span>
    },
    {
      key: 'product',
      label: 'Product',
      render: r => <span style={{ fontWeight: 600, color: '#93c5fd' }}>{r.product}</span>
    },
    {
      key: 'instaAvailability',
      label: 'Availability',
      render: r => <AvailabilityBadge status={r.instaAvailability} />
    },
    // Instamart Day D Price
    {
      key: 'instaDPrice',
      label: `⚡ Insta Day D (₹)`,
      align: 'right',
      render: r => (
        <span style={{ fontWeight: 700, color: r.instaDPrice ? '#fb923c' : '#64748b' }}>
          {r.instaDPrice ? `₹${r.instaDPrice}` : '—'}
        </span>
      )
    },
    // Instamart 2-Day Price Action
    {
      key: 'instaDelta',
      label: `⚡ Insta Price Action`,
      align: 'center',
      render: r => <PriceDeltaBadge delta={r.instaDelta} priceD={r.instaDPrice} prevPrice={r.instaPrevPrice} />
    },
    // Blinkit Day D Price
    {
      key: 'blinkitDPrice',
      label: `🟡 Blinkit Day D (₹)`,
      align: 'right',
      render: r => (
        <div>
          <span style={{ fontWeight: 700, color: r.blinkitDPrice ? '#facc15' : '#64748b' }}>
            {r.blinkitDPrice ? `₹${r.blinkitDPrice}` : '—'}
          </span>
          {r.blinkitPack && <span style={{ fontSize: 10, color: '#94a3b8', display: 'block' }}>({r.blinkitPack})</span>}
        </div>
      )
    },
    // Platform Price Gap
    {
      key: 'platformGap',
      label: `⚡ vs 🟡 Parity Gap`,
      align: 'center',
      render: r => {
        if (r.platformGap === null) return <span style={{ color: '#64748b' }}>—</span>
        if (r.platformGap === 0) return <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 700 }}>✓ Parity</span>
        return (
          <span style={{
            padding: '2px 7px',
            borderRadius: 5,
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
    // Competitor Average
    {
      key: 'compAvg',
      label: `Competitor Avg`,
      align: 'right',
      render: r => <span style={{ color: '#c084fc', fontWeight: 600 }}>{r.compAvg ? `₹${r.compAvg}` : '—'}</span>
    },
    // Individual Competitor Prices Preview
    {
      key: 'competitors',
      label: 'Competitor Brand Prices',
      render: r => {
        const list = [
          r.mrGold && `MR. Gold: ₹${r.mrGold}`,
          r.fortune && `Fortune: ₹${r.fortune}`,
          r.jivo && `Jivo: ₹${r.jivo}`,
          r.idhayam && `Idhayam: ₹${r.idhayam}`,
          r.goldwinner && `Goldwinner: ₹${r.goldwinner}`
        ].filter(Boolean)
        return list.length ? <span style={{ fontSize: 11, color: '#cbd5e1' }}>{list.join(' • ')}</span> : <span style={{ color: '#64748b', fontSize: 11 }}>No direct competitor price</span>
      }
    }
  ]

  return (
    <>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 24, fontWeight: 700, color: '#f8fafc' }}>
            <span>🏷️ Competitor Price &amp; Parity Intelligence</span>
          </h1>
          <div className="date" style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
            Direct competitor benchmarking (<strong>Gem</strong> vs <strong>Jivo, MR. Gold, Fortune, Goldwinner, Idhayam</strong>) across <strong>Instamart</strong> &amp; <strong>Blinkit</strong>
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
            ↻ {isRefreshing ? 'Refreshing Parity Feeds...' : 'Refresh Parity Feeds'}
          </button>
          <ProfileSection />
        </div>
      </header>

      {/* 2-Day Price Alert Banner */}
      {(executiveKPIs.totalHikes > 0 || executiveKPIs.totalDrops > 0 || executiveKPIs.totalGaps > 0 || executiveKPIs.totalOOS > 0) && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.95)',
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
            <span style={{ fontSize: 16 }}>🚨 <strong>2-Day Price &amp; Stock Alerts:</strong></span>
            {executiveKPIs.totalHikes > 0 && (
              <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: 12, fontWeight: 700, border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                ▲ {executiveKPIs.totalHikes} Price Hikes
              </span>
            )}
            {executiveKPIs.totalDrops > 0 && (
              <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', fontSize: 12, fontWeight: 700, border: '1px solid rgba(34, 197, 94, 0.4)' }}>
                ▼ {executiveKPIs.totalDrops} Price Drops / Discounts
              </span>
            )}
            {executiveKPIs.totalGaps > 0 && (
              <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(234, 179, 8, 0.2)', color: '#facc15', fontSize: 12, fontWeight: 700, border: '1px solid rgba(234, 179, 8, 0.4)' }}>
                ⚡🟡 {executiveKPIs.totalGaps} Platform Parity Gaps
              </span>
            )}
            {executiveKPIs.totalOOS > 0 && (
              <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: 12, fontWeight: 600 }}>
                ⛔ {executiveKPIs.totalOOS} Out of Stock / Missing
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Comparing {formatPrettyDate(effectiveDayD)} vs {formatPrettyDate(effectiveDayPrev)}
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
        {/* Gem Average Selling Price */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>💎 Gem Avg Selling Price</div>
            <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>💎</div>
          </div>
          <div className="stat-value" style={{ fontSize: 22, fontWeight: 700, color: '#60a5fa' }}>
            ₹{executiveKPIs.avgGemPrice}
          </div>
          <div style={{ fontSize: 11, color: executiveKPIs.avgGemDelta > 0 ? '#f87171' : executiveKPIs.avgGemDelta < 0 ? '#4ade80' : '#94a3b8', marginTop: 6 }}>
            {executiveKPIs.avgGemDelta > 0 ? `▲ +₹${executiveKPIs.avgGemDelta} vs Day D-1` : executiveKPIs.avgGemDelta < 0 ? `▼ -₹${Math.abs(executiveKPIs.avgGemDelta)} vs Day D-1` : '━ Stable across days'}
          </div>
        </div>

        {/* Monitored Cities */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>🏙️ Monitored Cities</div>
            <div className="stat-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>🏙️</div>
          </div>
          <div className="stat-value" style={{ fontSize: 22, fontWeight: 700, color: '#c084fc' }}>
            {executiveKPIs.monitoredCities} Cities
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            TN, KA, TS, MH, AP regions
          </div>
        </div>

        {/* Stock Availability */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>📦 Overall Availability</div>
            <div className="stat-icon" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>✅</div>
          </div>
          <div className="stat-value" style={{ fontSize: 22, fontWeight: 700, color: '#4ade80' }}>
            {executiveKPIs.availabilityRate}% In Stock
          </div>
          <div style={{ fontSize: 11, color: executiveKPIs.totalOOS > 0 ? '#f87171' : '#4ade80', marginTop: 6 }}>
            {executiveKPIs.totalOOS > 0 ? `⚠️ ${executiveKPIs.totalOOS} out of stock locations` : '✓ 100% stock availability'}
          </div>
        </div>

        {/* Competitor Brands Tracked */}
        <div className="stat-card" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
          <div className="stat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="stat-label" style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>🎯 Competitor Brands</div>
            <div className="stat-icon" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', padding: '6px 10px', borderRadius: 8, fontSize: 14 }}>🎯</div>
          </div>
          <div className="stat-value" style={{ fontSize: 17, fontWeight: 700, color: '#facc15', marginTop: 3 }}>
            5 Benchmark Brands
          </div>
          <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 6 }}>
            Jivo • MR. Gold • Fortune • Goldwinner • Idhayam
          </div>
        </div>
      </div>

      {/* Subnavigation Tabs & Date Selectors */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18, background: '#1e293b', padding: '10px 14px', borderRadius: 10, border: '1px solid #334155' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'benchmarking', label: '🏆 Competitor Benchmarking Matrix' },
            { id: 'city_matrix', label: '🏙️ City-Wise Parity (Separate Insta & Blinkit Columns)' },
            { id: 'alerts_2day', label: `🚨 2-Day Price Shifts (${priceAlertsList.length})` },
            { id: 'chart', label: '📊 Visual Price Positioning Chart' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              style={{
                background: activeSubTab === t.id ? '#3b82f6' : '#0f172a',
                color: activeSubTab === t.id ? '#ffffff' : '#94a3b8',
                border: `1px solid ${activeSubTab === t.id ? '#60a5fa' : '#334155'}`,
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
            {instaDates.map(d => <option key={d} value={d}>{formatPrettyDate(d)}</option>)}
          </select>

          <span>vs D-1:</span>
          <select
            value={effectiveDayPrev}
            onChange={e => setDayPrev(e.target.value)}
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '4px 8px', fontSize: 11 }}
          >
            {instaDates.map(d => <option key={d} value={d}>{formatPrettyDate(d)}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: 14, borderRadius: 8, color: '#ef4444', marginBottom: 20 }}>
          Failed to load Parity data: {error} — <a href="#" onClick={e => { e.preventDefault(); loadData() }} style={{ color: '#60a5fa', textDecoration: 'underline' }}>Retry</a>
        </div>
      )}

      {loading ? (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div>Loading and synchronizing Parity competitor pricing feeds...</div>
        </div>
      ) : (
        <>
          {/* TAB 1: COMPETITOR BENCHMARKING MATRIX */}
          {activeSubTab === 'benchmarking' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                    Gem Price vs Competitor Brands (Jivo, MR. Gold, Fortune, Goldwinner, Idhayam)
                  </h3>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Aggregated pricing on <strong>{formatPrettyDate(effectiveDayD)}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <select
                    value={selectedCity}
                    onChange={e => setSelectedCity(e.target.value)}
                    style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f8fafc', padding: '5px 10px', fontSize: 12 }}
                  >
                    {allCities.map(c => <option key={c} value={c}>{c === 'All' ? 'All Cities' : formatCity(c)}</option>)}
                  </select>
                  <CSVButton makeRows={makeBenchmarkCSV} filename={`competitor_benchmark_${effectiveDayD}.csv`} />
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left', background: '#0f172a' }}>
                      <th style={{ padding: '10px 8px' }}>Product</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>MRP</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#60a5fa' }}>💎 Gem Price</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#fb923c' }}>Jivo</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#facc15' }}>MR. Gold</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#34d399' }}>Fortune</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#c084fc' }}>Goldwinner</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#f472b6' }}>Idhayam</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#38bdf8' }}>Market Avg</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }}>Gem vs Market</th>
                      <th style={{ padding: '10px 8px', textAlign: 'left' }}>Best Market Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitorBenchmarkData.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 700, color: '#f8fafc' }}>{r.product}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#94a3b8' }}>{r.avgMrp ? `₹${r.avgMrp}` : '—'}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#60a5fa', fontSize: 13 }}>
                          {r.avgGem ? `₹${r.avgGem}` : '—'}
                          {r.discountOffMrp > 0 && <span style={{ display: 'block', fontSize: 10, color: '#4ade80' }}>(-{r.discountOffMrp}% off)</span>}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.avgJivo ? '#cbd5e1' : '#64748b' }}>{r.avgJivo ? `₹${r.avgJivo}` : '—'}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.avgMrGold ? '#cbd5e1' : '#64748b' }}>{r.avgMrGold ? `₹${r.avgMrGold}` : '—'}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.avgFortune ? '#cbd5e1' : '#64748b' }}>{r.avgFortune ? `₹${r.avgFortune}` : '—'}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.avgGoldwinner ? '#cbd5e1' : '#64748b' }}>{r.avgGoldwinner ? `₹${r.avgGoldwinner}` : '—'}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: r.avgIdhayam ? '#cbd5e1' : '#64748b' }}>{r.avgIdhayam ? `₹${r.avgIdhayam}` : '—'}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>{r.marketAvg ? `₹${r.marketAvg}` : '—'}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          {r.marketAvg && r.avgGem ? (
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              background: r.gemVsMarketDiff > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                              color: r.gemVsMarketDiff > 0 ? '#f87171' : '#4ade80'
                            }}>
                              {r.gemVsMarketDiff > 0 ? `+₹${r.gemVsMarketDiff} (${r.gemVsMarketPct}% Prem.)` : r.gemVsMarketDiff < 0 ? `-₹${Math.abs(r.gemVsMarketDiff)} (${Math.abs(r.gemVsMarketPct)}% Disc.)` : 'Parity'}
                            </span>
                          ) : <span style={{ color: '#64748b' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#4ade80', fontWeight: 600 }}>{r.lowestBrand}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: CITY-WISE PARITY MATRIX (SEPARATE INSTA & BLINKIT COLUMNS) */}
          {activeSubTab === 'city_matrix' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                    City-Wise Pricing Matrix (Separate Instamart &amp; Blinkit Columns)
                  </h3>
                  {/* Alert Filters */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { id: 'All', label: 'All Records' },
                      { id: 'hikes', label: '▲ Price Hikes' },
                      { id: 'drops', label: '▼ Price Drops' },
                      { id: 'gaps', label: '⚡🟡 Parity Gaps' },
                      { id: 'oos', label: '⛔ Out of Stock' }
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
                    {allCities.map(c => <option key={c} value={c}>{c === 'All' ? 'All Cities' : formatCity(c)}</option>)}
                  </select>

                  <select
                    value={selectedProduct}
                    onChange={e => setSelectedProduct(e.target.value)}
                    style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f8fafc', padding: '5px 10px', fontSize: 12 }}
                  >
                    {allProducts.map(p => <option key={p} value={p}>{p === 'All' ? 'All Products' : p}</option>)}
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
                  <CSVButton makeRows={makeCityMatrixCSV} filename={`city_parity_matrix_${effectiveDayD}.csv`} />
                </div>
              </div>

              <DataTable
                columns={cityMatrixColumns}
                rows={filteredCityMatrix}
                pageSize={15}
                emptyMessage="No city records match the selected filters."
              />
            </div>
          )}

          {/* TAB 3: 2-DAY PRICE SHIFTS LOG */}
          {activeSubTab === 'alerts_2day' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                  2-Day Price Shifts &amp; Parity Anomalies Log ({formatPrettyDate(effectiveDayD)} vs {formatPrettyDate(effectiveDayPrev)})
                </h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  List of all products and locations where prices increased, dropped, or diverged across platforms
                </div>
              </div>

              <DataTable
                columns={cityMatrixColumns}
                rows={priceAlertsList}
                pageSize={15}
                emptyMessage="No price anomalies or shifts detected for this 2-day comparison period."
              />
            </div>
          )}

          {/* TAB 4: VISUAL PRICE POSITIONING CHART */}
          {activeSubTab === 'chart' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                  Price Comparison: Gem vs Jivo, MR. Gold, Fortune, Goldwinner, Idhayam
                </h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Side-by-side product price positioning (₹/unit)
                </div>
              </div>

              <div style={{ width: '100%', height: 380 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="product" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `₹${v}`} />
                    <ReTooltip
                      contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: 8, color: '#f8fafc' }}
                      formatter={(val, name) => [`₹${val}`, name]}
                    />
                    <Legend wrapperStyle={{ paddingTop: 10, fontSize: 12 }} />
                    <Bar dataKey="Gem" fill="#3b82f6" name="💎 Gem's Gold" radius={[4, 4, 0, 0]} />
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