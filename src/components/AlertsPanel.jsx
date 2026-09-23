import { useMemo } from 'react'
import { parseMMDDDate } from '../lib/utils'

export function AlertsPanel({ data }) {
  const alerts = useMemo(() => {
    const list = []
    const now = new Date()
    const seen = new Set()

    // Delayed shipments (>7 days)
    for (const r of data) {
      const po = r['PO Number']
      if (!po || seen.has(po)) continue
      const status = r['Status'] || ''
      if (status === 'Delivered' || status === 'RTO') continue
      
      const released = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!released) continue
      
      const daysSinceRelease = Math.floor((now - released) / 86400000)
      if (daysSinceRelease > 7) {
        seen.add(po)
        list.push({
          type: 'warning',
          icon: '⏰',
          title: `Delayed: PO ${po}`,
          message: `${daysSinceRelease} days since release, status: ${status}`,
          city: r['City'],
          platform: r['Platform']
        })
      }
    }

    // High RTO cities (>25%)
    const cityStats = {}
    const citySeen = new Set()
    for (const r of data) {
      const po = r['PO Number']
      const city = r['City']
      if (!po || !city) continue
      const key = `${po}-${city}`
      if (citySeen.has(key)) continue
      citySeen.add(key)
      
      if (!cityStats[city]) cityStats[city] = { total: 0, rto: 0 }
      cityStats[city].total++
      if (r['Status'] === 'RTO') cityStats[city].rto++
    }
    
    for (const [city, stats] of Object.entries(cityStats)) {
      if (stats.total >= 3 && stats.rto / stats.total >= 0.25) {
        list.push({
          type: 'danger',
          icon: '🚨',
          title: `High RTO: ${city}`,
          message: `${stats.rto} of ${stats.total} orders returned (${Math.round(stats.rto / stats.total * 100)}%)`,
          city,
          platform: ''
        })
      }
    }

    // Low fill rate products (<70%)
    const productStats = {}
    const productSeen = new Set()
    for (const r of data) {
      const po = r['PO Number']
      const product = r['Product']
      if (!po || !product) continue
      const key = `${po}-${product}`
      if (productSeen.has(key)) continue
      productSeen.add(key)
      
      if (!productStats[product]) productStats[product] = { qty: 0, delivered: 0, count: 0 }
      productStats[product].qty += Number(r['PO Qty'] || 0)
      productStats[product].delivered += Number(r['Delivered QTY'] || 0)
      productStats[product].count++
    }
    
    for (const [product, stats] of Object.entries(productStats)) {
      if (stats.count >= 2 && stats.qty > 0 && stats.delivered / stats.qty < 0.7) {
        const name = product.length > 35 ? product.slice(0, 35) + '...' : product
        list.push({
          type: 'danger',
          icon: '📦',
          title: `Low Fill Rate`,
          message: `"${name}" at ${Math.round(stats.delivered / stats.qty * 100)}% (target: 70%)`,
          city: '',
          platform: ''
        })
      }
    }

    // Stale orders (>30 days)
    const stalePOs = new Set()
    for (const r of data) {
      const po = r['PO Number']
      const status = r['Status'] || ''
      if (!po || stalePOs.has(po) || status === 'Delivered' || status === 'RTO') continue
      
      const released = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!released) continue
      
      const daysSinceRelease = Math.floor((now - released) / 86400000)
      if (daysSinceRelease > 30) {
        stalePOs.add(po)
      }
    }
    
    if (stalePOs.size > 0) {
      list.push({
        type: 'danger',
        icon: '📅',
        title: `${stalePOs.size} Stale Orders`,
        message: 'Open POs older than 30 days need attention',
        city: '',
        platform: ''
      })
    }

    return list.slice(0, 6)
  }, [data])

  if (alerts.length === 0) return null

  const typeStyles = {
    warning: { bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.3)', color: '#eab308' },
    danger: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', color: '#ef4444' },
    info: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', color: '#3b82f6' }
  }

  return (
    <div style={{
      marginBottom: 20,
      background: 'rgba(239, 68, 68, 0.05)',
      border: '1px solid rgba(239, 68, 68, 0.15)',
      borderRadius: 12,
      padding: '16px 20px',
      animation: 'fadeInUp 0.3s ease'
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
        <span style={{ fontSize: 18 }}>🔔</span>
        <span>Active Alerts</span>
        <span style={{
          background: 'rgba(239, 68, 68, 0.2)',
          color: '#ef4444',
          padding: '2px 8px',
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 600
        }}>
          {alerts.length}
        </span>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                padding: '12px 14px',
                transition: 'all 0.2s ease',
                cursor: 'default'
              }}
            >
              <span style={{ fontSize: 16, lineHeight: '20px' }}>{alert.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: style.color,
                  marginBottom: 4
                }}>
                  {alert.title}
                </div>
                <div style={{
                  fontSize: 12,
                  color: '#94a3b8',
                  lineHeight: 1.4
                }}>
                  {alert.message}
                </div>
              </div>
              {(alert.city || alert.platform) && (
                <div style={{
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap'
                }}>
                  {alert.city && (
                    <span style={{
                      fontSize: 10,
                      padding: '3px 8px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      borderRadius: 4,
                      color: '#3b82f6'
                    }}>
                      {alert.city}
                    </span>
                  )}
                  {alert.platform && (
                    <span style={{
                      fontSize: 10,
                      padding: '3px 8px',
                      background: 'rgba(168, 85, 247, 0.15)',
                      borderRadius: 4,
                      color: '#a855f7'
                    }}>
                      {alert.platform}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
