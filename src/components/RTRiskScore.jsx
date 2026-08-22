import { useMemo } from 'react'
import { uniqueByPO } from '../lib/utils'
import { calculateRTRisk, getRiskLevel } from '../lib/rtrisk'

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
      const { score } = calculateRTRisk(po, data, poData)
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
