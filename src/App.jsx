import { useState, useEffect, useMemo, useCallback } from 'react'
import { num, parseCSV, parseMMDDDate, uniqueByPO, sumPOField, sumField, loadCSVFromFile } from './lib/utils'
import { UserContext } from './lib/userContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DashboardSkeleton } from './components/ui'
import { getAuthToken, forceReauth } from './lib/auth'
import { toast } from './lib/toast'
import DashboardTab from './tabs/DashboardTab'
import OrdersTab from './tabs/OrdersTab'
import InventoryTab from './tabs/InventoryTab'
import StockTab from './tabs/StockTab'
import LogisticsTab from './tabs/LogisticsTab'
import DispatchTab from './tabs/DispatchTab'
import ReportsTab from './tabs/ReportsTab'
import FinanceTab from './tabs/FinanceTab'
import PerformanceTab from './tabs/PerformanceTab'
import SettingsTab from './tabs/SettingsTab'
import SalesTab from './tabs/SalesTab'
import { PODetailsPage } from './components/PODetailsPage'
import { AuthGate, UserBadge } from './components/AuthGate'
import { CommandPalette } from './components/CommandPalette'
import aaraLogo from './assets/aara_logo.png'

const API_URL = 'https://script.google.com/macros/s/AKfycbyTPATdTTq6ZOUHDyG37foHyVZgTfIfCBxjTSxs3vbbECkeAHUTTUrrOttSpKKCOVqMjA/exec'
const FALLBACK_SHEET_URL = 'https://docs.google.com/spreadsheets/d/14riCGmsLkuomzSETNSITLulbWyl7hono2U4NMRowpdI/export?format=csv&gid=1664329820'

const STORAGE_KEY_CSV = 'arra_cached_raw_csv_v2'
const STORAGE_KEY_TIME = 'arra_cached_time_v2'

