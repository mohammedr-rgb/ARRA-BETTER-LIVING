import { useState, useEffect, useMemo, useCallback } from 'react'
import { num, parseCSV, parseMMDDDate, uniqueByPO, sumPOField, sumField, loadCSVFromFile } from './lib/utils'
import { UserContext } from './lib/userContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DashboardSkeleton, IconButton } from './components/ui'
import { getAuthToken, forceReauth } from './lib/auth'
import { toast } from './lib/toast'
import DashboardTab from './tabs/DashboardTab'
import OrdersTab from './tabs/OrdersTab'
import InventoryTab from './tabs/InventoryTab'
import StockTab from './tabs/StockTab'
import LogisticsTab from './tabs/LogisticsTab'
import DispatchTab from './tabs/DispatchTab'
import ReportsTab from './tabs/ReportsTab'
import RTOTab from './tabs/RTOTab'
import FinanceTab from './tabs/FinanceTab'
import PerformanceTab from './tabs/PerformanceTab'
import SettingsTab from './tabs/SettingsTab'
import { PODetailsPage } from './components/PODetailsPage'
import { AuthGate, UserBadge } from './components/AuthGate'
import { CommandPalette } from './components/CommandPalette'

const API_URL = 'https://script.google.com/macros/s/AKfycbyTPATdTTq6ZOUHDyG37foHyVZgTfIfCBxjTSxs3vbbECkeAHUTTUrrOttSpKKCOVqMjA/exec'
const FALLBACK_SHEET_URL = 'https://docs.google.com/spreadsheets/d/14riCGmsLkuomzSETNSITLulbWyl7hono2U4NMRowpdI/export?format=csv&gid=1664329820'

