import { useMemo } from 'react'
import { uniqueByPO, parseMMDDDate, num, sumPOField, sumField, productSummary } from '../lib/utils'

export function BoardReport({ data, metrics }) {
  const report = useMemo(() => {
    const poData = uniqueByPO(data)
    const now = new Date()
    
    // Time periods
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const monthAgo = new Date(today)
    monthAgo.setMonth(monthAgo.getMonth() - 1)
    
    // This week
    const thisWeekPOs = poData.filter(r => {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      return d && d >= weekAgo
    })
    
    // This month
    const thisMonthPOs = poData.filter(r => {
      const d = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    
    // Top cities
    const cityStats = {}
    for (const r of poData) {
      const c = r['City']; if (!c) continue
      if (!cityStats[c]) cityStats[c] = { orders: 0, delivered: 0, rto: 0, value: 0 }
      cityStats[c].orders++
      if (r['Status'] === 'Delivered') cityStats[c].delivered++
      if (r['Status'] === 'RTO') cityStats[c].rto++
      cityStats[c].value += num(r['PO Value with Tax'])
    }
    const topCities = Object.values(cityStats).sort((a, b) => b.orders - a.orders).slice(0, 5)
    
    // Top platforms
    const platStats = {}
    for (const r of poData) {
      const p = r['Platform'] || 'Unknown'
      if (!platStats[p]) platStats[p] = { orders: 0, delivered: 0, rto: 0, value: 0 }
      platStats[p].orders++
      if (r['Status'] === 'Delivered') platStats[p].delivered++
      if (r['Status'] === 'RTO') platStats[p].rto++
      platStats[p].value += num(r['PO Value with Tax'])
    }
    const topPlatforms = Object.values(platStats).sort((a, b) => b.orders - a.orders).slice(0, 5)
    
    // RTO reasons
    const reasonStats = {}
    for (const r of poData.filter(r => r['Status'] === 'RTO')) {
      const reason = r['RTO Reason'] || 'Unknown'
      reasonStats[reason] = (reasonStats[reason] || 0) + 1
    }
    const topReasons = Object.entries(reasonStats).sort((a, b) => b[1] - a[1]).slice(0, 3)
    
    // Top products
    const products = productSummary(data).slice(0, 5)
    
    return {
      totalPOs: poData.length,
      delivered: poData.filter(r => r['Status'] === 'Delivered').length,
      rto: poData.filter(r => r['Status'] === 'RTO').length,
      active: poData.filter(r => !['Delivered', 'RTO'].includes(r['Status'] || '')).length,
      totalValue: sumPOField(poData, 'PO Value with Tax'),
      totalTonnage: sumField(poData, 'Tonnage'),
      thisWeek: {
        pos: thisWeekPOs.length,
        delivered: thisWeekPOs.filter(r => r['Status'] === 'Delivered').length,
        rto: thisWeekPOs.filter(r => r['Status'] === 'RTO').length
      },
      thisMonth: {
        pos: thisMonthPOs.length,
        delivered: thisMonthPOs.filter(r => r['Status'] === 'Delivered').length,
        rto: thisMonthPOs.filter(r => r['Status'] === 'RTO').length
      },
      topCities,
      topPlatforms,
      topReasons,
      products,
      avgFillRate: metrics?.avgFillRate || 0
    }
  }, [data, metrics])
  
  const generateReport = () => {
    const lines = []
    lines.push('=== ARRA BETTER LIVING - PERFORMANCE REPORT ===')
    lines.push(`Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`)
    lines.push('')
    
    lines.push('--- OVERALL SUMMARY ---')
    lines.push(`Total POs: ${report.totalPOs}`)
    lines.push(`Delivered: ${report.delivered} (${Math.round(report.delivered / report.totalPOs * 100)}%)`)
    lines.push(`RTO: ${report.rto} (${Math.round(report.rto / report.totalPOs * 100)}%)`)
    lines.push(`Active: ${report.active}`)
    lines.push(`Total Value: ₹${Math.round(report.totalValue).toLocaleString()}`)
    lines.push(`Total Tonnage: ${Math.round(report.totalTonnage).toLocaleString()} KG`)
    lines.push(`Avg Fill Rate: ${report.avgFillRate}%`)
    lines.push('')
    
    lines.push('--- THIS WEEK ---')
    lines.push(`POs: ${report.thisWeek.pos}`)
    lines.push(`Delivered: ${report.thisWeek.delivered}`)
    lines.push(`RTO: ${report.thisWeek.rto}`)
    lines.push('')
    
    lines.push('--- THIS MONTH ---')
    lines.push(`POs: ${report.thisMonth.pos}`)
    lines.push(`Delivered: ${report.thisMonth.delivered}`)
    lines.push(`RTO: ${report.thisMonth.rto}`)
    lines.push('')
    
    lines.push('--- TOP 5 CITIES ---')
    for (const c of report.topCities) {
      lines.push(`${c.city}: ${c.orders} POs, ${c.delivered} delivered, ${c.rto} RTO, ₹${Math.round(c.value).toLocaleString()}`)
    }
    lines.push('')
    
    lines.push('--- TOP 5 PLATFORMS ---')
    for (const p of report.topPlatforms) {
      const deliveryRate = p.orders ? Math.round(p.delivered / p.orders * 100) : 0
      lines.push(`${p.platform}: ${p.orders} POs, ${deliveryRate}% delivery rate, ₹${Math.round(p.value).toLocaleString()}`)
    }
    lines.push('')
    
    lines.push('--- TOP RTO REASONS ---')
    for (const [reason, count] of report.topReasons) {
      lines.push(`${reason}: ${count} cases`)
    }
    lines.push('')
    
    lines.push('--- TOP 5 PRODUCTS ---')
    for (const p of report.products) {
      lines.push(`${p.product}: ${p.qty} units, ${Math.round(p.tonnage)} KG, ₹${Math.round(p.value).toLocaleString()}`)
    }
    lines.push('')
    
    lines.push('=== END OF REPORT ===')
    
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ARRA_Performance_Report_${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }
  
  return (
    <button
      onClick={generateReport}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: 'rgba(168,85,247,0.1)',
        border: '1px solid rgba(168,85,247,0.2)',
        borderRadius: 8,
        color: '#a855f7',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
    >
      <span>📄</span>
      <span>Export Board Report</span>
    </button>
  )
}
