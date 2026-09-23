import { uniqueByPO, parseMMDDDate, num } from './utils'

export function calculateRTRisk(row, allData, precomputedPoData) {
  const city = row['City'] || ''
  const platform = row['Platform'] || ''
  const product = row['Product'] || ''
  const released = parseMMDDDate(row['PO Released Date(MM-DD-YYYY)'])

  const poData = precomputedPoData || uniqueByPO(allData)
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
