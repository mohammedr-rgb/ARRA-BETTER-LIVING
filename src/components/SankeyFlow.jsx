import { useMemo, useState } from 'react'
import { uniqueByPO } from '../lib/utils'

export function SankeyFlow({ data }) {
  const [hoveredPath, setHoveredPath] = useState(null)
  
  const flows = useMemo(() => {
    const poData = uniqueByPO(data)
    
    // Platform → Status
    const platformStatus = {}
    const platformTotal = {}
    const statusTotal = { Delivered: 0, RTO: 0, 'In-Transit': 0, 'Pending/Processing': 0 }
    
    for (const r of poData) {
      const platform = r['Platform'] || 'Unknown'
      const status = r['Status'] || 'Unknown'
      
      let normalizedStatus
      if (status === 'Delivered') normalizedStatus = 'Delivered'
      else if (status === 'RTO') normalizedStatus = 'RTO'
      else if (status === 'In-Transit') normalizedStatus = 'In-Transit'
      else normalizedStatus = 'Pending/Processing'
      
      const key = `${platform}|${normalizedStatus}`
      platformStatus[key] = (platformStatus[key] || 0) + 1
      platformTotal[platform] = (platformTotal[platform] || 0) + 1
      statusTotal[normalizedStatus] = (statusTotal[normalizedStatus] || 0) + 1
    }
    
    const platforms = Object.entries(platformTotal)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }))
    
    const statuses = [
      { name: 'Delivered', count: statusTotal.Delivered, color: '#22c55e' },
      { name: 'In-Transit', count: statusTotal['In-Transit'], color: '#3b82f6' },
      { name: 'Pending/Processing', count: statusTotal['Pending/Processing'], color: '#eab308' },
      { name: 'RTO', count: statusTotal.RTO, color: '#ef4444' }
    ]
    
    const totalPOs = poData.length || 1
    const paths = []
    
    for (const platform of platforms) {
      for (const status of statuses) {
        const count = platformStatus[`${platform.name}|${status.name}`] || 0
        if (count > 0) {
          paths.push({
            from: platform.name,
            to: status.name,
            count,
            percentage: Math.round(count / totalPOs * 100)
          })
        }
      }
    }
    
    return { platforms, statuses, paths, totalPOs }
  }, [data])
  
  const width = 700
  const height = 300
  const leftX = 50
  const rightX = width - 50
  const nodeWidth = 20
  const padding = 20
  
  const platformHeight = height / flows.platforms.length
  const statusHeight = height / flows.statuses.length
  
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
          🔄 Order Flow
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          Platform → Status • {flows.totalPOs} total POs
        </div>
      </div>
      
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 300 }}>
        {/* Platform nodes */}
        {flows.platforms.map((p, i) => {
          const y = i * platformHeight + padding
          const h = platformHeight - 4
          const width_pct = (p.count / flows.totalPOs)
          const barH = Math.max(h * width_pct * 2, 20)
          return (
            <g key={p.name}>
              <rect
                x={leftX}
                y={y + (h - barH) / 2}
                width={nodeWidth}
                height={barH}
                fill="#3b82f6"
                rx={4}
              />
              <text
                x={leftX - 8}
                y={y + h / 2}
                textAnchor="end"
                fill="#f1f5f9"
                fontSize={11}
                fontWeight={600}
                dominantBaseline="middle"
              >
                {p.name.length > 12 ? p.name.slice(0, 10) + '...' : p.name}
              </text>
              <text
                x={leftX - 8}
                y={y + h / 2 + 12}
                textAnchor="end"
                fill="#64748b"
                fontSize={9}
                dominantBaseline="middle"
              >
                {p.count} POs
              </text>
            </g>
          )
        })}
        
        {/* Status nodes */}
        {flows.statuses.map((s, i) => {
          const y = i * statusHeight + padding
          const h = statusHeight - 4
          const width_pct = (s.count / flows.totalPOs)
          const barH = Math.max(h * width_pct * 2, 20)
          return (
            <g key={s.name}>
              <rect
                x={rightX - nodeWidth}
                y={y + (h - barH) / 2}
                width={nodeWidth}
                height={barH}
                fill={s.color}
                rx={4}
              />
              <text
                x={rightX + 8}
                y={y + h / 2}
                textAnchor="start"
                fill="#f1f5f9"
                fontSize={11}
                fontWeight={600}
                dominantBaseline="middle"
              >
                {s.name}
              </text>
              <text
                x={rightX + 8}
                y={y + h / 2 + 12}
                textAnchor="start"
                fill="#64748b"
                fontSize={9}
                dominantBaseline="middle"
              >
                {s.count} ({Math.round(s.count / flows.totalPOs * 100)}%)
              </text>
            </g>
          )
        })}
        
        {/* Flow paths */}
        {flows.paths.map((path, i) => {
          const fromIdx = flows.platforms.findIndex(p => p.name === path.from)
          const toIdx = flows.statuses.findIndex(s => s.name === path.to)
          if (fromIdx === -1 || toIdx === -1) return null
          
          const fromY = fromIdx * platformHeight + padding + platformHeight / 2
          const toY = toIdx * statusHeight + padding + statusHeight / 2
          const thickness = Math.max(2, (path.count / flows.totalPOs) * 40)
          
          const statusColor = flows.statuses[toIdx]?.color || '#64748b'
          const isHovered = hoveredPath === i
          
          return (
            <path
              key={i}
              d={`M ${leftX + nodeWidth} ${fromY} C ${width / 2} ${fromY}, ${width / 2} ${toY}, ${rightX - nodeWidth} ${toY}`}
              stroke={statusColor}
              strokeWidth={thickness}
              fill="none"
              opacity={isHovered ? 0.8 : 0.3}
              onMouseEnter={() => setHoveredPath(i)}
              onMouseLeave={() => setHoveredPath(null)}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
            />
          )
        })}
        
        {/* Tooltip for hovered path */}
        {hoveredPath !== null && flows.paths[hoveredPath] && (
          <g>
            <rect
              x={width / 2 - 80}
              y={height / 2 - 30}
              width={160}
              height={60}
              fill="#0f172a"
              stroke="#334155"
              rx={8}
            />
            <text x={width / 2} y={height / 2 - 10} textAnchor="middle" fill="#f1f5f9" fontSize={12} fontWeight={600}>
              {flows.paths[hoveredPath].from}
            </text>
            <text x={width / 2} y={height / 2 + 10} textAnchor="middle" fill="#94a3b8" fontSize={11}>
              → {flows.paths[hoveredPath].to}: {flows.paths[hoveredPath].count} POs ({flows.paths[hoveredPath].percentage}%)
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}
