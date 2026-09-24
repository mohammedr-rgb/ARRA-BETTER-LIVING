import { useState, useEffect, useMemo, useCallback } from 'react'
import { num, parseCSV, MONTH_NAMES } from '../lib/utils'
import { ProfileSection } from '../components/ui'
import { DataTable } from '../components/DataTable'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend
} from 'recharts'

const SPREADSHEET_ID = '11kG7PuGGRWhABPFS-aErGvkHHf5tQPFf7r_J4WOE_ks'

const SALES_SUBTABS = [
  { id: 'ads', label: 'Ads - Overall', icon: '📢' },
  { id: 'amazon', label: 'Raw - Amazon Sales', gid: '0', icon: '🛒' },
  { id: 'insta', label: 'Raw - Insta Sales', gid: '534975184', icon: '⚡' },
  { id: 'blinkit', label: 'Raw - Partner Blinkit Sales', gid: '45158830', icon: '🟡' },
  { id: 'seller', label: 'Raw - Amazon Seller Sales', gid: '134290562', icon: '📦' },
]

const ADS_SHEETS = [
  { platform: 'Instamart', gid: '2072392090', color: '#f97316', icon: '⚡' },
  { platform: 'Blinkit', gid: '965711422', color: '#eab308', icon: '🟡' },
  { platform: 'Amazon Vendor', gid: '2141078441', color: '#3b82f6', icon: '🛒' },
]

// Extract month key (year * 12 + 0-indexed month)
function parseDateMonthKey(dateStr, monthStr) {
  if (monthStr) {
    const s = String(monthStr).trim().toLowerCase()
    const fullMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    const idx = fullMonths.indexOf(s)
    if (idx !== -1) return 2026 * 12 + idx
    const shortIdx = MONTH_NAMES.map(m => m.toLowerCase()).indexOf(s.slice(0, 3))
    if (shortIdx !== -1) return 2026 * 12 + shortIdx
  }
  if (dateStr) {
    const s = String(dateStr).trim()
    const parts = s.split(/[/-]/)
    if (parts.length === 3) {
      let y = parseInt(parts[2], 10)
      let m = parseInt(parts[1], 10) - 1
      if (parts[0].length === 4) {
        y = parseInt(parts[0], 10)
        m = parseInt(parts[1], 10) - 1
      } else if (parts[1] > 12) {
        m = parseInt(parts[0], 10) - 1
      }
      if (!isNaN(y) && !isNaN(m) && y > 2000 && m >= 0 && m < 12) {
        return y * 12 + m
      }
    }
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      return d.getFullYear() * 12 + d.getMonth()
    }
  }
  return null
}

function extractRowMonthKey(row, subtabId) {
  if (!row) return null

  // 1. Ads - Overall (normalized row already contains monthKey)
  if (subtabId === 'ads') {
    return row.monthKey || null
  }

  // 2. Amazon Vendor Sales (gid: 0)
  if (subtabId === 'amazon') {
    const y = parseInt(row['orderYear'], 10)
    const m = parseInt(row['orderMonth'], 10) - 1
    if (!isNaN(y) && !isNaN(m) && y > 2000 && m >= 0 && m < 12) {
      return y * 12 + m
    }
  }

  // 3. Insta Sales (gid: 534975184)
  if (subtabId === 'insta') {
    const val = row['ORDERED_DATE']
    if (val) {
      const s = String(val).trim()
      const m1 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
      if (m1) {
        return parseInt(m1[1], 10) * 12 + (parseInt(m1[2], 10) - 1)
      }
      const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
      if (m2) {
        return parseInt(m2[3], 10) * 12 + (parseInt(m2[2], 10) - 1)
      }
      const d = new Date(s)
      if (!isNaN(d.getTime())) {
        return d.getFullYear() * 12 + d.getMonth()
      }
    }
  }

  // 4. Blinkit Sales (gid: 45158830)
  if (subtabId === 'blinkit') {
    const val = row['date']
    if (val) {
      const parts = String(val).trim().split('/')
      if (parts.length === 3) {
        const y = parseInt(parts[2], 10)
        const m = parseInt(parts[0], 10) - 1
        if (!isNaN(y) && !isNaN(m) && y > 2000) {
          return y * 12 + m
        }
      }
      const d = new Date(val)
      if (!isNaN(d.getTime())) {
        return d.getFullYear() * 12 + d.getMonth()
      }
    }
    const mName = (row['Month'] || '').trim().toLowerCase()
    const monthNamesLower = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    const mIdx = monthNamesLower.indexOf(mName)
    if (mIdx !== -1) {
      return 2026 * 12 + mIdx
    }
  }

  // 5. Amazon Seller Sales (gid: 134290562)
  if (subtabId === 'seller') {
    const val = row['date/time']
    if (val) {
      const d = new Date(val)
      if (!isNaN(d.getTime())) {
        return d.getFullYear() * 12 + d.getMonth()
      }
    }
  }

  return null
}

