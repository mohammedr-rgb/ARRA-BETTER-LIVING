import { useState, useEffect, useMemo, useCallback } from 'react'
import { num, parseCSV, parseMMDDDate, uniqueByPO, sumPOField, sumField } from './lib/utils'
import { UserContext } from './lib/userContext'
import DashboardTab from './tabs/DashboardTab'
import OrdersTab from './tabs/OrdersTab'
import InventoryTab from './tabs/InventoryTab'
import LogisticsTab from './tabs/LogisticsTab'
import DispatchTab from './tabs/DispatchTab'
import ReportsTab from './tabs/ReportsTab'
import RTOTab from './tabs/RTOTab'
import FinanceTab from './tabs/FinanceTab'
import PerformanceTab from './tabs/PerformanceTab'
import SettingsTab from './tabs/SettingsTab'
import { PODrawer } from './components/PODrawer'

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/14riCGmsLkuomzSETNSITLulbWyl7hono2U4NMRowpdI/export?format=csv&gid=1664329820'

const SEARCH_FIELDS = ['PO Number', 'Product', 'City', 'Platform', 'Appointment ID', 'FacilityName', 'Transporter', 'Entity', 'Invoice No', 'RTO Reason']

function App() {
  const [data, setData] = useState([])
  const [rawCSV, setRawCSV] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [tab, setTab] = useState('dashboard')
  const [userEmail, setUserEmail] = useState('mohammed.r@gemedible.com')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [globalPlatform, setGlobalPlatform] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [drawerPO, setDrawerPO] = useState(null)

  const loadData = useCallback(() => {
    setIsRefreshing(true)
    setError(null)
    fetch(SHEET_URL)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`)
        return r.text()
      })
      .then(text => {
        const parsed = parseCSV(text)
        setRawCSV(text)
        setData(parsed)
        setLastUpdated(new Date())
        setLoading(false)
        setIsRefreshing(false)
      })
      .catch(e => {
        setLoading(false)
        setIsRefreshing(false)
        setError(e.message || 'Failed to load data')
      })
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const platforms = useMemo(() => {
    const set = new Set()
    data.forEach(r => { if (r['Platform']) set.add(r['Platform']) })
    return ['All', ...Array.from(set).sort()]
  }, [data])

  const filteredData = useMemo(() => {
    if (globalPlatform === 'All') return data
    return data.filter(r => r['Platform'] === globalPlatform)
  }, [data, globalPlatform])

  const searchedData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return filteredData
    return filteredData.filter(r => SEARCH_FIELDS.some(f => String(r[f] || '').toLowerCase().includes(q)))
  }, [filteredData, searchQuery])

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

  const cityData = useMemo(() => {
    const map = {}
    for (const r of filteredData) {
      const c = r['City']; if (!c) continue
      if (!map[c]) map[c] = { city: c, orders: new Set(), tonnage: 0, delivered: 0, deliveredTonnage: 0, poValues: {} }
      map[c].orders.add(r['PO Number'])
      map[c].tonnage += num(r['Tonnage'])
      const po = r['PO Number']
      const v = num(r['PO Value with Tax'])
      if (po && v > 0 && v > (map[c].poValues[po] || 0)) map[c].poValues[po] = v
      if (r['Status'] === 'Delivered') {
        map[c].delivered++
        map[c].deliveredTonnage += num(r['Tonnage'])
      }
    }
    return Object.values(map)
      .map(x => ({ ...x, orders: x.orders.size, value: Math.round(Object.values(x.poValues).reduce((s, v) => s + v, 0)) }))
      .sort((a, b) => b.orders - a.orders)
  }, [filteredData])

  const statusData = useMemo(() => {
    const poData = uniqueByPO(filteredData)
    const map = {}
    poData.forEach(r => {
      const s = r['Status'] || 'Unknown'
      map[s] = (map[s] || 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100%', background: '#0f172a', color: '#94a3b8', fontSize: 18, gap: 12 }}>
        <div style={{ fontSize: 22 }}>⏳</div>
        Loading dashboard data...
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
    <a href="#" className={tab === key ? 'active' : ''} onClick={e => { e.preventDefault(); setTab(key); closeNav() }}>
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
        <div style={{ padding: '8px 16px 4px' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Platform Filter</div>
          <select value={globalPlatform} onChange={e => setGlobalPlatform(e.target.value)} style={{ width: '100%', background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#f1f5f9', padding: '8px 10px', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ padding: '8px 16px 12px' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Global Search</div>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 PO #, product, city…"
            style={{ width: '100%', background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#f1f5f9', padding: '8px 10px', fontSize: 13, outline: 'none' }}
          />
          {searchQuery && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
              {uniqueByPO(searchedData).length} matching orders — <a href="#" onClick={e => { e.preventDefault(); setSearchQuery('') }} style={{ color: '#3b82f6', textDecoration: 'none' }}>clear</a>
            </div>
          )}
        </div>
        <nav>
          {navItem('dashboard', '📈', 'Dashboard')}
          {navItem('orders', '📦', 'Orders')}
          {navItem('inventory', '🏭', 'Inventory')}
          {navItem('logistics', '🚚', 'Logistics')}
          {navItem('dispatch', '📤', 'Dispatch')}
          {navItem('reports', '📋', 'Reports')}
          {navItem('rto', '↩️', 'RTO')}
          {navItem('finance', '💰', 'Finance')}
          {navItem('performance', '🔬', 'Performance')}
          {navItem('settings', '⚙️', 'Settings')}
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #334155' }}>
          <button onClick={() => {
            const blob = new Blob([rawCSV], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = 'full_dataset.csv'; a.click()
            URL.revokeObjectURL(url)
          }} style={{ width: '100%', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            ⬇ Download Full Data
          </button>
          <button onClick={loadData} disabled={isRefreshing} style={{ width: '100%', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isRefreshing ? 0.6 : 1 }}>
            ↻ {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
            {lastUpdated ? <>Last updated<br />{lastUpdated.toLocaleString()}</> : 'Last updated: —'}
          </div>
        </div>
      </aside>

      <UserContext.Provider value={{ userEmail, setUserEmail }}>
        <div className="main-content">
          {tab === 'dashboard' && <DashboardTab data={searchedData} metrics={metrics} cityData={cityData} statusData={statusData} recentOrders={recentOrders} platformFilter={globalPlatform} onOpenPO={setDrawerPO} />}
          {tab === 'orders' && <OrdersTab data={searchedData} platformFilter={globalPlatform} onOpenPO={setDrawerPO} />}
          {tab === 'inventory' && <InventoryTab data={searchedData} />}
          {tab === 'logistics' && <LogisticsTab data={searchedData} onOpenPO={setDrawerPO} />}
          {tab === 'dispatch' && <DispatchTab data={searchedData} onOpenPO={setDrawerPO} />}
          {tab === 'reports' && <ReportsTab data={searchedData} platformFilter={globalPlatform} />}
          {tab === 'rto' && <RTOTab data={searchedData} onOpenPO={setDrawerPO} />}
          {tab === 'finance' && <FinanceTab data={searchedData} onOpenPO={setDrawerPO} />}
          {tab === 'performance' && <PerformanceTab data={searchedData} platformFilter={globalPlatform} />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </UserContext.Provider>

      <PODrawer po={drawerPO} data={data} onClose={() => setDrawerPO(null)} />
    </>
  )
}

export default App
