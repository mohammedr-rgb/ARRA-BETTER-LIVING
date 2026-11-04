import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProfileSection } from '../components/ui'
import { DataTable } from '../components/DataTable'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip as ReTooltip, XAxis, YAxis,
} from 'recharts'

const SPREADSHEET_ID = '1auxWTw7MntZdYHNb8hZZqWvG3WVQ60BS5Jz2-8kYcWE'
const SHEETS = ['Overall sales', 'Ads Spend', 'Logistics']
const EMPTY_METRICS = {
  platformRows: [], total: {}, cutoff: '', salesTrend: [], adRows: [], periods: [],
  latestAdsPeriod: 'No total reported', latestAdsSpend: null,
  logisticsRows: [], latestLogistics: null, carrierRows: [], logisticsHeader: [], sourceRows: [],
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

function fetchFilteredMetrics(endpoint) {
  return new Promise((resolve, reject) => {
    const callbackName = '__salesMetricsCb_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    const script = document.createElement('script')
    let finished = false
    const cleanup = () => {
      if (finished) return
      finished = true
      delete window[callbackName]
      script.remove()
      clearTimeout(timeout)
    }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('The private Sales connection timed out. Check the Apps Script deployment and try again.'))
    }, 30000)

    window[callbackName] = payload => {
      cleanup()
      if (payload?.error) reject(new Error(payload.error))
      else if (payload?.schemaVersion !== 1) reject(new Error('The filtered Sales connection returned an unsupported response.'))
      else resolve(payload)
    }
    script.onerror = () => {
      cleanup()
      reject(new Error('Could not reach the filtered Sales connection. Check its deployed URL and access setting.'))
    }
    const url = new URL(endpoint)
    url.searchParams.set('callback', callbackName)
    url.searchParams.set('t', String(Date.now()))
    script.src = url.toString()
    script.async = true
    document.head.appendChild(script)
  })
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
  const [metrics, setMetrics] = useState(EMPTY_METRICS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadData = useCallback(async () => {
    setRefreshing(true)
    setError('')
    try {
      const endpoint = import.meta.env.VITE_SALES_METRICS_URL
      if (!endpoint) {
        throw new Error('Private Sales connection is not configured yet. Deploy the filtered Apps Script and add its URL as the VITE_SALES_METRICS_URL GitHub Actions variable.')
      }
      if (!endpoint.startsWith('https://script.google.com/macros/s/') || !endpoint.endsWith('/exec')) {
        throw new Error('The filtered Sales connection URL must be the deployed Google Apps Script URL ending in /exec.')
      }
      const filtered = await fetchFilteredMetrics(endpoint)
      if (!Array.isArray(filtered.platformRows) || !Array.isArray(filtered.adRows) || !Array.isArray(filtered.logisticsRows)) {
        throw new Error('The filtered Sales connection is missing required summary data.')
      }
      setMetrics(filtered)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err?.message || 'Could not load Sales data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

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
