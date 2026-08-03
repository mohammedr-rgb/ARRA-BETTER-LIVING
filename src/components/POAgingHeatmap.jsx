import { useMemo, useState } from 'react'
import { uniqueByPO, parseMMDDDate } from '../lib/utils'

export function POAgingHeatmap({ data }) {
  const [hoveredCell, setHoveredCell] = useState(null)
  
  const heatmapData = useMemo(() => {
    const poData = uniqueByPO(data)
    const now = new Date()
    
    const buckets = [
      { label: '0-7d', min: 0, max: 7 },
      { label: '8-14d', min: 8, max: 14 },
      { label: '15-30d', min: 15, max: 30 },
      { label: '31-60d', min: 31, max: 60 },
      { label: '60d+', min: 61, max: Infinity }
    ]
    
    const cityMap = {}
    
    for (const r of poData) {
      const city = r['City'] || 'Unknown'
      const status = r['Status'] || ''
      if (status === 'Delivered' || status === 'RTO') continue
      
      const released = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      if (!released) continue
      
      const days = Math.floor((now - released) / 86400000)
      const bucket = buckets.findIndex(b => days >= b.min && days <= b.max)
      if (bucket === -1) continue
      
      if (!cityMap[city]) {
        cityMap[city] = { city, counts: buckets.map(() => 0), total: 0 }
      }
      cityMap[city].counts[bucket]++
      cityMap[city].total++
    }
    
    const cities = Object.values(cityMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
    
    const maxCount = Math.max(...cities.flatMap(c => c.counts), 1)
    
    return { cities, buckets, maxCount }
  }, [data])
  
  const getColor = (count, max) => {
    if (count === 0) return 'rgba(30,41,59,0.5)'
    const ratio = count / max
    if (ratio >= 0.7) return '#ef4444'
    if (ratio >= 0.4) return '#f97316'
    if (ratio >= 0.2) return '#eab308'
    return '#3b82f6'
  }
  
  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 16,
      padding: 24,
      marginBottom: 20
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>
          📊 PO Aging Heatmap
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {[
            { color: '#3b82f6', label: 'Low' },
            { color: '#eab308', label: 'Medium' },
            { color: '#f97316', label: 'High' },
            { color: '#ef4444', label: 'Critical' }
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color }} />
              <span style={{ fontSize: 10, color: '#94a3b8' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ 
                textAlign: 'left', 
                padding: '10px 12px', 
                fontSize: 12, 
                color: '#94a3b8', 
                fontWeight: 600,
                borderBottom: '1px solid #334155',
                minWidth: 120
              }}>
                City
              </th>
              {heatmapData.buckets.map(b => (
                <th key={b.label} style={{ 
                  textAlign: 'center', 
                  padding: '10px 12px', 
                  fontSize: 11, 
                  color: '#94a3b8', 
                  fontWeight: 600,
                  borderBottom: '1px solid #334155',
                  minWidth: 70
                }}>
                  {b.label}
                </th>
              ))}
              <th style={{ 
                textAlign: 'center', 
                padding: '10px 12px', 
                fontSize: 12, 
                color: '#94a3b8', 
                fontWeight: 600,
                borderBottom: '1px solid #334155',
                minWidth: 60
              }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {heatmapData.cities.map((city) => (
              <tr key={city.city}>
                <td style={{ 
                  padding: '8px 12px', 
                  fontSize: 13, 
                  color: '#f1f5f9', 
                  fontWeight: 500,
                  borderBottom: '1px solid #334155'
                }}>
                  {city.city}
                </td>
                {city.counts.map((count, bucketIdx) => (
                  <td 
                    key={bucketIdx}
                    style={{ 
                      padding: '8px 12px', 
                      textAlign: 'center',
                      borderBottom: '1px solid #334155',
                      position: 'relative'
                    }}
                    onMouseEnter={() => setHoveredCell({ city: city.city, bucket: heatmapData.buckets[bucketIdx].label, count })}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 40,
                      height: 32,
                      borderRadius: 6,
                      background: getColor(count, heatmapData.maxCount),
                      color: count > 0 ? '#fff' : '#64748b',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'transform 0.15s',
                      transform: hoveredCell?.city === city.city && hoveredCell?.bucket === heatmapData.buckets[bucketIdx].label ? 'scale(1.1)' : 'scale(1)'
                    }}>
                      {count || '—'}
                    </div>
                  </td>
                ))}
                <td style={{ 
                  padding: '8px 12px', 
                  textAlign: 'center',
                  fontSize: 14,
                  fontWeight: 700,
                  color: city.total > 10 ? '#ef4444' : city.total > 5 ? '#eab308' : '#22c55e',
                  borderBottom: '1px solid #334155'
                }}>
                  {city.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {hoveredCell && (
        <div style={{
          marginTop: 12,
          padding: '8px 14px',
          background: 'rgba(15,23,42,0.8)',
          borderRadius: 8,
          fontSize: 12,
          color: '#94a3b8',
          display: 'flex',
          gap: 16
        }}>
          <span><strong style={{ color: '#f1f5f9' }}>{hoveredCell.city}</strong> • {hoveredCell.bucket}</span>
          <span style={{ color: hoveredCell.count > 5 ? '#ef4444' : '#3b82f6', fontWeight: 600 }}>
            {hoveredCell.count} open POs
          </span>
        </div>
      )}
    </div>
  )
}