function Dashboard({ authUser, onLogout }) {
  const [data, setData] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_CSV)
      if (cached) {
        const parsed = parseCSV(cached)
        if (parsed.length > 0) return parsed
      }
    } catch {
      // ignore
    }
    return []
  })
  const [rawCSV, setRawCSV] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_CSV) || '' } catch { return '' }
  })
  const [loading, setLoading] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_CSV)
      return !cached
    } catch { return true }
  })
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(() => {
    try {
      const t = localStorage.getItem(STORAGE_KEY_TIME)
      return t ? new Date(t) : null
    } catch { return null }
  })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [dataSource, setDataSource] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_CSV) ? 'cached' : null
    } catch { return null }
  })
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('tab') || 'dashboard'
  })
  const [userEmail, setUserEmail] = useState('mohammed.r@gemedible.com')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [globalPlatform, setGlobalPlatform] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('platform') || 'All'
  })
  const [viewPO, setViewPO] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('po') || null
  })
  const [autoRefresh, setAutoRefresh] = useState(0) // 0 = off, 5/15/30 = minutes
  const [cmdOpen, setCmdOpen] = useState(false)

  // URL deep linking
  const updateURL = useCallback((newTab, newPlatform) => {
    const params = new URLSearchParams(window.location.search)
    params.set('tab', newTab)
    if (newPlatform && newPlatform !== 'All') params.set('platform', newPlatform)
    else params.delete('platform')
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }, [])

  const handleTabChange = useCallback((newTab) => {
    setTab(newTab)
    updateURL(newTab, globalPlatform)
  }, [globalPlatform, updateURL])

  const handlePlatformChange = useCallback((newPlatform) => {
    setGlobalPlatform(newPlatform)
    updateURL(tab, newPlatform)
  }, [tab, updateURL])

  const openPO = useCallback((row) => {
    if (row && row['PO Number']) setViewPO(row['PO Number'])
  }, [])

  const openPOInNewTab = useCallback((po) => {
    if (!po) return
    const params = new URLSearchParams(window.location.search)
    params.set('tab', tab)
    params.set('po', po)
    window.open(`${window.location.pathname}?${params.toString()}`, '_blank', 'noopener')
  }, [tab])

  const closePO = useCallback(() => {
    setViewPO(null)
    const params = new URLSearchParams(window.location.search)
    params.delete('po')
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
  }, [])

  const persistData = useCallback((csvText, parsed, source) => {
    setRawCSV(csvText)
    setData(parsed)
    const now = new Date()
    setLastUpdated(now)
    setDataSource(source)
    setError(null)
    setLoading(false)
    setIsRefreshing(false)
    try {
      localStorage.setItem(STORAGE_KEY_CSV, csvText)
      localStorage.setItem(STORAGE_KEY_TIME, now.toISOString())
    } catch (e) {
      console.warn('LocalStorage save error', e)
    }
  }, [])

  const loadData = useCallback(async (isManual = false) => {
    setIsRefreshing(true)
    if (!data.length) setError(null)

    const token = getAuthToken() || ''
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s timeout for Apps Script

    let success = false
    let lastErrMsg = ''

    // Tier 1: Try Apps Script API
    if (API_URL) {
      try {
        const res = await fetch(`${API_URL}?token=${encodeURIComponent(token)}`, {
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        if (res.ok) {
          const text = await res.text()
          if (/^__ERROR_(401|403)__/.test(text)) {
            lastErrMsg = 'Session expired — re-authentication required.'
          } else if (text.startsWith('__ERROR_')) {
            lastErrMsg = text.split('\n').slice(1).join('\n') || 'Backend error'
          } else if (text.trim().toLowerCase().startsWith('<!doctype')) {
            lastErrMsg = 'Google Apps Script sign-in required.'
          } else if (!text.trim().startsWith('{')) {
            const parsed = parseCSV(text)
            if (parsed.length > 0) {
              persistData(text, parsed, 'backend')
              success = true
              if (isManual) toast(`Data refreshed (${parsed.length} rows)`, 'success')
              return
            }
          }
        } else {
          lastErrMsg = `HTTP ${res.status} ${res.statusText}`
        }
      } catch (err) {
        clearTimeout(timeoutId)
        lastErrMsg = err.name === 'AbortError' ? 'Request timed out' : (err.message || 'Network error')
      }
    }

    // Tier 2: Try Direct Sheet Fallbacks
    const fallbackUrls = [
      'https://docs.google.com/spreadsheets/d/14riCGmsLkuomzSETNSITLulbWyl7hono2U4NMRowpdI/gviz/tq?tqx=out:csv&gid=1664329820',
      FALLBACK_SHEET_URL
    ]

    for (const url of fallbackUrls) {
      if (success) break
      try {
        const fbRes = await fetch(url)
        if (fbRes.ok) {
          const fbText = await fbRes.text()
          if (!fbText.trim().toLowerCase().startsWith('<!doctype')) {
            const fbParsed = parseCSV(fbText)
            if (fbParsed.length > 0) {
              persistData(fbText, fbParsed, 'fallback')
              success = true
              if (isManual) toast(`Loaded from direct sheet (${fbParsed.length} rows)`, 'warn')
              return
            }
          }
        }
      } catch {
        // Continue to next fallback
      }
    }

    // Tier 3: Check Local Storage Cache
    setIsRefreshing(false)
    setLoading(false)

    try {
      const cached = localStorage.getItem(STORAGE_KEY_CSV)
      if (cached) {
        const parsed = parseCSV(cached)
        if (parsed.length > 0) {
          if (!data.length) {
            setRawCSV(cached)
            setData(parsed)
            setDataSource('cached')
            const t = localStorage.getItem(STORAGE_KEY_TIME)
            if (t) setLastUpdated(new Date(t))
          }
          setError(null)
          if (isManual) toast(`Live fetch failed (${lastErrMsg || 'network'}). Showing cached data.`, 'warn')
          return
        }
      }
    } catch {
      // ignore
    }

    // If completely empty and failed
    if (!data.length) {
      setError(lastErrMsg || 'Orders dataset is currently unavailable.')
      if (isManual) toast('Failed to load data', 'error')
    }
  }, [data.length, persistData])

  useEffect(() => {
    loadData(false)
  }, [loadData])

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh === 0) return
    const interval = setInterval(() => {
      loadData(false)
    }, autoRefresh * 60 * 1000)
    return () => clearInterval(interval)
  }, [autoRefresh, loadData])

  // Command palette shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const platforms = useMemo(() => {
    const set = new Set()
    data.forEach(r => { if (r['Platform']) set.add(r['Platform']) })
    return ['All', ...Array.from(set).sort()]
  }, [data])

  const filteredData = useMemo(() => {
    if (globalPlatform === 'All') return data
    return data.filter(r => r['Platform'] === globalPlatform)
  }, [data, globalPlatform])

  const metrics = useMemo(() => {
    const poData = uniqueByPO(filteredData)
    const totalOrders = poData.length
    const totalTonnage = Math.round(sumField(filteredData, 'Tonnage'))
    const totalBoxes = Math.round(sumField(filteredData, 'Box Count'))
    const totalValue = Math.round(sumPOField(filteredData, 'PO Value with Tax'))

    const statusCounts = {}
    poData.forEach(r => {
      const s = r['Status'] || 'Unknown'
      statusCounts[s] = (statusCounts[s] || 0) + 1
    })

    const delivered = filteredData.filter(r => r['Status'] === 'Delivered')
    const deliveredTonnage = Math.round(sumField(delivered, 'Tonnage'))

    const cities = [...new Set(poData.map(r => r['City']).filter(Boolean))]

    const deliveredCount = poData.filter(r => r['Status'] === 'Delivered').length
    const rtoCount = poData.filter(r => r['Status'] === 'RTO').length
    const fillByPO = {}
    for (const r of filteredData) {
      if (r['Status'] !== 'Delivered') continue
      const po = r['PO Number']
      if (!po) continue
      if (!fillByPO[po]) fillByPO[po] = { qty: 0, rejected: 0 }
      fillByPO[po].qty += num(r['PO Qty'])
      fillByPO[po].rejected += num(r['Rejected Qty'])
    }
    const totalPOQty = Object.values(fillByPO).reduce((s, v) => s + v.qty, 0)
    const totalRejectedQty = Object.values(fillByPO).reduce((s, v) => s + v.rejected, 0)
    const avgFillRate = totalPOQty ? Math.round((totalPOQty - totalRejectedQty) / totalPOQty * 100) : 0

    return {
      totalOrders,
      totalTonnage,
      totalBoxes,
      totalValue,
      deliveredOrders: deliveredCount,
      rtoOrders: rtoCount,
      deliveredTonnage,
      statusCounts,
      cities: cities.length,
      avgFillRate: Math.round(avgFillRate),
    }
  }, [filteredData])

  const recentOrders = useMemo(() => {
    const seen = new Set()
    return filteredData
      .map(r => ({ r, released: parseMMDDDate(r['PO Released Date(MM-DD-YYYY)']) }))
      .filter(x => x.released && !seen.has(x.r['PO Number']))
      .sort((a, b) => b.released - a.released)
      .slice(0, 10)
      .map(x => x.r)
  }, [filteredData])

  const renderOrderDataTab = (renderFn) => {
    if (loading && !data.length) {
      return (
        <div style={{ padding: 24 }}>
          <DashboardSkeleton />
        </div>
      )
    }
    if (error && !data.length) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Orders Data Unavailable</div>
          <div style={{ color: '#ef4444', fontSize: 14, marginBottom: 24, maxWidth: 520, background: 'rgba(239, 68, 68, 0.1)', padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            {error}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 480 }}>
            <button onClick={() => loadData(true)} style={{ background: '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              ↻ Retry Live Fetch
            </button>
            <button onClick={onLogout} style={{ background: '#475569', border: 'none', borderRadius: 8, color: '#fff', padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              🔑 Sign In Again
            </button>
            <button onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv';
              input.onchange = async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const parsed = await loadCSVFromFile(file);
                  const text = await file.text();
                  persistData(text, parsed, 'upload');
                  toast(`Loaded ${parsed.length} rows from ${file.name}`, 'success');
                } catch (err) {
                  toast(`Failed to parse CSV: ${err?.message || 'invalid format'}`, 'error');
                }
              };
              input.click();
            }} style={{ background: '#059669', border: 'none', borderRadius: 8, color: '#fff', padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              📂 Load CSV File
            </button>
          </div>
        </div>
      )
    }
    if (!data.length) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <div style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>No data available</div>
          <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24, maxWidth: 460 }}>The source sheet returned no rows or is currently inaccessible. Try refreshing or upload a CSV file.</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => loadData(true)} style={{ background: '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              ↻ Refresh Data
            </button>
            <button onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv';
              input.onchange = async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const parsed = await loadCSVFromFile(file);
                  const text = await file.text();
                  persistData(text, parsed, 'upload');
                  toast(`Loaded ${parsed.length} rows from ${file.name}`, 'success');
                } catch (err) {
                  toast(`Failed to parse CSV: ${err?.message || 'invalid format'}`, 'error');
                }
              };
              input.click();
            }} style={{ background: '#059669', border: 'none', borderRadius: 8, color: '#fff', padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              📂 Load CSV File
            </button>
          </div>
        </div>
      )
    }
    return renderFn()
  }

  const closeNav = () => setMobileMenu(false)
  const navItem = (key, icon, label) => (
    <a href="#" className={tab === key ? 'active' : ''} onClick={e => { e.preventDefault(); handleTabChange(key); closeNav() }}>
      <span className="icon">{icon}</span> {label}
    </a>
  )

  return (
    <>
      <div className={`mobile-overlay ${mobileMenu ? 'visible' : ''}`} onClick={closeNav} />
      <button className="menu-toggle" onClick={() => setMobileMenu(v => !v)}>☰</button>
      <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <button className="menu-close" onClick={closeNav}>✕</button>
        <div className="logo brand-logo-banner">
          <img src={aaraLogo} alt="AARA Better Living" className="brand-logo-banner-img" />
        </div>
        <div style={{ padding: '8px 16px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <UserBadge user={authUser} logout={onLogout} />
          </div>
        </div>
        <div style={{ padding: '8px 16px 4px' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Platform Filter</div>
          <select value={globalPlatform} onChange={e => handlePlatformChange(e.target.value)} style={{ width: '100%', background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#f1f5f9', padding: '8px 10px', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <nav>
          {navItem('dashboard', '📈', 'Dashboard')}
          {navItem('orders', '📦', 'Orders')}
          {navItem('sales', '📊', 'Sales')}
          {navItem('inventory', '🏭', 'Inventory')}
          {navItem('stock', '🗃️', 'Stock')}
          {navItem('logistics', '🚚', 'Logistics')}
          {navItem('dispatch', '📤', 'Dispatch')}
          {navItem('reports', '📋', 'Reports')}
          {navItem('finance', '💰', 'Finance')}
          {navItem('performance', '🔬', 'Performance')}
          {navItem('settings', '⚙️', 'Settings')}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #334155' }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>AUTO-REFRESH</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 5, 15, 30].map(min => (
                <button
                  key={min}
                  onClick={() => setAutoRefresh(min)}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    background: autoRefresh === min ? 'rgba(59,130,246,0.2)' : 'transparent',
                    border: '1px solid ' + (autoRefresh === min ? '#3b82f6' : '#334155'),
                    borderRadius: 4,
                    color: autoRefresh === min ? '#3b82f6' : '#64748b',
                    fontSize: 10,
                    cursor: 'pointer'
                  }}
                >
                  {min === 0 ? 'Off' : `${min}m`}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => {
            const blob = new Blob([rawCSV], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = 'full_dataset.csv'; a.click()
            URL.revokeObjectURL(url)
            toast('Downloaded full dataset CSV', 'success')
          }} style={{ width: '100%', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            ⬇ Download Full Data
          </button>
          <button onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv';
            input.onchange = async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const parsed = await loadCSVFromFile(file);
                const text = await file.text();
                persistData(text, parsed, 'upload');
                toast(`Loaded ${parsed.length} rows from ${file.name}`, 'success');
              } catch (err) {
                setError('Failed to parse CSV file');
                toast(`Failed to parse CSV: ${err?.message || 'invalid format'}`, 'error');
              }
            };
            input.click();
          }} style={{ width: '100%', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            📂 Load CSV File
          </button>
          <button onClick={() => loadData(true)} disabled={isRefreshing} style={{ width: '100%', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isRefreshing ? 0.6 : 1 }}>
            ↻ {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
            {lastUpdated ? <>Last updated<br />{lastUpdated.toLocaleString()}</> : 'Last updated: —'}
            {dataSource === 'cached' && <div style={{ marginTop: 6, color: '#f59e0b' }}>⚡ Offline (cached data)</div>}
            {dataSource === 'fallback' && <div style={{ marginTop: 6, color: '#f59e0b' }}>⚠ direct sheet (backend empty)</div>}
            <div style={{ marginTop: 6, color: '#475569' }}>build v2sheet-4</div>
          </div>
        </div>
      </aside>

      <UserContext.Provider value={{ userEmail, setUserEmail }}>
        <div className="main-content">
          {dataSource === 'cached' && (
            <div style={{ background: 'rgba(245, 158, 11, 0.12)', borderBottom: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24', padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>⚡ <strong>Offline / Cached Mode:</strong> Showing local saved orders data from {lastUpdated ? lastUpdated.toLocaleString() : 'previous session'}.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => loadData(true)} style={{ background: '#d97706', border: 'none', borderRadius: 4, color: '#fff', padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>↻ Live Refresh</button>
                <button onClick={onLogout} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, color: '#f1f5f9', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>🔑 Re-Sign In</button>
              </div>
            </div>
          )}
          {viewPO ? (
            <ErrorBoundary>
              <PODetailsPage po={viewPO} data={data} onBack={closePO} />
            </ErrorBoundary>
          ) : (
            <div key={tab} className="tab-pane">
              <ErrorBoundary key="dashboard">
                {tab === 'dashboard' && renderOrderDataTab(() => (
                  <DashboardTab data={filteredData} allData={data} metrics={metrics} recentOrders={recentOrders} platformFilter={globalPlatform} onOpenPO={openPO} onSearchOpen={openPOInNewTab} />
                ))}
              </ErrorBoundary>
              <ErrorBoundary key="orders">
                {tab === 'orders' && renderOrderDataTab(() => (
                  <OrdersTab data={filteredData} platformFilter={globalPlatform} onOpenPO={openPO} />
                ))}
              </ErrorBoundary>
              <ErrorBoundary key="sales">
                {tab === 'sales' && <SalesTab />}
              </ErrorBoundary>
              <ErrorBoundary key="inventory">
                {tab === 'inventory' && renderOrderDataTab(() => (
                  <InventoryTab data={filteredData} />
                ))}
              </ErrorBoundary>
              <ErrorBoundary key="stock">
                {tab === 'stock' && <StockTab data={filteredData} onOpenPO={openPO} />}
              </ErrorBoundary>
              <ErrorBoundary key="logistics">
                {tab === 'logistics' && <LogisticsTab data={filteredData} onOpenPO={openPO} />}
              </ErrorBoundary>
              <ErrorBoundary key="dispatch">
                {tab === 'dispatch' && <DispatchTab data={filteredData} onOpenPO={openPO} />}
              </ErrorBoundary>
              <ErrorBoundary key="reports">
                {tab === 'reports' && renderOrderDataTab(() => (
                  <ReportsTab data={filteredData} platformFilter={globalPlatform} />
                ))}
              </ErrorBoundary>
              <ErrorBoundary key="finance">
                {tab === 'finance' && <FinanceTab data={filteredData} onOpenPO={openPO} />}
              </ErrorBoundary>
              <ErrorBoundary key="performance">
                {tab === 'performance' && <PerformanceTab data={filteredData} platformFilter={globalPlatform} />}
              </ErrorBoundary>
              <ErrorBoundary key="settings">
                {tab === 'settings' && <SettingsTab />}
              </ErrorBoundary>
            </div>
          )}
        </div>
      </UserContext.Provider>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onSelectTab={handleTabChange}
        data={data}
        onOpenPO={openPOInNewTab}
      />
    </>
  )
}

function App() {
  return (
    <AuthGate>
      {({ user, logout }) => <Dashboard authUser={user} onLogout={logout} />}
    </AuthGate>
  )
}

export default App
