import { useMemo } from 'react'
import { uniqueByPO, parseMMDDDate, num } from '../lib/utils'

export function calculateRTRisk(row, allData) {
  const city = row['City'] || ''
  const platform = row['Platform'] || ''
  const product = row['Product'] || ''
  const released = parseMMDDDate(row['PO Released Date(MM-DD-YYYY)'])
  
  const poData = uniqueByPO(allData)
  let riskScore = 0
  const factors = []
  
  // City RTO rate (0-30 points)
  const cityPOs = poData.filter(r => r['City'] === city)
  const cityRTO = cityPOs.filter(r => r['Status'] === 'RTO').length
  const cityRTORate = cityPOs.length ? cityRTO / cityPOs.length : 0
  if (cityRTORate > 0.25) {
    riskScore += 30
    factors.push({ label: 'City RTO Rate', value: `${Math.round(cityRTORate * 100)}%`, severity: 'high' })
  } else if (cityRTORate > 0.15) {
    riskScore += 20
    factors.push({ label: 'City RTO Rate', value: `${Math.round(cityRTORate * 100)}%`, severity: 'medium' })
  } else if (cityRTORate > 0.05) {
    riskScore += 10
    factors.push({ label: 'City RTO Rate', value: `${Math.round(cityRTORate * 100)}%`, severity: 'low' })
  }
  
  // Platform RTO rate (0-25 points)
  const platPOs = poData.filter(r => r['Platform'] === platform)
  const platRTO = platPOs.filter(r => r['Status'] === 'RTO').length
  const platRTORate = platPOs.length ? platRTO / platPOs.length : 0
  if (platRTORate > 0.2) {
    riskScore += 25
    factors.push({ label: 'Platform RTO Rate', value: `${Math.round(platRTORate * 100)}%`, severity: 'high' })
  } else if (platRTORate > 0.1) {
    riskScore += 15
    factors.push({ label: 'Platform RTO Rate', value: `${Math.round(platRTORate * 100)}%`, severity: 'medium' })
  }
  
  // Product fill rate (0-20 points)
  const prodRows = allData.filter(r => r['Product'] === product)
  let prodQty = 0, prodDel = 0
  for (const r of prodRows) {
    if (r['Status'] !== 'Delivered') continue
    prodQty += num(r['PO Qty'])
    prodDel += num(r['Delivered QTY'])
  }
  const prodFillRate = prodQty ? prodDel / prodQty : 1
  if (prodFillRate < 0.5) {
    riskScore += 20
    factors.push({ label: 'Product Fill Rate', value: `${Math.round(prodFillRate * 100)}%`, severity: 'high' })
  } else if (prodFillRate < 0.7) {
    riskScore += 10
    factors.push({ label: 'Product Fill Rate', value: `${Math.round(prodFillRate * 100)}%`, severity: 'medium' })
  }
  
  // Aging factor (0-15 points)
  if (released) {
    const daysSinceRelease = Math.floor((new Date() - released) / 86400000)
    if (daysSinceRelease > 30) {
      riskScore += 15
      factors.push({ label: 'PO Age', value: `${daysSinceRelease} days`, severity: 'high' })
    } else if (daysSinceRelease > 14) {
      riskScore += 8
      factors.push({ label: 'PO Age', value: `${daysSinceRelease} days`, severity: 'medium' })
    }
  }
  
  // Value at risk (0-10 points)
  const value = num(row['PO Value with Tax'])
  if (value > 100000) {
    riskScore += 10
    factors.push({ label: 'High Value PO', value: '₹' + value.toLocaleString(), severity: 'medium' })
  } else if (value > 50000) {
    riskScore += 5
    factors.push({ label: 'Medium Value PO', value: '₹' + value.toLocaleString(), severity: 'low' })
  }
  
  return { score: Math.min(riskScore, 100), factors }
}

export function getRiskLevel(score) {
  if (score >= 60) return { level: 'High', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' }
  if (score >= 30) return { level: 'Medium', color: '#eab308', bg: 'rgba(234,179,8,0.15)' }
  return { level: 'Low', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' }
}

export function RTRiskBadge({ score, showDetails = false, factors = [] }) {
  const { level, color, bg } = getRiskLevel(score)
  
  return (
    <div style={{ position: 'relative' }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        background: bg,
        color: color,
        border: `1px solid ${color}33`
      }}>
        <span style={{ fontSize: 9 }}>●</span>
        {score}%
      </span>
      {showDetails && factors.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 6,
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 10,
          padding: 12,
          minWidth: 220,
          zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', marginBottom: 8 }}>
            Risk Factors
          </div>
          {factors.map((f, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
              <span style={{ color: '#94a3b8' }}>{f.label}</span>
              <span style={{ color: f.severity === 'high' ? '#ef4444' : f.severity === 'medium' ? '#eab308' : '#22c55e', fontWeight: 600 }}>
                {f.value}
              </span>
            </div>
          ))}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#f1f5f9', fontWeight: 600 }}>Overall Risk</span>
            <span style={{ color, fontWeight: 700 }}>{level}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function RTRiskSummary({ data }) {
  const summary = useMemo(() => {
    const poData = uniqueByPO(data)
    const activePOs = poData.filter(r => !['Delivered', 'RTO'].includes(r['Status'] || ''))
    
    let high = 0, medium = 0, low = 0
    for (const po of activePOs) {
      const { score } = calculateRTRisk(po, data)
      if (score >= 60) high++
      else if (score >= 30) medium++
      else low++
    }
    
    return { total: activePOs.length, high, medium, low }
  }, [data])
  
  return (
    <div style={{
      display: 'flex',
      gap: 16,
      padding: '16px 20px',
      background: 'rgba(234,179,8,0.06)',
      border: '1px solid rgba(234,179,8,0.15)',
      borderRadius: 12,
      marginBottom: 20
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>HIGH RISK</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{summary.high}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>MEDIUM RISK</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#eab308' }}>{summary.medium}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>LOW RISK</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{summary.low}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>ACTIVE POS</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>{summary.total}</div>
      </div>
    </div>
  )
}