export default function SalesTab() {
  const [activeSubTab, setActiveSubTab] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('subtab') || 'ads'
  })

  // Cache fetched data by subtab id: { [subtabId]: rows[] }
  const [cache, setCache] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Ads platform sub-filter ('All' | 'Instamart' | 'Blinkit' | 'Amazon Vendor')
  const [adsPlatformFilter, setAdsPlatformFilter] = useState('All')

  // Month-wise filter state (Set of monthKeys: year * 12 + 0-indexed month)
  const [selectedMonths, setSelectedMonths] = useState(() => new Set())

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
    params.set('tab', 'sales')
    params.set('subtab', subtabId)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }, [])

  // Month toggle and reset
  const toggleMonth = useCallback((mk) => {
    setSelectedMonths(prev => {
      const next = new Set(prev)
      if (next.has(mk)) next.delete(mk)
      else next.add(mk)
      return next
    })
  }, [])

  const resetMonths = useCallback(() => setSelectedMonths(new Set()), [])

  // Fetch subtab data
  const fetchDataForTab = useCallback(async (tabId, force = false) => {
    if (!force && cache[tabId]) return

    setLoading(true)
    setError(null)

    // For Ads - Overall: Fetch from the 3 real Raw Ads sheets
    // (Raw-Insta- Ads, Blinkitt- Ads, Amazon vendor - Ads)
    if (tabId === 'ads') {
      try {
        const [instaRes, blinkitRes, amzRes] = await Promise.all([
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=2072392090`),
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=965711422`),
          fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=2141078441`)
        ])

        const instaText = await instaRes.text()
        const blinkitText = await blinkitRes.text()
        const amzText = await amzRes.text()

        const instaRows = parseCSV(instaText)
          .filter(r => r['CAMPAIGN_NAME'] && r['CAMPAIGN_NAME'].trim() !== '')
          .map(r => ({
            platform: 'Instamart',
            campaignId: r['CAMPAIGN_ID'] || '',
            campaignName: r['CAMPAIGN_NAME'],
            startDate: r['CAMPAIGN_START_DATE'] || '',
            month: r['Month'] || '',
            monthKey: parseDateMonthKey(r['CAMPAIGN_START_DATE'], r['Month']),
            spend: num(r['TOTAL_BUDGET_BURNT']),
            gmv: num(r['TOTAL_GMV']),
            impressions: num(r['TOTAL_IMPRESSIONS']),
            clicks: num(r['TOTAL_CLICKS']),
            conversions: num(r['TOTAL_CONVERSIONS']),
            roas: num(r['TOTAL_ROI']) || (num(r['TOTAL_GMV']) / (num(r['TOTAL_BUDGET_BURNT']) || 1)),
            ctr: r['TOTAL_CTR'] || '',
            cpm: num(r['eCPM']),
            cpc: num(r['eCPC']),
          }))

        const blinkitRows = parseCSV(blinkitText)
          .filter(r => r['CAMPAIGN_NAME'] && r['CAMPAIGN_NAME'].trim() !== '')
          .map(r => ({
            platform: 'Blinkit',
            campaignId: r['CAMPAIGN_ID'] || '',
            campaignName: r['CAMPAIGN_NAME'],
            startDate: r['CAMPAIGN_START_DATE'] || '',
            month: r['MOnth'] || r['Month'] || '',
            monthKey: parseDateMonthKey(r['CAMPAIGN_START_DATE'], r['MOnth'] || r['Month']),
            spend: num(r['TOTAL_BUDGET_BURNT']),
            gmv: num(r['TOTAL_GMV']),
            impressions: num(r['TOTAL_IMPRESSIONS']),
            clicks: num(r['TOTAL_CLICKS']),
            conversions: num(r['TOTAL_CONVERSIONS']),
            roas: num(r['TOTAL_ROI']) || (num(r['TOTAL_GMV']) / (num(r['TOTAL_BUDGET_BURNT']) || 1)),
            ctr: r['TOTAL_CTR'] || '',
            cpm: num(r['eCPM']),
            cpc: num(r['eCPC']),
          }))

        const amzRows = parseCSV(amzText)
          .filter(r => r['Campaign name'] && r['Campaign name'].trim() !== '')
          .map(r => ({
            platform: 'Amazon Vendor',
            campaignId: r['Campaign ID'] || '',
            campaignName: r['Campaign name'],
            startDate: r['Campaign start date'] || '',
            month: '',
            monthKey: parseDateMonthKey(r['Campaign start date'], null),
            spend: num(r['Total cost'] || r['Total cost (converted)']),
            gmv: num(r['Sales'] || r['Sales (converted)']),
            impressions: num(r['Impressions']),
            clicks: num(r['Clicks']),
            conversions: num(r['Purchases']),
            roas: num(r['ROAS']) || (num(r['Sales']) / (num(r['Total cost']) || 1)),
            ctr: r['CTR'] || '',
            cpc: num(r['CPC'] || r['CPC (converted)']),
          }))

        const combinedAds = [...instaRows, ...blinkitRows, ...amzRows]
        setCache(prev => ({ ...prev, ads: combinedAds }))
      } catch (err) {
        console.error('Error loading ads data:', err)
        setError(err.message || 'Failed to fetch raw ads sheets')
      } finally {
        setLoading(false)
      }
      return
    }

    const config = SALES_SUBTABS.find(t => t.id === tabId)
    if (!config) return

    try {
      const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${config.gid}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      const text = await res.text()
      const rows = parseCSV(text)
      setCache(prev => ({ ...prev, [tabId]: rows }))
    } catch (err) {
      console.error(`Error loading ${tabId}:`, err)
      setError(err.message || 'Failed to fetch sheet data')
    } finally {
      setLoading(false)
    }
  }, [cache])

  // Load active subtab data when changed
  useEffect(() => {
    fetchDataForTab(activeSubTab)
  }, [activeSubTab, fetchDataForTab])

  const activeRows = useMemo(() => cache[activeSubTab] || [], [cache, activeSubTab])

  // Extract available months for the active subtab
  const monthOptions = useMemo(() => {
    const map = {}
    for (let i = 0; i < activeRows.length; i++) {
      const mk = extractRowMonthKey(activeRows[i], activeSubTab)
      if (mk !== null && !map[mk]) {
        const y = Math.floor(mk / 12)
        const m = mk % 12
        map[mk] = {
          mk,
          label: `${MONTH_NAMES[m]} '${String(y).slice(2)}`,
        }
      }
    }
    return Object.values(map).sort((a, b) => b.mk - a.mk)
  }, [activeRows, activeSubTab])

  // Text label representing currently selected months
  const scopeLabel = useMemo(() => {
    if (!selectedMonths.size) return 'All months'
    return [...selectedMonths]
      .sort((a, b) => b - a)
      .map(mk => {
        const y = Math.floor(mk / 12)
        const m = mk % 12
        return `${MONTH_NAMES[m]} '${String(y).slice(2)}`
      })
      .join(', ')
  }, [selectedMonths])

  // Filter raw rows by selected months
  const periodRows = useMemo(() => {
    if (!selectedMonths.size) return activeRows
    return activeRows.filter(r => {
      const mk = extractRowMonthKey(r, activeSubTab)
      return mk !== null && selectedMonths.has(mk)
    })
  }, [activeRows, activeSubTab, selectedMonths])

  // ==========================================
  // 1. ADS - OVERALL (Computed from 3 Raw Sheets)
  // ==========================================
  const adsData = useMemo(() => {
    if (activeSubTab !== 'ads') return { stats: [], platformSummary: [], chartData: [], filteredCampaigns: [], columns: [] }

    // Filter by platform sub-filter
    const platformFiltered = adsPlatformFilter === 'All'
      ? periodRows
      : periodRows.filter(r => r.platform === adsPlatformFilter)

    // Filter by search query
    const q = debouncedSearch.toLowerCase().trim()
    const searchFiltered = q
      ? platformFiltered.filter(r =>
          r.campaignName.toLowerCase().includes(q) ||
          r.platform.toLowerCase().includes(q) ||
          r.month.toLowerCase().includes(q)
        )
      : platformFiltered

    // Overall Totals
    const totalSpend = Math.round(platformFiltered.reduce((s, r) => s + r.spend, 0))
    const totalGMV = Math.round(platformFiltered.reduce((s, r) => s + r.gmv, 0))
    const totalImpressions = platformFiltered.reduce((s, r) => s + r.impressions, 0)
    const totalClicks = platformFiltered.reduce((s, r) => s + r.clicks, 0)
    const totalConversions = platformFiltered.reduce((s, r) => s + r.conversions, 0)
    const overallROAS = totalSpend > 0 ? (totalGMV / totalSpend).toFixed(2) : '0.00'
    const overallCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) + '%' : '—'

    const stats = [
      { label: 'Total Ad Spend', icon: '💰', color: '#ef4444', value: '₹' + totalSpend.toLocaleString() },
      { label: 'Total Ad Sales (GMV)', icon: '📈', color: '#22c55e', value: '₹' + totalGMV.toLocaleString() },
      { label: 'Overall ROAS', icon: '🎯', color: '#3b82f6', value: `${overallROAS}x` },
      { label: 'Impressions', icon: '👁️', color: '#a855f7', value: totalImpressions > 0 ? totalImpressions.toLocaleString() : '—' },
      { label: 'Clicks (CTR)', icon: '👆', color: '#eab308', value: `${totalClicks.toLocaleString()} (${overallCTR})` },
      { label: 'Conversions', icon: '🛒', color: '#06b6d4', value: totalConversions > 0 ? totalConversions.toLocaleString() : '—' },
    ]

    // Platform Breakdown Summary
    const platformSummary = ADS_SHEETS.map(cfg => {
      const pRows = periodRows.filter(r => r.platform === cfg.platform)
      const spend = Math.round(pRows.reduce((s, r) => s + r.spend, 0))
      const gmv = Math.round(pRows.reduce((s, r) => s + r.gmv, 0))
      const clicks = pRows.reduce((s, r) => s + r.clicks, 0)
      const imp = pRows.reduce((s, r) => s + r.impressions, 0)
      const conv = pRows.reduce((s, r) => s + r.conversions, 0)
      const roas = spend > 0 ? (gmv / spend).toFixed(2) : '0.00'
      return {
        ...cfg,
        campaignsCount: pRows.length,
        spend,
        gmv,
        clicks,
        imp,
        conv,
        roas
      }
    })

    // Monthly Spend & GMV Chart Data
    const monthMap = {}
    periodRows.forEach(r => {
      if (r.monthKey !== null) {
        const mk = r.monthKey
        if (!monthMap[mk]) {
          const y = Math.floor(mk / 12)
          const m = mk % 12
          monthMap[mk] = {
            mk,
            month: `${MONTH_NAMES[m]} '${String(y).slice(2)}`,
            'Instamart Spend': 0,
            'Blinkit Spend': 0,
            'Amazon Vendor Spend': 0,
            'Total GMV': 0,
          }
        }
        if (r.platform === 'Instamart') monthMap[mk]['Instamart Spend'] += r.spend
        else if (r.platform === 'Blinkit') monthMap[mk]['Blinkit Spend'] += r.spend
        else if (r.platform === 'Amazon Vendor') monthMap[mk]['Amazon Vendor Spend'] += r.spend
        monthMap[mk]['Total GMV'] += r.gmv
      }
    })

    const chartData = Object.values(monthMap)
      .sort((a, b) => a.mk - b.mk)
      .map(item => ({
        ...item,
        'Instamart Spend': Math.round(item['Instamart Spend']),
        'Blinkit Spend': Math.round(item['Blinkit Spend']),
        'Amazon Vendor Spend': Math.round(item['Amazon Vendor Spend']),
        'Total GMV': Math.round(item['Total GMV']),
      }))

    // Campaigns Table Columns
    const columns = [
      {
        key: 'platform',
        label: 'Platform',
        align: 'left',
        render: r => {
          const cfg = ADS_SHEETS.find(s => s.platform === r.platform) || { color: '#38bdf8', icon: '📢' }
          return (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              background: `${cfg.color}20`,
              color: cfg.color,
              border: `1px solid ${cfg.color}40`
            }}>
              <span>{cfg.icon}</span>
              <span>{r.platform}</span>
            </span>
          )
        }
      },
      {
        key: 'campaignName',
        label: 'Campaign Name',
        align: 'left',
        render: r => (
          <span style={{ maxWidth: 260, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={r.campaignName}>
            {r.campaignName}
          </span>
        )
      },
      { key: 'startDate', label: 'Start Date', align: 'left', accessor: r => r.startDate || '—' },
      { key: 'month', label: 'Month', align: 'left', accessor: r => r.month || '—' },
      { key: 'spend', label: 'Spend', align: 'right', accessor: r => r.spend, render: r => '₹' + Math.round(r.spend).toLocaleString() },
      { key: 'gmv', label: 'Ad Sales / GMV', align: 'right', accessor: r => r.gmv, render: r => '₹' + Math.round(r.gmv).toLocaleString() },
      {
        key: 'roas',
        label: 'ROAS',
        align: 'right',
        accessor: r => r.roas,
        render: r => {
          const val = Number(r.roas) || 0
          const color = val >= 2.0 ? '#22c55e' : val >= 1.0 ? '#eab308' : '#ef4444'
          return <span style={{ color, fontWeight: 700 }}>{val.toFixed(2)}x</span>
        }
      },
      { key: 'impressions', label: 'Impressions', align: 'right', accessor: r => r.impressions, render: r => r.impressions ? r.impressions.toLocaleString() : '—' },
      { key: 'clicks', label: 'Clicks', align: 'right', accessor: r => r.clicks, render: r => r.clicks ? r.clicks.toLocaleString() : '—' },
      { key: 'conversions', label: 'Conversions', align: 'right', accessor: r => r.conversions, render: r => r.conversions ? r.conversions.toLocaleString() : '—' },
    ]

    return { stats, platformSummary, chartData, filteredCampaigns: searchFiltered, columns }
  }, [activeSubTab, periodRows, adsPlatformFilter, debouncedSearch])

  // ==========================================
  // 2. RAW - AMAZON SALES
  // ==========================================
  const amazonData = useMemo(() => {
    if (activeSubTab !== 'amazon') return { stats: [], filtered: [], columns: [] }
    const q = debouncedSearch.toLowerCase().trim()
    const filtered = q
      ? periodRows.filter(r =>
          (r['itemName'] && r['itemName'].toLowerCase().includes(q)) ||
          (r['asin'] && r['asin'].toLowerCase().includes(q)) ||
          (r['city'] && r['city'].toLowerCase().includes(q)) ||
          (r['stateName'] && r['stateName'].toLowerCase().includes(q))
        )
      : periodRows

    const totalNetSales = Math.round(periodRows.reduce((s, r) => s + num(r['netSales']), 0))
    const totalGrossSales = Math.round(periodRows.reduce((s, r) => s + num(r['grossSales']), 0))
    const totalNetUnits = periodRows.reduce((s, r) => s + num(r['netUnits']), 0)
    const totalGlanceViews = Math.round(periodRows.reduce((s, r) => s + num(r['indexedGlanceViews']), 0))
    const uniqueAsins = new Set(periodRows.map(r => r['asin']).filter(Boolean)).size

    const stats = [
      { label: 'Total Net Sales', icon: '💰', color: '#22c55e', value: '₹' + totalNetSales.toLocaleString() },
      { label: 'Gross Sales', icon: '🛒', color: '#3b82f6', value: '₹' + totalGrossSales.toLocaleString() },
      { label: 'Net Units Sold', icon: '📦', color: '#a855f7', value: totalNetUnits.toLocaleString() },
      { label: 'Glance Views', icon: '👁️', color: '#eab308', value: totalGlanceViews.toLocaleString() },
      { label: 'Unique ASINs', icon: '🏷️', color: '#06b6d4', value: uniqueAsins.toLocaleString() },
    ]

    const columns = [
      { key: 'asin', label: 'ASIN', align: 'left' },
      { key: 'itemName', label: 'Product Name', align: 'left', render: r => <span style={{ maxWidth: 280, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r['itemName']}>{r['itemName']}</span> },
      { key: 'orderDate', label: 'Order Date', align: 'left', accessor: r => `${r['orderDay'] || ''}-${r['orderMonth'] || ''}-${r['orderYear'] || ''}` },
      { key: 'netSales', label: 'Net Sales', align: 'right', accessor: r => num(r['netSales']), render: r => '₹' + num(r['netSales']).toLocaleString() },
      { key: 'netUnits', label: 'Net Units', align: 'right', accessor: r => num(r['netUnits']), render: r => num(r['netUnits']).toLocaleString() },
      { key: 'grossSales', label: 'Gross Sales', align: 'right', accessor: r => num(r['grossSales']), render: r => '₹' + num(r['grossSales']).toLocaleString() },
      { key: 'city', label: 'City', align: 'left', accessor: r => r['city'] || '—' },
      { key: 'stateName', label: 'State', align: 'left', accessor: r => r['stateName'] || '—' },
      { key: 'postalCode', label: 'Postal Code', align: 'left', accessor: r => r['postalCode'] || '—' },
    ]

    return { stats, filtered, columns }
  }, [activeSubTab, periodRows, debouncedSearch])

  // ==========================================
  // 3. RAW - INSTA SALES
  // ==========================================
  const instaData = useMemo(() => {
    if (activeSubTab !== 'insta') return { stats: [], filtered: [], columns: [] }
    const q = debouncedSearch.toLowerCase().trim()
    const filtered = q
      ? periodRows.filter(r =>
          (r['PRODUCT_NAME'] && r['PRODUCT_NAME'].toLowerCase().includes(q)) ||
          (r['CITY'] && r['CITY'].toLowerCase().includes(q)) ||
          (r['AREA_NAME'] && r['AREA_NAME'].toLowerCase().includes(q)) ||
          (r['BRAND'] && r['BRAND'].toLowerCase().includes(q))
        )
      : periodRows

    const totalGMV = Math.round(periodRows.reduce((s, r) => s + num(r['GMV']), 0))
    const totalNet = Math.round(periodRows.reduce((s, r) => s + num(r['Net']), 0))
    const totalUnits = periodRows.reduce((s, r) => s + num(r['UNITS_SOLD']), 0)
    const uniqueProducts = new Set(periodRows.map(r => r['PRODUCT_NAME']).filter(Boolean)).size
    const uniqueCities = new Set(periodRows.map(r => r['CITY']).filter(Boolean)).size

    const stats = [
      { label: 'Total GMV', icon: '💰', color: '#22c55e', value: '₹' + totalGMV.toLocaleString() },
      { label: 'Net Sales', icon: '💵', color: '#3b82f6', value: '₹' + totalNet.toLocaleString() },
      { label: 'Units Sold', icon: '📦', color: '#a855f7', value: totalUnits.toLocaleString() },
      { label: 'Unique Products', icon: '🧴', color: '#eab308', value: uniqueProducts.toLocaleString() },
      { label: 'Cities Covered', icon: '🏙️', color: '#06b6d4', value: uniqueCities.toLocaleString() },
    ]

    const columns = [
      { key: 'ORDERED_DATE', label: 'Ordered Date', align: 'left' },
      { key: 'PRODUCT_NAME', label: 'Product Name', align: 'left', render: r => <span style={{ maxWidth: 280, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r['PRODUCT_NAME']}>{r['PRODUCT_NAME']}</span> },
      { key: 'VARIANT', label: 'Variant', align: 'left', accessor: r => r['VARIANT'] || '—' },
      { key: 'CITY', label: 'City', align: 'left', accessor: r => r['CITY'] || '—' },
      { key: 'AREA_NAME', label: 'Area', align: 'left', accessor: r => r['AREA_NAME'] || '—' },
      { key: 'UNITS_SOLD', label: 'Units Sold', align: 'right', accessor: r => num(r['UNITS_SOLD']), render: r => num(r['UNITS_SOLD']).toLocaleString() },
      { key: 'BASE_MRP', label: 'MRP', align: 'right', accessor: r => num(r['BASE_MRP']), render: r => '₹' + num(r['BASE_MRP']).toLocaleString() },
      { key: 'GMV', label: 'GMV', align: 'right', accessor: r => num(r['GMV']), render: r => '₹' + num(r['GMV']).toLocaleString() },
      { key: 'Net', label: 'Net', align: 'right', accessor: r => num(r['Net']), render: r => '₹' + num(r['Net']).toLocaleString() },
    ]

    return { stats, filtered, columns }
  }, [activeSubTab, periodRows, debouncedSearch])

  // ==========================================
  // 4. RAW - PARTNER BLINKIT SALES
  // ==========================================
  const blinkitData = useMemo(() => {
    if (activeSubTab !== 'blinkit') return { stats: [], filtered: [], columns: [] }
    const q = debouncedSearch.toLowerCase().trim()
    const filtered = q
      ? periodRows.filter(r =>
          (r['item_name'] && r['item_name'].toLowerCase().includes(q)) ||
          (r['city_name'] && r['city_name'].toLowerCase().includes(q)) ||
          (r['category'] && r['category'].toLowerCase().includes(q))
        )
      : periodRows

    const totalQty = periodRows.reduce((s, r) => s + num(r['qty_sold']), 0)
    const totalMRPValue = Math.round(periodRows.reduce((s, r) => s + num(r['mrp']), 0))
    const uniqueItems = new Set(periodRows.map(r => r['item_name']).filter(Boolean)).size
    const uniqueCities = new Set(periodRows.map(r => r['city_name']).filter(Boolean)).size

    const stats = [
      { label: 'Total Qty Sold', icon: '📦', color: '#eab308', value: totalQty.toLocaleString() },
      { label: 'Total MRP Value', icon: '💰', color: '#22c55e', value: '₹' + totalMRPValue.toLocaleString() },
      { label: 'Unique Items', icon: '🏷️', color: '#3b82f6', value: uniqueItems.toLocaleString() },
      { label: 'Cities Covered', icon: '🏙️', color: '#a855f7', value: uniqueCities.toLocaleString() },
    ]

    const columns = [
      { key: 'date', label: 'Date', align: 'left' },
      { key: 'item_name', label: 'Item Name', align: 'left', render: r => <span style={{ maxWidth: 280, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r['item_name']}>{r['item_name']}</span> },
      { key: 'city_name', label: 'City', align: 'left', accessor: r => r['city_name'] || '—' },
      { key: 'category', label: 'Category', align: 'left', accessor: r => r['category'] || '—' },
      { key: 'qty_sold', label: 'Qty Sold', align: 'right', accessor: r => num(r['qty_sold']), render: r => num(r['qty_sold']).toLocaleString() },
      { key: 'mrp', label: 'MRP Value', align: 'right', accessor: r => num(r['mrp']), render: r => '₹' + num(r['mrp']).toLocaleString() },
      { key: 'Month', label: 'Month', align: 'left', accessor: r => r['Month'] || '—' },
    ]

    return { stats, filtered, columns }
  }, [activeSubTab, periodRows, debouncedSearch])

  // ==========================================
  // 5. RAW - AMAZON SELLER - OVERALL SALES
  // ==========================================
  const sellerData = useMemo(() => {
    if (activeSubTab !== 'seller') return { stats: [], filtered: [], columns: [] }
    const q = debouncedSearch.toLowerCase().trim()
    const filtered = q
      ? periodRows.filter(r =>
          (r['order id'] && r['order id'].toLowerCase().includes(q)) ||
          (r['Sku'] && r['Sku'].toLowerCase().includes(q)) ||
          (r['description'] && r['description'].toLowerCase().includes(q)) ||
          (r['order city'] && r['order city'].toLowerCase().includes(q))
        )
      : periodRows

    const totalProductSales = Math.round(periodRows.reduce((s, r) => s + num(r['product sales']), 0))
    const totalPayout = Math.round(periodRows.reduce((s, r) => s + num(r['total']), 0))
    const totalQuantity = periodRows.reduce((s, r) => s + num(r['quantity']), 0)
    const uniqueOrders = new Set(periodRows.map(r => r['order id']).filter(Boolean)).size

    const stats = [
      { label: 'Product Sales', icon: '💰', color: '#22c55e', value: '₹' + totalProductSales.toLocaleString() },
      { label: 'Net Payout (Total)', icon: '💵', color: '#3b82f6', value: '₹' + totalPayout.toLocaleString() },
      { label: 'Total Orders', icon: '📋', color: '#a855f7', value: uniqueOrders.toLocaleString() },
      { label: 'Total Quantity', icon: '📦', color: '#eab308', value: totalQuantity.toLocaleString() },
    ]

    const columns = [
      { key: 'date/time', label: 'Date / Time', align: 'left' },
      { key: 'order id', label: 'Order ID', align: 'left', render: r => <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{r['order id'] || '—'}</span> },
      { key: 'type', label: 'Type', align: 'left', render: r => <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, background: r['type'] === 'Order' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: r['type'] === 'Order' ? '#22c55e' : '#ef4444' }}>{r['type']}</span> },
      { key: 'Sku', label: 'SKU', align: 'left', accessor: r => r['Sku'] || '—' },
      { key: 'description', label: 'Description', align: 'left', render: r => <span style={{ maxWidth: 250, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r['description']}>{r['description']}</span> },
      { key: 'quantity', label: 'Qty', align: 'right', accessor: r => num(r['quantity']) },
      { key: 'product sales', label: 'Product Sales', align: 'right', accessor: r => num(r['product sales']), render: r => '₹' + num(r['product sales']).toLocaleString() },
      { key: 'selling fees', label: 'Selling Fees', align: 'right', accessor: r => num(r['selling fees']), render: r => num(r['selling fees']) ? '₹' + num(r['selling fees']).toLocaleString() : '—' },
      { key: 'total', label: 'Net Total', align: 'right', accessor: r => num(r['total']), render: r => '₹' + num(r['total']).toLocaleString() },
      { key: 'order city', label: 'City', align: 'left', accessor: r => r['order city'] || '—' },
      { key: 'fulfillment', label: 'Fulfillment', align: 'left', accessor: r => r['fulfillment'] || '—' },
    ]

    return { stats, filtered, columns }
  }, [activeSubTab, periodRows, debouncedSearch])

  return (
    <>
      <header>
        <div>
          <h1>Sales Dashboard</h1>
          <div className="date">Integrated Multi-Channel Sales &amp; Ads Analytics • {scopeLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
        marginBottom: 16,
        borderBottom: '1px solid #334155',
        paddingBottom: 12
      }}>
        {SALES_SUBTABS.map(tab => {
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
              {cache[tab.id] && (
                <span style={{
                  fontSize: 10,
                  background: isActive ? '#3b82f6' : '#334155',
                  color: '#fff',
                  padding: '1px 6px',
                  borderRadius: 10,
                  marginLeft: 4
                }}>
                  {cache[tab.id].length.toLocaleString()}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Month-wise Filter Bar */}
      {monthOptions.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 20
        }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.6, marginRight: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>📅</span> PERIOD:
          </span>
          <button
            onClick={resetMonths}
            style={{
              padding: '4px 12px',
              borderRadius: 16,
              border: '1px solid ' + (selectedMonths.size === 0 ? '#3b82f6' : '#334155'),
              background: selectedMonths.size === 0 ? 'rgba(59,130,246,0.18)' : '#1e293b',
              color: selectedMonths.size === 0 ? '#38bdf8' : '#94a3b8',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            All Months
          </button>
          {monthOptions.map(m => {
            const on = selectedMonths.has(m.mk)
            return (
              <button
                key={m.mk}
                onClick={() => toggleMonth(m.mk)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 16,
                  border: '1px solid ' + (on ? '#22c55e' : '#334155'),
                  background: on ? 'rgba(34,197,94,0.18)' : '#1e293b',
                  color: on ? '#22c55e' : '#94a3b8',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {m.label}
              </button>
            )
          })}
          {selectedMonths.size > 0 && (
            <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
              Showing {periodRows.length.toLocaleString()} of {activeRows.length.toLocaleString()} records
            </span>
          )}
        </div>
      )}

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
      {loading && !activeRows.length && (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Loading {SALES_SUBTABS.find(t => t.id === activeSubTab)?.label} data from Google Sheet...</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>This may take a moment for large datasets.</div>
        </div>
      )}

      {/* SUBTAB 1: ADS - OVERALL (From Raw-Insta- Ads, Blinkitt- Ads, Amazon vendor - Ads) */}
      {activeSubTab === 'ads' && !loading && (
        <>
          {/* Top KPI Cards */}
          <div className="stats-grid" style={{ marginTop: 0 }}>
            {adsData.stats.map(s => (
              <div className="stat-card" key={s.label}>
                <div className="stat-header">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-icon" style={{ background: `${s.color}26`, color: s.color }}>{s.icon}</div>
                </div>
                <div className="stat-value">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Platform Performance Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
            marginTop: 20
          }}>
            {adsData.platformSummary.map(p => (
              <div
                key={p.platform}
                onClick={() => setAdsPlatformFilter(adsPlatformFilter === p.platform ? 'All' : p.platform)}
                style={{
                  background: '#1e293b',
                  border: '1px solid ' + (adsPlatformFilter === p.platform ? p.color : '#334155'),
                  borderRadius: 12,
                  padding: 16,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: adsPlatformFilter === p.platform ? `0 0 12px ${p.color}33` : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: p.color }}>
                    <span>{p.icon}</span>
                    <span>{p.platform} Ads</span>
                  </div>
                  <span style={{
                    fontSize: 10,
                    background: adsPlatformFilter === p.platform ? p.color : '#334155',
                    color: adsPlatformFilter === p.platform ? '#000' : '#94a3b8',
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontWeight: 700
                  }}>
                    {p.campaignsCount} campaigns
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Spend</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>₹{p.spend.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Ad Sales / GMV</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>₹{p.gmv.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>ROAS</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8' }}>{p.roas}x</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Clicks / Orders</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
                      {p.clicks.toLocaleString()} / {p.conv ? p.conv.toLocaleString() : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Monthly Comparison Bar Chart */}
          {adsData.chartData.length > 0 && (
            <div className="chart-card" style={{ marginTop: 20 }}>
              <div className="chart-title">Monthly Platform Ads Spend vs GMV Trend</div>
              <div style={{ height: 300, marginTop: 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adsData.chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.6} />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <ReTooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                      formatter={(val, name) => ['₹' + Number(val).toLocaleString(), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                    <Bar dataKey="Instamart Spend" fill="#f97316" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Blinkit Spend" fill="#eab308" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Amazon Vendor Spend" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Total GMV" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Platform Filter & Campaigns Table */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.6 }}>PLATFORM:</span>
                {['All', 'Instamart', 'Blinkit', 'Amazon Vendor'].map(p => (
                  <button
                    key={p}
                    onClick={() => setAdsPlatformFilter(p)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 14,
                      border: '1px solid ' + (adsPlatformFilter === p ? '#3b82f6' : '#334155'),
                      background: adsPlatformFilter === p ? 'rgba(59,130,246,0.18)' : '#1e293b',
                      color: adsPlatformFilter === p ? '#38bdf8' : '#94a3b8',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="🔍 Search campaigns across platforms..."
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
              columns={adsData.columns}
              rows={adsData.filteredCampaigns}
              pageSize={15}
              filename={`ads_overall_${scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`}
              emptyMessage="No ad campaigns found matching your filter/search"
            />
          </div>
        </>
      )}

      {/* SUBTAB 2: RAW - AMAZON SALES */}
      {activeSubTab === 'amazon' && !loading && (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <input
                type="text"
                placeholder="🔍 Search by ASIN, Product, City, State..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  padding: '8px 14px',
                  fontSize: 13,
                  minWidth: 320,
                  outline: 'none'
                }}
              />
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Showing {amazonData.filtered.length.toLocaleString()} of {periodRows.length.toLocaleString()} records {selectedMonths.size > 0 && `(${scopeLabel})`}
              </div>
            </div>

            <DataTable
              columns={amazonData.columns}
              rows={amazonData.filtered}
              pageSize={15}
              filename={`raw_amazon_sales_${scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`}
              emptyMessage="No Amazon sales match your filter/search"
            />
          </div>
        </>
      )}

      {/* SUBTAB 3: RAW - INSTA SALES */}
      {activeSubTab === 'insta' && !loading && (
        <>
          <div className="stats-grid" style={{ marginTop: 0 }}>
            {instaData.stats.map(s => (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <input
                type="text"
                placeholder="🔍 Search by Product, City, Area, Brand..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  padding: '8px 14px',
                  fontSize: 13,
                  minWidth: 320,
                  outline: 'none'
                }}
              />
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Showing {instaData.filtered.length.toLocaleString()} of {periodRows.length.toLocaleString()} records {selectedMonths.size > 0 && `(${scopeLabel})`}
              </div>
            </div>

            <DataTable
              columns={instaData.columns}
              rows={instaData.filtered}
              pageSize={15}
              filename={`raw_insta_sales_${scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`}
              emptyMessage="No Instamart sales match your filter/search"
            />
          </div>
        </>
      )}

      {/* SUBTAB 4: RAW - PARTNER BLINKIT SALES */}
      {activeSubTab === 'blinkit' && !loading && (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <input
                type="text"
                placeholder="🔍 Search by Item, City, Category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  padding: '8px 14px',
                  fontSize: 13,
                  minWidth: 320,
                  outline: 'none'
                }}
              />
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Showing {blinkitData.filtered.length.toLocaleString()} of {periodRows.length.toLocaleString()} records {selectedMonths.size > 0 && `(${scopeLabel})`}
              </div>
            </div>

            <DataTable
              columns={blinkitData.columns}
              rows={blinkitData.filtered}
              pageSize={15}
              filename={`raw_partner_blinkit_sales_${scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`}
              emptyMessage="No Blinkit sales match your filter/search"
            />
          </div>
        </>
      )}

      {/* SUBTAB 5: RAW - AMAZON SELLER - OVERALL SALES */}
      {activeSubTab === 'seller' && !loading && (
        <>
          <div className="stats-grid" style={{ marginTop: 0 }}>
            {sellerData.stats.map(s => (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <input
                type="text"
                placeholder="🔍 Search by Order ID, SKU, Description, City..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  padding: '8px 14px',
                  fontSize: 13,
                  minWidth: 320,
                  outline: 'none'
                }}
              />
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Showing {sellerData.filtered.length.toLocaleString()} of {periodRows.length.toLocaleString()} records {selectedMonths.size > 0 && `(${scopeLabel})`}
              </div>
            </div>

            <DataTable
              columns={sellerData.columns}
              rows={sellerData.filtered}
              pageSize={15}
              filename={`raw_amazon_seller_sales_${scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`}
              emptyMessage="No Amazon seller transactions match your filter/search"
            />
          </div>
        </>
      )}
    </>
  )
}
