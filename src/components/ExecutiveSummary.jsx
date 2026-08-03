import { useMemo } from 'react'
import { uniqueByPO, parseMMDDDate, sumPOField } from '../lib/utils'

export function ExecutiveSummary({ data }) {
  const summary = useMemo(() => {
    const poData = uniqueByPO(data)
    const now = new Date()
    
    // Time periods
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const monthAgo = new Date(today)
    monthAgo.setMonth(monthAgo.getMonth() - 1)
    
    // This week stats
    const thisWeekPOs = poData.filter(r => {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      return d && d >= weekAgo
    })
    const thisWeekDelivered = thisWeekPOs.filter(r => r['Status'] === 'Delivered').length
    const thisWeekRTO = thisWeekPOs.filter(r => r['Status'] === 'RTO').length
    const thisWeekValue = sumPOField(thisWeekPOs, 'PO Value with Tax')
    
    // Last week stats
    const lastWeekStart = new Date(weekAgo)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekPOs = poData.filter(r => {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      return d && d >= lastWeekStart && d < weekAgo
    })
    
    // This month stats
    const thisMonthPOs = poData.filter(r => {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const thisMonthDelivered = thisMonthPOs.filter(r => r['Status'] === 'Delivered').length
    const thisMonthRTO = thisMonthPOs.filter(r => r['Status'] === 'RTO').length
    const thisMonthValue = sumPOField(thisMonthPOs, 'PO Value with Tax')
    
    // Overall stats
    const totalDelivered = poData.filter(r => r['Status'] === 'Delivered').length
    const totalRTO = poData.filter(r => r['Status'] === 'RTO').length
    const totalValue = sumPOField(poData, 'PO Value with Tax')
    
    // City with highest RTO
    const cityRTO = {}
    for (const r of poData) {
      if (r['Status'] !== 'RTO') continue
      const c = r['City']; if (!c) continue
      cityRTO[c] = (cityRTO[c] || 0) + 1
    }
    const topRTOCity = Object.entries(cityRTO).sort((a, b) => b[1] - a[1])[0]
    
    // Platform with highest volume
    const platVolume = {}
    for (const r of thisWeekPOs) {
      const p = r['Platform'] || 'Unknown'
      platVolume[p] = (platVolume[p] || 0) + 1
    }
    const topPlatform = Object.entries(platVolume).sort((a, b) => b[1] - a[1])[0]
    
    // Week-over-week change
    const wowChange = lastWeekPOs.length ? Math.round((thisWeekPOs.length - lastWeekPOs.length) / lastWeekPOs.length * 100) : 0
    
    // Generate narrative
    const lines = []
    lines.push(`This week: ${thisWeekPOs.length} POs received worth ₹${Math.round(thisWeekValue).toLocaleString()}.`)
    
    if (thisWeekDelivered > 0) {
      lines.push(`${thisWeekDelivered} delivered successfully.`)
    }
    
    if (thisWeekRTO > 0) {
      lines.push(`${thisWeekRTO} returned (RTO).`)
    }
    
    if (wowChange !== 0) {
      lines.push(`Volume is ${wowChange > 0 ? 'up' : 'down'} ${Math.abs(wowChange)}% vs last week.`)
    }
    
    if (topPlatform) {
      lines.push(`Top platform: ${topPlatform[0]} (${topPlatform[1]} POs).`)
    }
    
    if (topRTOCity && topRTOCity[1] >= 2) {
      lines.push(`⚠️ ${topRTOCity[0]} has highest RTO: ${topRTOCity[1]} returns.`)
    }
    
    const activePOs = poData.filter(r => !['Delivered', 'RTO'].includes(r['Status'] || '')).length
    if (activePOs > 0) {
      lines.push(`${activePOs} POs still in progress.`)
    }
    
    return {
      narrative: lines.join(' '),
      thisWeek: {
        pos: thisWeekPOs.length,
        delivered: thisWeekDelivered,
        rto: thisWeekRTO,
        value: thisWeekValue
      },
      thisMonth: {
        pos: thisMonthPOs.length,
        delivered: thisMonthDelivered,
        rto: thisMonthRTO,
        value: thisMonthValue
      },
      overall: {
        pos: poData.length,
        delivered: totalDelivered,
        rto: totalRTO,
        value: totalValue,
        active: activePOs
      },
      topRTOCity: topRTOCity ? { city: topRTOCity[0], count: topRTOCity[1] } : null,
      topPlatform: topPlatform ? { platform: topPlatform[0], count: topPlatform[1] } : null
    }
  }, [data])
  
  return (
    <div style={{
      marginBottom: 20,
      background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(168,85,247,0.08) 100%)',
      border: '1px solid rgba(59,130,246,0.2)',
      borderRadius: 12,
      padding: '20px 24px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12
      }}>
        <span style={{ fontSize: 20 }}>📋</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Executive Summary</span>
        <span style={{ 
          fontSize: 11, 
          color: '#64748b', 
          marginLeft: 'auto',
          background: 'rgba(100,116,139,0.2)',
          padding: '4px 10px',
          borderRadius: 6
        }}>
          Auto-generated
        </span>
      </div>
      
      <div style={{
        fontSize: 14,
        color: '#e2e8f0',
        lineHeight: 1.7,
        marginBottom: 16,
        fontStyle: 'italic'
      }}>
        "{summary.narrative}"
      </div>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12
      }}>
        <div style={{
          background: 'rgba(15,23,42,0.5)',
          borderRadius: 8,
          padding: '12px 16px'
        }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>THIS WEEK</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>{summary.thisWeek.pos} POs</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            <span style={{ color: '#22c55e' }}>{summary.thisWeek.delivered} delivered</span> • 
            <span style={{ color: '#ef4444' }}> {summary.thisWeek.rto} RTO</span>
          </div>
        </div>
        
        <div style={{
          background: 'rgba(15,23,42,0.5)',
          borderRadius: 8,
          padding: '12px 16px'
        }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>THIS MONTH</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#a855f7' }}>{summary.thisMonth.pos} POs</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            <span style={{ color: '#22c55e' }}>{summary.thisMonth.delivered} delivered</span> • 
            <span style={{ color: '#ef4444' }}> {summary.thisMonth.rto} RTO</span>
          </div>
        </div>
        
        <div style={{
          background: 'rgba(15,23,42,0.5)',
          borderRadius: 8,
          padding: '12px 16px'
        }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>OVERALL</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316' }}>{summary.overall.pos} POs</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            <span style={{ color: '#22c55e' }}>{summary.overall.delivered} delivered</span> • 
            <span style={{ color: '#ef4444' }}> {summary.overall.rto} RTO</span> • 
            <span style={{ color: '#3b82f6' }}> {summary.overall.active} active</span>
          </div>
        </div>
      </div>
    </div>
  )
}
