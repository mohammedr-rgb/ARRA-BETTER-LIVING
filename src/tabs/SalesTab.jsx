import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProfileSection } from '../components/ui'
import { DataTable } from '../components/DataTable'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip as ReTooltip, XAxis, YAxis,
} from 'recharts'

const SPREADSHEET_ID = '1auxWTw7MntZdYHNb8hZZqWvG3WVQ60BS5Jz2-8kYcWE'
const SHEETS = ['Overall sales', 'Ads Spend', 'Logistics']

function parseCSVGrid(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function cell(row, index) {
  return String(row?.[index] ?? '').trim()
}

function number(value) {
  if (value === null || value === undefined) return 0
  const cleaned = String(value).replace(/[₹,%\s]/g, '').replace(/,/g, '')
  if (!cleaned || cleaned === '—' || cleaned === '-') return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNumber(value) {
  const text = String(value ?? '').trim()
  if (!text || text === '—' || text === '-') return null
  return number(text)
}

function formatINR(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString('en-IN', { maximumFractionDigits: digits })
}

function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  const amount = Number(value)
  return (amount > 0 ? '+' : '') + amount.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + '%'
}

function findIndex(headers, label) {
  return headers.findIndex(header => header.toLowerCase() === label.toLowerCase())
}

function SectionCard({ title, subtitle, children, id }) {
  return (
    <section id={id} className="recent-orders" style={{ marginTop: 20 }}>
      <div className="orders-header" style={{ display: 'block' }}>
        <div className="orders-title">{title}</div>
        {subtitle && <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{subtitle}</div>}
      </div>
      {children}
    </section>
  )
}

export default function SalesTab() {
  const [sheets, setSheets] = useState({ overall: [], ads: [], logistics: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadData = useCallback(async () => {
    setRefreshing(true)
    setError('')
    try {
      const cacheKey = Date.now()
      const responses = await Promise.all(SHEETS.map(sheet => {
        const url = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID +
          '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(sheet) + '&t=' + cacheKey
        return fetch(url, { cache: 'no-store' })
      }))
      const failed = responses.findIndex(response => !response.ok)
      if (failed >= 0) throw new Error('Could not load “' + SHEETS[failed] + '”. Check that the sheet is viewable by the dashboard.')
      const grids = await Promise.all(responses.map(async response => parseCSVGrid(await response.text())))
      const [overall, ads, logistics] = grids
      if (!overall[0]?.some(value => String(value).includes('GMV Nov MTD'))) {
        throw new Error('“Overall sales” is missing the expected platform sales summary.')
      }
      if (!ads[0]?.some(value => String(value).toLowerCase().includes('metric'))) {
        throw new Error('“Ads Spend” is missing its monthly metrics header.')
      }
      if (!logistics.some(row => cell(row, 0) === 'Month' && cell(row, 1) === 'Shipment Weight (kg)')) {
        throw new Error('“Logistics” is missing its monthly cost and shipment-weight table.')
      }
      setSheets({ overall, ads, logistics })
      setLastUpdated(new Date())
    } catch (err) {
      setError(err?.message || 'Could not load Sales data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const metrics = useMemo(() => {
    const overall = sheets.overall
    const overallHeaders = overall[0] || []
    const combined = overall.find(row => ['Combined', 'All-platform total'].includes(cell(row, 0))) || []
    const summaryRows = overall.slice(1, overall.indexOf(combined) >= 0 ? overall.indexOf(combined) + 1 : 6)
      .filter(row => cell(row, 0) && !cell(row, 0).startsWith('MoM basis') && !cell(row, 0).startsWith('Source columns'))

    const getSummaryValue = (row, label) => {
      const index = findIndex(overallHeaders, label)
      return index >= 0 ? optionalNumber(cell(row, index)) : null
    }

    const platformRows = summaryRows.map(row => ({
      platform: cell(row, 0),
      gmvSep: getSummaryValue(row, 'GMV Sep'),
      gmvOct: getSummaryValue(row, 'GMV Oct'),
      gmvOctGrowth: getSummaryValue(row, 'GMV Oct/Sep %'),
      gmvNov: getSummaryValue(row, 'GMV Nov MTD'),
      gmvNovGrowth: getSummaryValue(row, 'GMV Nov/Oct MTD %'),
      invoiceSep: getSummaryValue(row, 'Invoice Sep'),
      invoiceOct: getSummaryValue(row, 'Invoice Oct'),
      invoiceNov: getSummaryValue(row, 'Invoice Nov MTD'),
      purchaseSep: getSummaryValue(row, 'Purchase cost Sep'),
      purchaseOct: getSummaryValue(row, 'Purchase cost Oct'),
      purchaseNov: getSummaryValue(row, 'Purchase cost Nov MTD'),
      netSep: getSummaryValue(row, 'Net Sep'),
      netOct: getSummaryValue(row, 'Net Oct'),
      netNov: getSummaryValue(row, 'Net Nov MTD'),
      netNovGrowth: getSummaryValue(row, 'Net Nov/Oct MTD %'),
      isTotal: ['Combined', 'All-platform total'].includes(cell(row, 0)),
    }))
    const total = platformRows.find(row => row.isTotal) || platformRows[platformRows.length - 1] || {}
    const title = cell(overallHeaders, 0)
    const cutoff = title.match(/November MTD through ([^.]+)/i)?.[1]?.trim() || 'current source cutoff'

    const salesTrend = [
      { month: 'September', GMV: total.gmvSep ?? 0, Invoice: total.invoiceSep ?? 0, 'Purchase cost': total.purchaseSep ?? 0, 'Source net': total.netSep ?? 0 },
      { month: 'October', GMV: total.gmvOct ?? 0, Invoice: total.invoiceOct ?? 0, 'Purchase cost': total.purchaseOct ?? 0, 'Source net': total.netOct ?? 0 },
      { month: 'November MTD', GMV: total.gmvNov ?? 0, Invoice: total.invoiceNov ?? 0, 'Purchase cost': total.purchaseNov ?? 0, 'Source net': total.netNov ?? 0 },
    ]

    const adsGrid = sheets.ads
    const adsHeaders = adsGrid[0] || []
    const periods = adsHeaders.slice(2).map(value => String(value || '').trim()).filter(Boolean)
    const adRows = adsGrid.slice(1)
      .filter(row => cell(row, 0) || cell(row, 1))
      .map(row => {
        const platform = cell(row, 0)
        const metric = cell(row, 1) || (platform === 'Ads spend Overall' ? 'Total ad spend' : 'Spend')
        const isPercent = metric.includes('%')
        const values = periods.map((_, index) => optionalNumber(cell(row, index + 2)))
        return { platform, metric, isPercent, values }
      })
    const totalAds = adRows.find(row => row.platform.toLowerCase() === 'ads spend overall')
    let latestAdsIndex = -1
    if (totalAds) {
      for (let i = totalAds.values.length - 1; i >= 0; i--) {
        if (totalAds.values[i] !== null) { latestAdsIndex = i; break }
      }
    }
    const latestAdsSpend = latestAdsIndex >= 0 ? totalAds.values[latestAdsIndex] : null
    const latestAdsPeriod = latestAdsIndex >= 0 ? periods[latestAdsIndex] : 'No total reported'

    const logisticsGrid = sheets.logistics
    const monthlyHeaderIndex = logisticsGrid.findIndex(row => cell(row, 0) === 'Month' && cell(row, 1) === 'Shipment Weight (kg)')
    const logisticsRows = []
    if (monthlyHeaderIndex >= 0) {
      for (let i = monthlyHeaderIndex + 1; i < logisticsGrid.length; i++) {
        const row = logisticsGrid[i]
        const month = cell(row, 0)
        if (!month || !/^(May|June|July|August|September|October|November|December)$/i.test(month)) break
        logisticsRows.push({
          month,
          weight: optionalNumber(cell(row, 1)),
          cost: optionalNumber(cell(row, 2)),
          costGrowth: optionalNumber(cell(row, 3)),
          rate: optionalNumber(cell(row, 4)),
        })
      }
    }
    const latestLogistics = logisticsRows[logisticsRows.length - 1] || null
    const logisticsHeader = (logisticsGrid[0] || []).slice(15)
    const carrierRows = logisticsGrid.slice(1)
      .filter(row => cell(row, 20) && cell(row, 20).toUpperCase() !== 'GRAND TOTAL')
      .map(row => ({
        carrier: cell(row, 20),
        weight: optionalNumber(cell(row, 21)),
        cost: optionalNumber(cell(row, 22)),
        rate: optionalNumber(cell(row, 23)),
      }))
      .filter(row => row.weight !== null || row.cost !== null)

    const sourceRows = SHEETS.map((name, index) => ({
      source: name,
      rows: Math.max(0, [overall, adsGrid, logisticsGrid][index].length - 1),
    }))
    return {
      platformRows,
      total,
      cutoff,
      salesTrend,
      adRows,
      periods,
      latestAdsPeriod,
      latestAdsSpend,
      logisticsRows,
      latestLogistics,
      carrierRows,
      logisticsHeader,
      sourceRows,
    }
  }, [sheets])

  const platformColumns = [
    { key: 'platform', label: 'Platform / source total', align: 'left', render: row => <span style={{ fontWeight: row.isTotal ? 800 : 600, color: row.isTotal ? '#38bdf8' : '#f1f5f9' }}>{row.platform}</span> },
    { key: 'gmvOct', label: 'Oct GMV', align: 'right', accessor: row => row.gmvOct, render: row => formatINR(row.gmvOct) },
    { key: 'gmvNov', label: 'Nov MTD GMV', align: 'right', accessor: row => row.gmvNov, render: row => <span style={{ color: '#38bdf8', fontWeight: 700 }}>{formatINR(row.gmvNov)}</span> },
    { key: 'gmvNovGrowth', label: 'GMV vs Oct MTD', align: 'right', accessor: row => row.gmvNovGrowth, render: row => formatPercent(row.gmvNovGrowth) },
    { key: 'invoiceOct', label: 'Oct Invoice', align: 'right', accessor: row => row.invoiceOct, render: row => formatINR(row.invoiceOct) },
    { key: 'invoiceNov', label: 'Nov MTD Invoice', align: 'right', accessor: row => row.invoiceNov, render: row => formatINR(row.invoiceNov) },
    { key: 'purchaseNov', label: 'Nov MTD Purchase Cost', align: 'right', accessor: row => row.purchaseNov, render: row => formatINR(row.purchaseNov) },
    { key: 'netNov', label: 'Nov MTD Net (source)', align: 'right', accessor: row => row.netNov, render: row => formatINR(row.netNov) },
    { key: 'netNovGrowth', label: 'Net vs Oct MTD', align: 'right', accessor: row => row.netNovGrowth, render: row => formatPercent(row.netNovGrowth) },
  ]

  const adColumns = [
    { key: 'platform', label: 'Channel', align: 'left' },
    { key: 'metric', label: 'Measure', align: 'left' },
    ...metrics.periods.map((period, index) => ({
      key: 'period-' + index,
      label: period,
      align: 'right',
      accessor: row => row.values[index],
      render: row => row.values[index] === null ? '—' : row.isPercent ? formatPercent(row.values[index]) : formatINR(row.values[index]),
    })),
  ]

  const logisticsColumns = [
    { key: 'month', label: 'Month', align: 'left' },
    { key: 'weight', label: 'Shipment Weight (kg)', align: 'right', accessor: row => row.weight, render: row => formatNumber(row.weight) },
    { key: 'cost', label: 'Logistics Cost incl. GST', align: 'right', accessor: row => row.cost, render: row => formatINR(row.cost) },
    { key: 'costGrowth', label: 'Cost change vs prior month', align: 'right', accessor: row => row.costGrowth, render: row => formatPercent(row.costGrowth) },
    { key: 'rate', label: 'Average ₹/kg', align: 'right', accessor: row => row.rate, render: row => row.rate === null ? '—' : '₹' + formatNumber(row.rate) },
  ]

  const carrierColumns = [
    { key: 'carrier', label: 'Carrier', align: 'left' },
    { key: 'weight', label: 'Weight (kg)', align: 'right', accessor: row => row.weight, render: row => formatNumber(row.weight) },
    { key: 'cost', label: 'Cost incl. GST', align: 'right', accessor: row => row.cost, render: row => formatINR(row.cost) },
    { key: 'rate', label: 'Average ₹/kg', align: 'right', accessor: row => row.rate, render: row => row.rate === null ? '—' : '₹' + formatNumber(row.rate) },
  ]

  const latestStats = [
    { label: 'Latest MTD GMV', value: formatINR(metrics.total.gmvNov), sub: 'November MTD through ' + metrics.cutoff, color: '#38bdf8', icon: '🛒' },
    { label: 'Latest MTD Invoice', value: formatINR(metrics.total.invoiceNov), sub: 'Source-reported invoice amount', color: '#22c55e', icon: '🧾' },
    { label: 'Latest MTD Purchase Cost', value: formatINR(metrics.total.purchaseNov), sub: 'Source-reported purchase cost', color: '#f59e0b', icon: '📦' },
    { label: 'Latest MTD Net (source)', value: formatINR(metrics.total.netNov), sub: 'Source metric; not recalculated', color: '#a78bfa', icon: '📈' },
    { label: 'Latest Ads Spend', value: formatINR(metrics.latestAdsSpend), sub: metrics.latestAdsPeriod + ' · last period with a total', color: '#fb7185', icon: '📢' },
    { label: 'Latest Logistics Cost', value: formatINR(metrics.latestLogistics?.cost), sub: metrics.latestLogistics ? metrics.latestLogistics.month + ' · ' + formatNumber(metrics.latestLogistics.weight) + ' kg at ₹' + formatNumber(metrics.latestLogistics.rate) + '/kg' : 'No monthly data', color: '#14b8a6', icon: '🚚' },
  ]

  const adTrend = useMemo(() => {
    const totalRow = metrics.adRows.find(row => row.platform.toLowerCase() === 'ads spend overall')
    if (!totalRow) return []
    return metrics.periods.map((period, index) => ({
      period,
      spend: totalRow.values[index],
    })).filter(row => row.spend !== null)
  }, [metrics.adRows, metrics.periods])

  return (
    <>
      <header>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>📈</span>
            <h1 style={{ margin: 0 }}>Sales &amp; Channel Performance</h1>
          </div>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            Live view from Overall sales, Ads Spend, and Logistics
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={loadData} disabled={refreshing} style={{ padding: '7px 12px', borderRadius: 7, background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', cursor: refreshing ? 'wait' : 'pointer' }}>
            ↻ {refreshing ? 'Refreshing…' : 'Refresh Sales Data'}
          </button>
          <ProfileSection userEmail="mohammed.r@gemedible.com" />
        </div>
      </header>

      {loading && <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Loading the three sales source sheets…</div>}
      {error && <div style={{ padding: 14, borderRadius: 8, marginBottom: 16, color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>{error}</div>}

      {!loading && !error && (
        <>
          <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 18px' }}>
            {[
              ['#sales-overview', 'Overview'],
              ['#platform-sales', 'Platform Sales'],
              ['#ads-spend', 'Ads Spend'],
              ['#logistics', 'Logistics'],
            ].map(([href, label]) => <a key={href} href={href} style={{ textDecoration: 'none', color: '#cbd5e1', background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>{label}</a>)}
          </nav>

          <div id="sales-overview" className="stats-grid" style={{ marginTop: 0 }}>
            {latestStats.map(stat => (
              <div key={stat.label} className="stat-card">
                <div className="stat-header">
                  <div className="stat-label">{stat.label}</div>
                  <div className="stat-icon" style={{ background: stat.color + '26', color: stat.color }}>{stat.icon}</div>
                </div>
                <div className="stat-value" style={{ fontSize: 20 }}>{stat.value}</div>
                <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 5 }}>{stat.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
            The sheets use different reporting cutoffs: sales is November MTD, Ads Spend shows the latest period with a total, and Logistics is current through {metrics.latestLogistics?.month || 'its latest listed month'}. Blank source cells remain blank in the tables. The “Combined” sales row and “Net” values are shown as reported by the sheet, without recomputing or forcing channel lines to reconcile.
          </div>

          <SectionCard title="📊 Sales trend" subtitle="Combined row as reported in Overall sales. November is month-to-date.">
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={metrics.salesTrend} margin={{ top: 12, right: 18, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" tickFormatter={value => '₹' + (value / 100000).toFixed(0) + 'L'} />
                  <ReTooltip formatter={value => formatINR(value)} contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="GMV" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Invoice" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Purchase cost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Source net" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard
            id="platform-sales"
            title="🛍️ Platform sales comparison"
            subtitle="October full month and November MTD, with September shown as the growth comparison base. Values and growth rates follow Overall sales."
          >
            <DataTable columns={platformColumns} rows={metrics.platformRows} pageSize={10} filename="sales_platform_comparison.csv" emptyMessage="No platform totals found" />
          </SectionCard>

          <SectionCard
            id="ads-spend"
            title="📢 Advertising spend & efficiency"
            subtitle="Channel spend, sales/GMV basis, and ad-to-sales percentages from Ads Spend. Missing cells are shown as — and are not treated as zero."
          >
            {adTrend.length > 0 && (
              <div style={{ width: '100%', height: 270, marginBottom: 14 }}>
                <ResponsiveContainer>
                  <LineChart data={adTrend} margin={{ top: 10, right: 20, left: 5, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="period" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" tickFormatter={value => '₹' + (value / 100000).toFixed(1) + 'L'} />
                    <ReTooltip formatter={value => formatINR(value)} contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="spend" name="Total ad spend" stroke="#fb7185" strokeWidth={3} dot={{ r: 4 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <DataTable columns={adColumns} rows={metrics.adRows} pageSize={20} filename="sales_ads_spend_efficiency.csv" emptyMessage="No ad spend rows found" />
          </SectionCard>

          <SectionCard
            id="logistics"
            title="🚚 Logistics cost & shipment weight"
            subtitle="Monthly logistics cost, weight, average cost per kg, and source-provided cost movement from Logistics."
          >
            <DataTable columns={logisticsColumns} rows={metrics.logisticsRows} pageSize={10} filename="sales_logistics_monthly.csv" emptyMessage="No monthly logistics rows found" />
            {metrics.carrierRows.length > 0 && (
              <>
                <div style={{ margin: '16px 0 8px', fontWeight: 700, color: '#f1f5f9' }}>Carrier summary (as reported)</div>
                <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>
                  Coverage: {metrics.logisticsHeader[0] || 'source period shown in Logistics'}; use the source totals as provided.
                </div>
                <DataTable columns={carrierColumns} rows={metrics.carrierRows} pageSize={10} filename="sales_logistics_by_carrier.csv" emptyMessage="No carrier summary found" />
              </>
            )}
          </SectionCard>

          <SectionCard title="🔄 Source sheets" subtitle="Each section above reads only from these three tabs.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {metrics.sourceRows.map(source => (
                <div key={source.source} style={{ padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#cbd5e1', fontSize: 12 }}>
                  {source.source} <span style={{ color: '#64748b' }}>· {source.rows} data rows</span>
                </div>
              ))}
              <a href={'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit'} target="_blank" rel="noreferrer" style={{ padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#38bdf8', fontSize: 12, textDecoration: 'none' }}>Open connected workbook ↗</a>
            </div>
          </SectionCard>
        </>
      )}

      {lastUpdated && <div style={{ textAlign: 'right', color: '#64748b', fontSize: 11, marginTop: 16 }}>Sheets refreshed {lastUpdated.toLocaleString()}</div>}
    </>
  )
}
