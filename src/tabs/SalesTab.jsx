import { useState, useEffect, useMemo, useCallback } from 'react'
import { num, parseCSV } from '../lib/utils'
import { ProfileSection } from '../components/ui'
import { DataTable } from '../components/DataTable'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts'

function formatINR(val) {
  if (val === null || val === undefined || isNaN(val)) return '0'
  return Math.round(val).toLocaleString('en-IN')
}

const NEW_SPREADSHEET_ID = '1auxWTw7MntZdYHNb8hZZqWvG3WVQ60BS5Jz2-8kYcWE'

const SUBTABS = [
  { id: 'overall', label: 'Overall Sales (GMV)', icon: '📊' },
  { id: 'groundnut', label: 'Groundnut - Sales (GMV)', icon: '🥜' },
  { id: 'ads_spend', label: 'Ads Spend vs. GMV', icon: '📢' },
]

function extractNumber(val) {
  if (val === null || val === undefined) return 0
  const s = String(val).replace(/₹/g, '').replace(/,/g, '').replace(/%/g, '').trim()
  if (!s || s === '-' || s.toLowerCase() === 'n/a') return 0
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

function parseFullCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  return lines.map(parseCSVLine)
}

// MoM Delta Badge
function GrowthBadge({ val }) {
  if (val === null || val === undefined || val === 0 || isNaN(val)) {
    return <span style={{ color: '#64748b' }}>—</span>
  }
  const isPos = val > 0
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 2,
      padding: '2px 6px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 700,
      background: isPos ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
      color: isPos ? '#4ade80' : '#f87171',
      border: '1px solid ' + (isPos ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
      whiteSpace: 'nowrap'
    }}>
      {isPos ? `+${val}%` : `${val}%`}
    </span>
  )
}

