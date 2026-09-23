import { useMemo } from 'react'
import { uniqueByPO, parseMMDDDate, num } from '../lib/utils'

export function SmartAlerts({ data }) {
  const alerts = useMemo(() => {
    const list = []
    const poData = uniqueByPO(data)
    const now = new Date()
    
    // 1. Rising RTO trend detection
    const weeklyRTO = {}
    for (const r of poData) {
      if (r['Status'] !== 'RTO') continue
      const released = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!released) continue
      const weekStart = new Date(released)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      const key = weekStart.toISOString().split('T')[0]
      if (!weeklyRTO[key]) weeklyRTO[key] = { count: 0, cities: new Set(), platforms: new Set() }
      weeklyRTO[key].count++
      if (r['City']) weeklyRTO[key].cities.add(r['City'])
      if (r['Platform']) weeklyRTO[key].platforms.add(r['Platform'])
    }
    
    const sortedWeeks = Object.entries(weeklyRTO).sort((a, b) => b[0].localeCompare(a[0]))
    if (sortedWeeks.length >= 3) {
      const [w0, w1, w2] = sortedWeeks.map(([, v]) => v.count)
      if (w0 > w1 && w1 > w2 && w0 >= 3) {
        list.push({
          type: 'danger',
          icon: '📈',
          title: 'RTO Rate Rising',
          message: `RTO count increased for 3 consecutive weeks: ${w2} → ${w1} → ${w0}`,
          category: 'trend'
        })
      }
    }
    
    // 2. City-specific RTO spike
    const cityWeeklyRTO = {}
    for (const r of poData) {
      if (r['Status'] !== 'RTO') continue
      const city = r['City']; if (!city) continue
      const released = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!released) continue
      const weekKey = `${city}-${Math.floor((now - released) / (7 * 86400000))}`
      if (!cityWeeklyRTO[weekKey]) cityWeeklyRTO[weekKey] = { city, count: 0 }
      cityWeeklyRTO[weekKey].count++
    }
    
    const cityWeekCounts = {}
    for (const [, val] of Object.entries(cityWeeklyRTO)) {
      const city = val.city
      if (!cityWeekCounts[city]) cityWeekCounts[city] = []
      cityWeekCounts[city].push(val.count)
    }
    
    for (const [city, counts] of Object.entries(cityWeekCounts)) {
      if (counts.length >= 2 && counts[0] > counts[1] && counts[0] >= 3) {
        list.push({
          type: 'danger',
          icon: '🏙️',
          title: `RTO Spike: ${city}`,
          message: `RTO jumped from ${counts[1]} to ${counts[0]} this week`,
          category: 'city'
        })
      }
    }
    
    // 3. Transporter cost anomaly
    const transporterStats = {}
    for (const r of data) {
      const t = r['Transporter']; if (!t) continue
      if (!transporterStats[t]) transporterStats[t] = { charge: 0, tonnage: 0, count: 0 }
      transporterStats[t].charge += num(r['Transport Charge'])
      transporterStats[t].tonnage += num(r['Tonnage'])
      transporterStats[t].count++
    }
    
    const qualifyingTransporters = Object.values(transporterStats).filter(t => t.tonnage > 100)
    if (qualifyingTransporters.length > 0) {
      const avgCostPerKG = qualifyingTransporters.reduce((s, t) => s + (t.charge / t.tonnage), 0) / qualifyingTransporters.length
      
      for (const [name, stats] of Object.entries(transporterStats)) {
        if (stats.tonnage < 100) continue
        const costPerKG = stats.charge / stats.tonnage
        if (costPerKG > avgCostPerKG * 1.5) {
          list.push({
            type: 'warning',
            icon: '🚚',
            title: `High Transport Cost: ${name}`,
            message: `Cost/KG ₹${costPerKG.toFixed(2)} is ${Math.round((costPerKG / avgCostPerKG - 1) * 100)}% above average`,
            category: 'transport'
          })
        }
      }
    }
    
    // 4. Platform delivery rate drop
    const platformStats = {}
    for (const r of poData) {
      const p = r['Platform'] || 'Unknown'
      if (!platformStats[p]) platformStats[p] = { delivered: 0, rto: 0, total: 0 }
      platformStats[p].total++
      if (r['Status'] === 'Delivered') platformStats[p].delivered++
      if (r['Status'] === 'RTO') platformStats[p].rto++
    }
    
    for (const [name, stats] of Object.entries(platformStats)) {
      const deliveryRate = stats.total ? stats.delivered / stats.total : 0
      if (stats.total >= 5 && deliveryRate < 0.6) {
        list.push({
          type: 'danger',
          icon: '📊',
          title: `Low Delivery: ${name}`,
          message: `Only ${Math.round(deliveryRate * 100)}% delivery rate (${stats.delivered}/${stats.total})`,
          category: 'platform'
        })
      }
    }
    
    // 5. Stale orders alert
    const stalePOs = new Set()
    for (const r of poData) {
      const status = r['Status'] || ''
      if (['Delivered', 'RTO'].includes(status)) continue
      const released = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!released) continue
      const daysSince = Math.floor((now - released) / 86400000)
      if (daysSince > 30) stalePOs.add(r['PO Number'])
    }
    
    if (stalePOs.size > 0) {
      list.push({
        type: 'warning',
        icon: '⏰',
        title: `${stalePOs.size} Stale Orders`,
        message: 'Open POs older than 30 days need attention',
        category: 'aging'
      })
    }
    
    // 6. Low fill rate product alert
    const productStats = {}
    for (const r of data) {
      const p = r['Product']; if (!p) continue
      const po = r['PO Number']; if (!po) continue
      if (!productStats[p]) productStats[p] = { qty: 0, delivered: 0, count: new Set() }
      if (!productStats[p].count.has(po)) {
        productStats[p].qty += num(r['PO Qty'])
        productStats[p].count.add(po)
      }
      if (r['Status'] === 'Delivered') {
        productStats[p].delivered += num(r['Delivered QTY'])
      }
    }
    
    for (const [name, stats] of Object.entries(productStats)) {
      if (stats.count.size < 2 || stats.qty === 0) continue
      const fillRate = stats.delivered / stats.qty
      if (fillRate < 0.6) {
        const displayName = name.length > 30 ? name.slice(0, 27) + '...' : name
        list.push({
          type: 'danger',
          icon: '📦',
          title: 'Low Fill Rate',
          message: `"${displayName}" at ${Math.round(fillRate * 100)}%`,
          category: 'product'
        })
      }
    }
    
    return list.slice(0, 6)
  }, [data])
  
  if (alerts.length === 0) return null
  
  const typeStyles = {
    danger: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' },
    warning: { bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.2)', color: '#eab308' },
    info: { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }
  }
  
  return (
    <div style={{
      marginBottom: 20,
      background: 'rgba(239, 68, 68, 0.04)',
      border: '1px solid rgba(239, 68, 68, 0.12)',
      borderRadius: 12,
      padding: '16px 20px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
        fontSize: 15,
        fontWeight: 700,
        color: '#f1f5f9'
      }}>
        <span style={{ fontSize: 18 }}>🧠</span>
        <span>Smart Alerts</span>
        <span style={{
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#ef4444',
          padding: '2px 8px',
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 600
        }}>
          {alerts.length}
        </span>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {alerts.map((alert, i) => {
          const style = typeStyles[alert.type] || typeStyles.info
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                background: style.bg,
                border: `1px solid ${style.border}`,
                borderRadius: 10,
                padding: '10px 14px'
              }}
            >
              <span style={{ fontSize: 14, lineHeight: '20px' }}>{alert.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: style.color, marginBottom: 2 }}>
                  {alert.title}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>
                  {alert.message}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