function Dashboard({ authUser, onLogout }) {
  const [data, setData] = useState([])
  const [rawCSV, setRawCSV] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [dataSource, setDataSource] = useState(null)
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
  const [notifOpen, setNotifOpen] = useState(false)

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

  const loadData = useCallback(() => {
    setIsRefreshing(true)
    setError(null)

    const fallback = () => fetch(FALLBACK_SHEET_URL)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`)
        return r.text()
      })
      .then(fbText => {
        const fbParsed = parseCSV(fbText)
        if (fbParsed.length === 0) throw new Error('Source sheet returned no rows')
        setRawCSV(fbText)
        setData(fbParsed)
        setLastUpdated(new Date())
        setDataSource('fallback')
        setLoading(false)
        setIsRefreshing(false)
        if (data.length) toast(`Refreshed from direct sheet (${fbParsed.length} rows)`, 'warn')
      })

    if (!API_URL) {
      fallback().catch(e => { setLoading(false); setIsRefreshing(false); setError(e.message || 'Failed to load data') })
      return
    }

    fetch(`${API_URL}?token=${encodeURIComponent(getAuthToken() || '')}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`)
        return r.text()
      })
      .then(text => {
        if (/^__ERROR_(401|403)__/.test(text)) {
          forceReauth()
          throw new Error('Session expired — signing you in again.')
        }
        if (text.startsWith('__ERROR_')) {
          throw new Error(text.split('\n').slice(1).join('\n') || 'Backend error')
        }
        if (text.trim().toLowerCase().startsWith('<!doctype')) {
          throw new Error('Backend returned a Google sign-in page. Check the Apps Script deployment access (must allow the app to call it with a token).')
        }
        if (text.trim().startsWith('{')) {
          throw new Error('Backend returned an unexpected response: ' + text.trim().slice(0, 120))
        }
        const parsed = parseCSV(text)
        if (parsed.length === 0) throw new Error('__BACKEND_EMPTY__')
        setRawCSV(text)
        setData(parsed)
        setLastUpdated(new Date())
        setDataSource('backend')
        setLoading(false)
        setIsRefreshing(false)
        if (data.length) toast(`Data refreshed (${parsed.length} rows)`, 'success')
      })
      .catch(err => {
        // Backend failed (HTTP error, auth page, or empty) — fall back to the direct sheet export.
        if (err.message === 'Source sheet returned no rows') {
          setLoading(false)
          setIsRefreshing(false)
          setError(err.message)
          return
        }
        fallback().catch(fbErr => {
          setLoading(false)
          setIsRefreshing(false)
          setError(fbErr.message || 'Failed to load data')
          toast('Failed to load data', 'error')
        })
      })
  }, [data.length])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh === 0) return
    const interval = setInterval(() => {
      loadData()
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

  // Notifications: upcoming appointments (next 3 days) + stale open POs
  const notifications = useMemo(() => {
    if (!data.length) return []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + 3)
    const list = []
    const poSeen = new Set()
    for (const r of data) {
      const po = r['PO Number']; if (!po || poSeen.has(po)) continue
      const d = parseMMDDDate(r['Appointment Date(MM-DD-YYYY)'])
      if (!d) continue
      poSeen.add(po)
      if (d >= today && d <= horizon) {
        const days = Math.round((d.getTime() - today.getTime()) / 86400000)
        list.push({
          id: 'appt-' + po,
          icon: '📅',
          text: `${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days}d`} — appointment for ${po}`,
          po,
        })
      }
    }
    let stale = 0
    const poRows = uniqueByPO(data)
    for (const r of poRows) {
      if (['Delivered', 'RTO'].includes(r['Status'] || '')) continue
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (d && (today - d) / 86400000 > 30) stale++
    }
    if (stale > 0) list.push({ id: 'stale', icon: '⏳', text: `${stale} open POs older than 30 days`, po: null })
    return list.slice(0, 8)
  }, [data])

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

  if (loading) {
    return (
      <div className="main-content">
        <DashboardSkeleton />
      </div>
    )
  }

  if (error && !data.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100%', background: '#0f172a', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <div style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Failed to load dashboard data</div>
        <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 24, maxWidth: 480, wordBreak: 'break-word' }}>{error}</div>
        <button onClick={loadData} style={{ background: '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          ↻ Retry
        </button>
      </div>
    )
  }

  if (!data.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100%', background: '#0f172a', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📭</div>
        <div style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No data available</div>
        <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24 }}>The source sheet returned no rows. Try refreshing.</div>
        <button onClick={loadData} style={{ background: '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          ↻ Refresh
        </button>
      </div>
    )
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
        <div className="logo"><span className="brand-icon">✦</span> <span className="brand-gradient">ARRA BETTER LIVING</span></div>
        <div style={{ padding: '8px 16px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <UserBadge user={authUser} logout={onLogout} />
          </div>
          <div style={{ position: 'relative' }}>
            <IconButton title="Notifications (upcoming appointments)" onClick={() => setNotifOpen(v => !v)} aria-expanded={notifOpen}>
              🔔
              {notifications.length > 0 && <span className="bell-dot" />}
            </IconButton>
            {notifOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setNotifOpen(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 300, background: '#1e293b', border: '1px solid #334155', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.45)', zIndex: 50, maxHeight: 380, overflowY: 'auto' }} role="menu">
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid #334155', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Notifications {notifications.length > 0 && <span style={{ color: '#64748b', fontWeight: 500 }}>• {notifications.length}</span>}</div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>You're all caught up 🎉</div>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      role="menuitem"
                      onClick={() => { if (n.po) { openPOInNewTab(n.po); setNotifOpen(false) } }}
                      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderBottom: '1px solid #283548', cursor: n.po ? 'pointer' : 'default', fontSize: 12, color: '#cbd5e1' }}
                      onMouseEnter={e => { if (n.po) e.currentTarget.style.background = 'rgba(59,130,246,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ fontSize: 14 }}>{n.icon}</span>
                      <span>{n.text}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{ padding: '8px 16px 4px' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Platform Filter</div>
          <select value={globalPlatform} onChange={e => handlePlatformChange(e.target.value)} style={{ width: '100%', background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#f1f5f9', padding: '8px 10px', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button
          onClick={() => setCmdOpen(true)}
          style={{ width: 'calc(100% - 32px)', margin: '0 16px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: 10, color: '#64748b', padding: '10px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
          aria-label="Open command palette"
        >
          <span>🔍 Search…</span>
          <span className="kbd">⌘K</span>
        </button>
        <nav>
          {navItem('dashboard', '📈', 'Dashboard')}
          {navItem('orders', '📦', 'Orders')}
          {navItem('inventory', '🏭', 'Inventory')}
          {navItem('stock', '🗃️', 'Stock')}
          {navItem('logistics', '🚚', 'Logistics')}
          {navItem('dispatch', '📤', 'Dispatch')}
          {navItem('reports', '📋', 'Reports')}
          {navItem('rto', '↩️', 'RTO')}
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
                setRawCSV('');
                setData(parsed);
                setLastUpdated(new Date());
                setLoading(false);
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
          <button onClick={loadData} disabled={isRefreshing} style={{ width: '100%', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isRefreshing ? 0.6 : 1 }}>
            ↻ {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
            {lastUpdated ? <>Last updated<br />{lastUpdated.toLocaleString()}</> : 'Last updated: —'}
            {dataSource === 'fallback' && <div style={{ marginTop: 6, color: '#f59e0b' }}>⚠ loaded from direct sheet (backend empty)</div>}
            <div style={{ marginTop: 6, color: '#475569' }}>build v2sheet-2</div>
          </div>
        </div>
      </aside>

      <UserContext.Provider value={{ userEmail, setUserEmail }}>
        <div className="main-content">
          {viewPO ? (
            <ErrorBoundary>
              <PODetailsPage po={viewPO} data={data} onBack={closePO} />
            </ErrorBoundary>
          ) : (
            <div key={tab} className="tab-pane">
              <ErrorBoundary key="dashboard">
                {tab === 'dashboard' && <DashboardTab data={filteredData} allData={data} metrics={metrics} recentOrders={recentOrders} platformFilter={globalPlatform} onOpenPO={openPO} onSearchOpen={openPOInNewTab} />}
              </ErrorBoundary>
              <ErrorBoundary key="orders">
                {tab === 'orders' && <OrdersTab data={filteredData} platformFilter={globalPlatform} onOpenPO={openPO} />}
              </ErrorBoundary>
              <ErrorBoundary key="inventory">
                {tab === 'inventory' && <InventoryTab data={filteredData} />}
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
                {tab === 'reports' && <ReportsTab data={filteredData} platformFilter={globalPlatform} />}
              </ErrorBoundary>
              <ErrorBoundary key="rto">
                {tab === 'rto' && <RTOTab data={filteredData} onOpenPO={openPO} />}
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