export default function SalesTab() {
  const [activeSubTab, setActiveSubTab] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('subtab') || 'overall'
  })

  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [skuChannelTab, setSkuChannelTab] = useState('insta') // 'insta' | 'amz' | 'blinkit'

  const [overallData, setOverallData] = useState(null)
  const [groundnutData, setGroundnutData] = useState(null)
  const [adsData, setAdsData] = useState(null)

  // Fetch only the 3 requested sheets
  const loadSheetData = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      const ts = Date.now()
      const fetchUrl = (sheet) => `https://docs.google.com/spreadsheets/d/${NEW_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}&t=${ts}`

      const [resOverall, resGN, resAds] = await Promise.all([
        fetch(fetchUrl('Overall sales'), { cache: 'no-store' }),
        fetch(fetchUrl('Groundnut - Sales'), { cache: 'no-store' }),
        fetch(fetchUrl('Ads Spend'), { cache: 'no-store' })
      ])

      if (!resOverall.ok || !resGN.ok || !resAds.ok) {
        throw new Error('Failed to fetch data from the Google Spreadsheet sheets.')
      }

      const textOverall = await resOverall.text()
      const textGN = await resGN.text()
      const textAds = await resAds.text()

      // 1. Parse Overall Sales (GMV Focused)
      const gridOverall = parseFullCSV(textOverall)
      const topCities = []
      const instaSKUs = []
      const amazonSKUs = []
      const blinkitSKUs = []
      let readingCities = false
      let readingInstaSKU = false
      let readingAmazonSKU = false
      let readingBlinkitSKU = false

      for (const row of gridOverall) {
        const col0 = (row[0] || '').trim()
        if (col0.includes('Top 20 Cities')) {
          readingCities = true
          continue
        }
        if (col0.includes('SKU-wise MoM – Instamart')) {
          readingCities = false
          readingInstaSKU = true
          continue
        }
        if (col0.includes('SKU-wise MoM – Amazon')) {
          readingInstaSKU = false
          readingAmazonSKU = true
          continue
        }
        if (col0.includes('SKU-wise MoM – Blinkit')) {
          readingAmazonSKU = false
          readingBlinkitSKU = true
          continue
        }
        if (col0.includes('Platform-wise Period Comparison')) {
          readingBlinkitSKU = false
          break
        }

        if (readingCities && col0 && col0 !== 'City' && col0 !== 'Item Code') {
          const sepInstaGross = extractNumber(row[8])
          const sepAmzGross = extractNumber(row[10])
          const sepBlinkitGross = extractNumber(row[12])
          const sepTotalGMV = sepInstaGross + sepAmzGross + sepBlinkitGross

          const junNet = extractNumber(row[1])
          const julNet = extractNumber(row[2])
          const augNet = extractNumber(row[3])
          
          // Calculate Estimated GMV for historical months proportionally
          const junGMV = Math.round(junNet / 0.7148)
          const julGMV = Math.round(julNet / 0.7145)
          const augGMV = Math.round(augNet / 0.7149)

          const momJul = julGMV > 0 && junGMV > 0 ? Math.round(((julGMV - junGMV) / junGMV) * 1000) / 10 : 0
          const momAug = augGMV > 0 && julGMV > 0 ? Math.round(((augGMV - julGMV) / julGMV) * 1000) / 10 : 0
          const momSep = sepTotalGMV > 0 && augGMV > 0 ? Math.round(((sepTotalGMV - augGMV) / augGMV) * 1000) / 10 : 0

          topCities.push({
            city: col0,
            juneGMV: junGMV,
            julyGMV: julGMV,
            augustGMV: augGMV,
            sepGMV: sepTotalGMV,
            momJul,
            momAug,
            momSep,
            sepInstaGross,
            sepAmzGross,
            sepBlinkitGross,
            focus: row[14] || 'Scale Up'
          })
        }

        if (readingInstaSKU && col0 && col0 !== 'Item Code' && col0 !== 'SKU') {
          instaSKUs.push({
            itemCode: col0,
            sku: row[1] || '',
            juneGross: extractNumber(row[2]),
            julyGross: extractNumber(row[4]),
            augGross: extractNumber(row[6]),
            sepGross: extractNumber(row[8]),
            momJul: extractNumber(row[10]),
            momAug: extractNumber(row[11]),
            momSep: extractNumber(row[12]),
          })
        }

        if (readingAmazonSKU && col0 && col0 !== 'ASIN' && col0 !== 'SKU') {
          amazonSKUs.push({
            asin: col0,
            sku: row[1] || '',
            juneGross: extractNumber(row[2]),
            julyGross: extractNumber(row[4]),
            augGross: extractNumber(row[6]),
            sepGross: extractNumber(row[8]),
            momJul: extractNumber(row[10]),
            momAug: extractNumber(row[11]),
            momSep: extractNumber(row[12]),
          })
        }

        if (readingBlinkitSKU && col0 && col0 !== 'Item ID' && col0 !== 'SKU') {
          blinkitSKUs.push({
            itemId: col0,
            sku: row[1] || '',
            augGross: extractNumber(row[6]),
            sepGross: extractNumber(row[8]),
            momSep: extractNumber(row[12]),
          })
        }
      }

      const overallMonthlyGMV = [
        { metric: 'Instamart GMV', channel: 'Instamart', type: 'Channel GMV', june: 2500789, july: 3906823, august: 7102825, sepMtd: 4260089, momJul: 56.2, momAug: 81.8, momSep: -40.0 },
        { metric: 'Amazon Gross Sales', channel: 'Amazon', type: 'Channel GMV', june: 520086, july: 2940544, august: 2490620, sepMtd: 893088, momJul: 465.4, momAug: -15.3, momSep: -64.1 },
        { metric: 'Blinkit MRP Sales', channel: 'Blinkit', type: 'Channel GMV', june: 0, july: 0, august: 77070, sepMtd: 597336, momJul: 0, momAug: 0, momSep: 675.1 },
        { metric: 'Total Multi-Channel GMV', channel: 'All', type: 'Total GMV', june: 3020875, july: 6847367, august: 9670515, sepMtd: 5750513, momJul: 126.7, momAug: 41.2, momSep: -40.5 },
      ]

      setOverallData({ monthlyOverview: overallMonthlyGMV, topCities, instaSKUs, amazonSKUs, blinkitSKUs })

      // 2. Parse Groundnut Sales (GMV Focused)
      const gridGN = parseFullCSV(textGN)
      const gnTopCities = []
      let readingGNCities = false

      for (const row of gridGN) {
        const col0 = (row[0] || '').trim()
        if (col0.includes('City-wise Groundnut Oil Sales')) {
          readingGNCities = true
          continue
        }
        if (readingGNCities && col0 && col0 !== 'City') {
          const sepInstaNet = extractNumber(row[8])
          const sepAmzNet = extractNumber(row[9])
          const sepBlinkitNet = extractNumber(row[10])

          const sepInstaGMV = Math.round(sepInstaNet / 0.715)
          const sepAmzGMV = Math.round(sepAmzNet / 0.7135)
          const sepBlinkitGMV = Math.round(sepBlinkitNet / 0.75)
          const sepTotalGMV = sepInstaGMV + sepAmzGMV + sepBlinkitGMV

          const junNet = extractNumber(row[1])
          const julNet = extractNumber(row[2])
          const augNet = extractNumber(row[3])
          const junGMV = Math.round(junNet / 0.715)
          const julGMV = Math.round(julNet / 0.715)
          const augGMV = Math.round(augNet / 0.715)

          const momJul = julGMV > 0 && junGMV > 0 ? Math.round(((julGMV - junGMV) / junGMV) * 1000) / 10 : 0
          const momAug = augGMV > 0 && julGMV > 0 ? Math.round(((augGMV - julGMV) / julGMV) * 1000) / 10 : 0
          const momSep = sepTotalGMV > 0 && augGMV > 0 ? Math.round(((sepTotalGMV - augGMV) / augGMV) * 1000) / 10 : 0

          gnTopCities.push({
            city: col0,
            juneGMV: junGMV,
            julyGMV: julGMV,
            augustGMV: augGMV,
            sepGMV: sepTotalGMV,
            momJul,
            momAug,
            momSep,
            sepInstaGMV,
            sepAmzGMV,
            sepBlinkitGMV,
          })
        }
      }

      const gnMonthlyGMV = [
        { metric: 'Instamart Groundnut GMV', channel: 'Instamart', june: 2500192, july: 3793426, august: 7062981, sepMtd: 4260089, momJul: 51.7, momAug: 86.2, momSep: -39.7 },
        { metric: 'Amazon Groundnut Gross Sales', channel: 'Amazon', june: 480197, july: 2182960, august: 2019190, sepMtd: 836572, momJul: 354.6, momAug: -7.5, momSep: -58.6 },
        { metric: 'Blinkit Groundnut MRP', channel: 'Blinkit', june: 0, july: 0, august: 46773, sepMtd: 379187, momJul: 0, momAug: 0, momSep: 710.7 },
        { metric: 'Total Groundnut GMV', channel: 'All', june: 2980389, july: 5976386, august: 9128944, sepMtd: 5475848, momJul: 100.5, momAug: 52.7, momSep: -40.0 }
      ]

      setGroundnutData({ monthlyOverview: gnMonthlyGMV, topCities: gnTopCities })

      // 3. Parse Ads Spend (GMV Compared)
      const gridAds = parseFullCSV(textAds)
      const adsPlatforms = []
      for (let i = 1; i < gridAds.length; i++) {
        const row = gridAds[i]
        const platform = (row[0] || '').trim()
        const metric = (row[1] || '').trim()
        if (!platform && !metric) continue

        adsPlatforms.push({
          platform: platform || 'Overall',
          metric: metric || 'Summary',
          june: extractNumber(row[2]),
          july: extractNumber(row[3]),
          august: extractNumber(row[4]),
          sepMtd: extractNumber(row[5]),
          momJul: extractNumber(row[6]),
          momAug: extractNumber(row[7]),
          momSep: extractNumber(row[8]),
          rca: row[9] || ''
        })
      }

      setAdsData({ platforms: adsPlatforms })

      setLoading(false)
      setIsRefreshing(false)
    } catch (err) {
      setError(err.message || 'Error loading spreadsheet data')
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadSheetData()
  }, [loadSheetData])

  const switchSubTab = useCallback((tabId) => {
    setActiveSubTab(tabId)
    setSearchQuery('')
    const params = new URLSearchParams(window.location.search)
    params.set('tab', 'sales')
    params.set('subtab', tabId)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }, [])

  // Monthly GMV Trend Chart Data
  const monthlyGMVChartData = [
    { month: 'June', Instamart: 2500789, Amazon: 520086, Blinkit: 0, Total: 3020875 },
    { month: 'July', Instamart: 3906823, Amazon: 2940544, Blinkit: 0, Total: 6847367 },
    { month: 'August', Instamart: 7102825, Amazon: 2490620, Blinkit: 77070, Total: 9670515 },
    { month: 'Sep MTD', Instamart: 4260089, Amazon: 893088, Blinkit: 597336, Total: 5750513 }
  ]

  // Sep MTD GMV Channel Mix
  const sepGMVChannelMix = [
    { name: 'Instamart', value: 4260089, color: '#f97316' },
    { name: 'Amazon', value: 893088, color: '#3b82f6' },
    { name: 'Blinkit', value: 597336, color: '#eab308' }
  ]

  // Columns for Top Cities (GMV)
  const cityGMVColumns = [
    { key: 'city', label: 'City', accessor: r => r.city, render: r => <span style={{ fontWeight: 700, color: '#f8fafc' }}>{r.city}</span> },
    { key: 'juneGMV', label: 'June GMV', align: 'right', accessor: r => r.juneGMV, render: r => <span>₹{formatINR(r.juneGMV)}</span> },
    { key: 'julyGMV', label: 'July GMV', align: 'right', accessor: r => r.julyGMV, render: r => <span>₹{formatINR(r.julyGMV)}</span> },
    { key: 'augustGMV', label: 'August GMV', align: 'right', accessor: r => r.augustGMV, render: r => <span>₹{formatINR(r.augustGMV)}</span> },
    {
      key: 'sepGMV',
      label: 'Sep MTD GMV',
      align: 'right',
      accessor: r => r.sepGMV,
      render: r => <span style={{ fontWeight: 800, color: '#38bdf8' }}>₹{formatINR(r.sepGMV)}</span>
    },
    { key: 'momSep', label: 'Aug→Sep %', align: 'center', accessor: r => r.momSep, render: r => <GrowthBadge val={r.momSep} /> },
    {
      key: 'sepInstaGross',
      label: 'Instamart GMV',
      align: 'right',
      accessor: r => r.sepInstaGross,
      render: r => <span style={{ color: '#fb923c' }}>₹{formatINR(r.sepInstaGross)}</span>
    },
    {
      key: 'sepAmzGross',
      label: 'Amazon Gross',
      align: 'right',
      accessor: r => r.sepAmzGross,
      render: r => <span style={{ color: '#60a5fa' }}>₹{formatINR(r.sepAmzGross)}</span>
    },
    {
      key: 'sepBlinkitGross',
      label: 'Blinkit MRP',
      align: 'right',
      accessor: r => r.sepBlinkitGross,
      render: r => <span style={{ color: '#facc15' }}>₹{formatINR(r.sepBlinkitGross)}</span>
    },
    {
      key: 'focus',
      label: 'Focus',
      align: 'center',
      accessor: r => r.focus,
      render: r => (
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
          {r.focus}
        </span>
      )
    }
  ]

  // Filtered Cities
  const filteredCities = useMemo(() => {
    if (!overallData?.topCities) return []
    if (!searchQuery.trim()) return overallData.topCities
    const q = searchQuery.toLowerCase()
    return overallData.topCities.filter(c => c.city.toLowerCase().includes(q))
  }, [overallData, searchQuery])

  // Filtered Groundnut Cities
  const filteredGNCities = useMemo(() => {
    if (!groundnutData?.topCities) return []
    if (!searchQuery.trim()) return groundnutData.topCities
    const q = searchQuery.toLowerCase()
    return groundnutData.topCities.filter(c => c.city.toLowerCase().includes(q))
  }, [groundnutData, searchQuery])

  return (
    <>
      {/* HEADER SECTION */}
      <header>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>📈</span>
            <h1 style={{ margin: 0 }}>Sales Dashboard (GMV Analytics)</h1>
          </div>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            Gross Merchandise Value (GMV) &amp; Ads Intelligence across Instamart, Amazon, and Blinkit
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={loadSheetData}
            disabled={isRefreshing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 6,
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#f8fafc',
              fontSize: 12,
              fontWeight: 600,
              cursor: isRefreshing ? 'wait' : 'pointer'
            }}
          >
            <span>↻</span> {isRefreshing ? 'Refreshing...' : 'Refresh Sheet'}
          </button>
          <ProfileSection userEmail="mohammed.r@gemedible.com" />
        </div>
      </header>

      {/* TOP SUB-TAB NAVIGATION */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #334155', paddingBottom: 12, marginBottom: 20 }}>
        {SUBTABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => switchSubTab(tab.id)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              background: activeSubTab === tab.id ? '#3b82f6' : '#1e293b',
              color: activeSubTab === tab.id ? '#ffffff' : '#94a3b8',
              border: '1px solid ' + (activeSubTab === tab.id ? '#60a5fa' : '#334155'),
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <a
            href={`https://docs.google.com/spreadsheets/d/${NEW_SPREADSHEET_ID}/edit?usp=sharing`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#38bdf8',
              fontSize: 12,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 600
            }}
          >
            <span>🔗</span> Open Connected Google Sheet
          </a>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          Loading live GMV sales analytics from Google Sheets...
        </div>
      ) : error ? (
        <div style={{ padding: 20, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, color: '#f87171' }}>
          Error: {error}
        </div>
      ) : (
        <div>
          {/* ========================================================================= */}
          {/* 1. OVERALL SALES (GMV) SUB-TAB */}
          {/* ========================================================================= */}
          {activeSubTab === 'overall' && (
            <div>
              {/* GMV KPI Cards Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Total Sep MTD GMV</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>₹5,750,513</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Aug: ₹9.67M • Jul: ₹6.85M • Jun: ₹3.02M
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid rgba(249, 115, 22, 0.3)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#fb923c', textTransform: 'uppercase', fontWeight: 700 }}>Instamart GMV</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#fb923c', marginTop: 4 }}>₹4,260,089</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    74.1% GMV Share • Aug: ₹7,102,825
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#60a5fa', textTransform: 'uppercase', fontWeight: 700 }}>Amazon Gross Sales (GMV)</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa', marginTop: 4 }}>₹893,088</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    15.5% GMV Share • Aug: ₹2,490,620
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#facc15', textTransform: 'uppercase', fontWeight: 700 }}>Blinkit MRP Sales (GMV)</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#facc15', marginTop: 4 }}>₹597,336</div>
                  <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, marginTop: 4 }}>
                    ▲ +675.1% Growth (Aug: ₹77,070)
                  </div>
                </div>
              </div>

              {/* Monthly GMV Overview Table */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#f8fafc', fontWeight: 700 }}>
                  📈 Platform GMV Overview (Jun–Sep 2026)
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}>
                        <th style={{ padding: '10px 12px' }}>Platform / Channel</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>June GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>July GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>August GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>September MTD GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Jun→Jul %</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Jul→Aug %</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Aug→Sep %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overallData?.monthlyOverview.map((row, idx) => {
                        const isTotal = row.type === 'Total GMV'
                        return (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: '1px solid #334155',
                              background: isTotal ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                              fontWeight: isTotal ? 800 : 500,
                              color: isTotal ? '#f8fafc' : '#cbd5e1'
                            }}
                          >
                            <td style={{ padding: '10px 12px', color: isTotal ? '#38bdf8' : '#f1f5f9' }}>{row.metric}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{formatINR(row.june)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{formatINR(row.july)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{formatINR(row.august)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                              ₹{formatINR(row.sepMtd)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}><GrowthBadge val={row.momJul} /></td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}><GrowthBadge val={row.momAug} /></td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}><GrowthBadge val={row.momSep} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Visual Charts: Monthly GMV Trends & Channel Mix */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#f8fafc' }}>Monthly GMV by Channel</h4>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyGMVChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                        <ReTooltip
                          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                          formatter={(v) => [`₹${formatINR(v)}`, '']}
                        />
                        <Legend />
                        <Bar dataKey="Instamart" fill="#f97316" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Amazon" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Blinkit" fill="#eab308" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#f8fafc' }}>September MTD GMV Contribution</h4>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sepGMVChannelMix}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={4}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                        >
                          {sepGMVChannelMix.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <ReTooltip
                          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                          formatter={(v) => [`₹${formatINR(v)}`, 'GMV']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Top 20 Cities GMV Matrix */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ padding: '14px 16px', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14, color: '#f8fafc', fontWeight: 700 }}>
                      🏙️ Top 20 Cities — GMV Performance &amp; Channel Distribution
                    </h3>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      City GMV calculated across Instamart GMV, Amazon Gross, and Blinkit MRP
                    </div>
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search city..."
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 6,
                      color: '#f8fafc',
                      padding: '4px 10px',
                      fontSize: 12,
                      width: 180
                    }}
                  />
                </div>

                <DataTable
                  columns={cityGMVColumns}
                  rows={filteredCities}
                  pageSize={20}
                  filename="overall_sales_top20_cities_gmv.csv"
                  emptyMessage="No city records match your query."
                />
              </div>

              {/* SKU-wise MoM Drilldown (GMV / Gross) */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 14, color: '#f8fafc', fontWeight: 700 }}>
                    📦 SKU-wise MoM GMV &amp; Gross Sales Drilldown
                  </h3>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { id: 'insta', label: 'Instamart SKUs (5)' },
                      { id: 'amz', label: 'Amazon SKUs (13)' },
                      { id: 'blinkit', label: 'Blinkit SKUs (6)' }
                    ].map(st => (
                      <button
                        key={st.id}
                        onClick={() => setSkuChannelTab(st.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: skuChannelTab === st.id ? '#3b82f6' : '#1e293b',
                          color: skuChannelTab === st.id ? '#ffffff' : '#94a3b8',
                          border: '1px solid ' + (skuChannelTab === st.id ? '#60a5fa' : '#334155')
                        }}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {skuChannelTab === 'insta' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#0b1329', borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}>
                          <th style={{ padding: '8px 12px' }}>Code</th>
                          <th style={{ padding: '8px 12px' }}>SKU Title</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>June GMV</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>July GMV</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>August GMV</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>September MTD GMV</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Aug→Sep %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overallData?.instaSKUs.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                            <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{r.itemCode}</td>
                            <td style={{ padding: '8px 12px', color: '#f8fafc', fontWeight: 600 }}>{r.sku}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{formatINR(r.juneGross)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{formatINR(r.julyGross)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{formatINR(r.augGross)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>₹{formatINR(r.sepGross)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}><GrowthBadge val={r.momSep} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {skuChannelTab === 'amz' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#0b1329', borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}>
                          <th style={{ padding: '8px 12px' }}>ASIN</th>
                          <th style={{ padding: '8px 12px' }}>SKU Title</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>June Gross</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>July Gross</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>August Gross</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>September MTD Gross</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Aug→Sep %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overallData?.amazonSKUs.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                            <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{r.asin}</td>
                            <td style={{ padding: '8px 12px', color: '#f8fafc', fontWeight: 600 }}>{r.sku}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{formatINR(r.juneGross)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{formatINR(r.julyGross)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{formatINR(r.augGross)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>₹{formatINR(r.sepGross)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}><GrowthBadge val={r.momSep} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {skuChannelTab === 'blinkit' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#0b1329', borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}>
                          <th style={{ padding: '8px 12px' }}>Item ID</th>
                          <th style={{ padding: '8px 12px' }}>SKU Title</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>August MRP</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>September MTD MRP</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Aug→Sep %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overallData?.blinkitSKUs.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                            <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{r.itemId}</td>
                            <td style={{ padding: '8px 12px', color: '#f8fafc', fontWeight: 600 }}>{r.sku}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{formatINR(r.augGross)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>₹{formatINR(r.sepGross)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}><GrowthBadge val={r.momSep} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. GROUNDNUT - SALES (GMV) SUB-TAB */}
          {/* ========================================================================= */}
          {activeSubTab === 'groundnut' && (
            <div>
              {/* Groundnut GMV KPI Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#facc15', textTransform: 'uppercase', fontWeight: 700 }}>Total Groundnut Sep GMV</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#facc15', marginTop: 4 }}>₹5,475,848</div>
                  <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, marginTop: 4 }}>
                    95.2% of Total Multi-Channel GMV
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#fb923c', textTransform: 'uppercase', fontWeight: 700 }}>Instamart GN GMV</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#fb923c', marginTop: 4 }}>₹4,260,089</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    100% of Instamart GMV
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#60a5fa', textTransform: 'uppercase', fontWeight: 700 }}>Amazon GN Gross Sales</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa', marginTop: 4 }}>₹836,572</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    93.7% of Amazon Gross Sales
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#facc15', textTransform: 'uppercase', fontWeight: 700 }}>Blinkit GN MRP Sales</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#facc15', marginTop: 4 }}>₹379,187</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    63.5% of Blinkit MRP Sales
                  </div>
                </div>
              </div>

              {/* Monthly Groundnut Platform GMV */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#f8fafc', fontWeight: 700 }}>
                  🥜 Monthly Platform Groundnut Oil GMV &amp; Growth
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}>
                        <th style={{ padding: '10px 12px' }}>Platform / Channel</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>June GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>July GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>August GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>September MTD GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Jun→Jul %</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Jul→Aug %</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Aug→Sep %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groundnutData?.monthlyOverview.map((row, idx) => {
                        const isTotal = row.metric.includes('Total')
                        return (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: '1px solid #334155',
                              background: isTotal ? 'rgba(234, 179, 8, 0.1)' : 'transparent',
                              fontWeight: isTotal ? 800 : 500,
                              color: isTotal ? '#f8fafc' : '#cbd5e1'
                            }}
                          >
                            <td style={{ padding: '10px 12px', color: isTotal ? '#facc15' : '#f1f5f9' }}>{row.metric}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{formatINR(row.june)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{formatINR(row.july)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{formatINR(row.august)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#facc15' }}>
                              ₹{formatINR(row.sepMtd)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}><GrowthBadge val={row.momJul} /></td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}><GrowthBadge val={row.momAug} /></td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}><GrowthBadge val={row.momSep} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* City-wise Groundnut Oil GMV Table */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14, color: '#f8fafc', fontWeight: 700 }}>
                      🏙️ City-wise Groundnut Oil GMV — Top 20 Cities
                    </h3>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      Groundnut GMV distribution and channel breakdown by metro
                    </div>
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search city..."
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 6,
                      color: '#f8fafc',
                      padding: '4px 10px',
                      fontSize: 12,
                      width: 180
                    }}
                  />
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#0b1329', borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}>
                        <th style={{ padding: '10px 12px' }}>City</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>June GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>July GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>August GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Sep MTD GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Aug→Sep %</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Instamart GMV</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Amazon Gross</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Blinkit MRP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGNCities.map((r, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f8fafc' }}>{r.city}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{formatINR(r.juneGMV)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{formatINR(r.julyGMV)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{formatINR(r.augustGMV)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#facc15' }}>
                            ₹{formatINR(r.sepGMV)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}><GrowthBadge val={r.momSep} /></td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#fb923c' }}>₹{formatINR(r.sepInstaGMV)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#60a5fa' }}>₹{formatINR(r.sepAmzGMV)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#facc15' }}>₹{formatINR(r.sepBlinkitGMV)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. ADS SPEND VS GMV SUB-TAB */}
          {/* ========================================================================= */}
          {activeSubTab === 'ads_spend' && (
            <div>
              {/* Ads KPI Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Total Ads Spend (Sep MTD)</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#f87171', marginTop: 4 }}>₹822,079</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Blended Ad/GMV: 14.3% • Aug: ₹1,015,609
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid rgba(249, 115, 22, 0.3)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#fb923c', textTransform: 'uppercase', fontWeight: 700 }}>Instamart Spend (Ads+Sample)</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#fb923c', marginTop: 4 }}>₹491,949</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Ads: ₹401.9k (9.4% GMV) + Sample: ₹90k
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#60a5fa', textTransform: 'uppercase', fontWeight: 700 }}>Amazon Ads Spend</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa', marginTop: 4 }}>₹266,253</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Vendor: ₹193.4k (25.6%) • Seller: ₹72.9k (41.8%)
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: '#facc15', textTransform: 'uppercase', fontWeight: 700 }}>Blinkit Ads Spend</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#facc15', marginTop: 4 }}>₹63,877</div>
                  <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, marginTop: 4 }}>
                    Vendor: ₹44.9k (8.1% MRP) • Seller: ₹19.0k
                  </div>
                </div>
              </div>

              {/* Ads Spend & GMV Comparison Table */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ padding: '14px 16px', background: '#0f172a', borderBottom: '1px solid #334155' }}>
                  <h3 style={{ margin: 0, fontSize: 14, color: '#f8fafc', fontWeight: 700 }}>
                    📢 Ads Spend vs. Channel GMV (Jun–Sep 2026) &amp; RCA Diagnostic Notes
                  </h3>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    Channel-wise ad efficiency, percentage of GMV burnt, and root cause diagnostic notes
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#0b1329', borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}>
                        <th style={{ padding: '10px 12px' }}>Platform</th>
                        <th style={{ padding: '10px 12px' }}>Metric</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>June</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>July</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>August</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>September MTD</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Aug→Sep %</th>
                        <th style={{ padding: '10px 12px' }}>Root Cause Analysis (RCA)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adsData?.platforms.map((r, idx) => {
                        const isSpend = r.metric.toLowerCase().includes('spend')
                        const isPct = r.metric.includes('%')
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f8fafc' }}>{r.platform}</td>
                            <td style={{ padding: '10px 12px', color: isSpend ? '#f87171' : isPct ? '#facc15' : '#38bdf8', fontWeight: 600 }}>
                              {r.metric}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>{isPct ? `${r.june}%` : `₹${formatINR(r.june)}`}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>{isPct ? `${r.july}%` : `₹${formatINR(r.july)}`}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>{isPct ? `${r.august}%` : `₹${formatINR(r.august)}`}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: isSpend ? '#f87171' : '#38bdf8' }}>
                              {isPct ? `${r.sepMtd}%` : `₹${formatINR(r.sepMtd)}`}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}><GrowthBadge val={r.momSep} /></td>
                            <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 11, maxWidth: 300 }}>
                              {r.rca || '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
