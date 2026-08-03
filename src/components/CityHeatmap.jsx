import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Cell } from 'recharts'

const CITY_COORDS = {
  'HYDERABAD': { lat: 17.385, lng: 78.4867, x: 72, y: 62 },
  'BANGALORE': { lat: 12.9716, lng: 77.5946, x: 65, y: 72 },
  'CHENNAI': { lat: 13.0827, lng: 80.2707, x: 78, y: 68 },
  'COIMBATORE': { lat: 11.0168, lng: 76.9558, x: 62, y: 76 },
  'CENTRAL GOA': { lat: 15.2993, lng: 74.124, x: 58, y: 66 },
  'MUMBAI': { lat: 19.076, lng: 72.8777, x: 52, y: 58 },
  'VIZAG': { lat: 17.6868, lng: 83.2185, x: 82, y: 60 },
  'KOCHI': { lat: 9.9312, lng: 76.2673, x: 60, y: 80 },
  'PUNE': { lat: 18.5204, lng: 73.8567, x: 54, y: 60 },
  'DELHI': { lat: 28.7041, lng: 77.1025, x: 62, y: 38 },
  'AHMEDABAD': { lat: 23.0225, lng: 72.5714, x: 48, y: 48 },
  'JAIPUR': { lat: 26.9124, lng: 75.7873, x: 56, y: 42 },
  'LUCKNOW': { lat: 26.8467, lng: 80.9462, x: 72, y: 40 },
  'KOLKATA': { lat: 22.5726, lng: 88.3639, x: 88, y: 50 },
  'CHANDIGARH': { lat: 30.7333, lng: 76.7794, x: 60, y: 30 },
  'INDORE': { lat: 22.7196, lng: 75.8577, x: 58, y: 48 },
  'NAGPUR': { lat: 21.1458, lng: 79.0882, x: 68, y: 52 },
  'SURAT': { lat: 21.1702, lng: 72.8311, x: 46, y: 52 },
  'VISAKHAPATNAM': { lat: 17.6868, lng: 83.2185, x: 82, y: 60 },
}

export function CityHeatmap({ cityData }) {
  const mapData = useMemo(() => {
    return cityData.map(city => ({
      ...city,
      coords: CITY_COORDS[city.city.toUpperCase()] || { x: 50, y: 50 }
    }))
  }, [cityData])

  const maxValue = useMemo(() => {
    return Math.max(...mapData.map(c => c.orders), 1)
  }, [mapData])

  const getColor = (value) => {
    const ratio = value / maxValue
    if (ratio >= 0.8) return '#22c55e'
    if (ratio >= 0.6) return '#3b82f6'
    if (ratio >= 0.4) return '#a855f7'
    if (ratio >= 0.2) return '#eab308'
    return '#64748b'
  }

  const getRadius = (value) => {
    const ratio = value / maxValue
    return 8 + ratio * 16
  }

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 16,
      padding: 24,
      animation: 'fadeInUp 0.3s ease'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
      }}>
        <div style={{
          fontSize: 18,
          fontWeight: 600,
          color: '#f1f5f9'
        }}>
          🗺️ City Performance Map
        </div>
        <div style={{
          display: 'flex',
          gap: 12,
          fontSize: 11,
          color: '#94a3b8'
        }}>
          {[
            { color: '#22c55e', label: 'High' },
            { color: '#3b82f6', label: 'Medium' },
            { color: '#eab308', label: 'Low' }
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: item.color
              }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG Map */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: 300,
        background: 'rgba(15, 23, 42, 0.5)',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 20
      }}>
        <svg
          viewBox="0 0 100 100"
          style={{
            width: '100%',
            height: '100%'
          }}
        >
          {/* India outline (simplified) */}
          <path
            d="M 45 25 L 55 22 L 65 25 L 75 30 L 85 40 L 90 50 L 88 60 L 82 70 L 75 75 L 68 80 L 60 82 L 55 78 L 50 75 L 45 70 L 40 65 L 38 55 L 40 45 L 42 35 Z"
            fill="rgba(51, 65, 85, 0.3)"
            stroke="#475569"
            strokeWidth="0.5"
          />
          
          {/* City dots */}
          {mapData.map((city, i) => (
            <g key={i}>
              {/* Pulse animation for high value cities */}
              {city.orders / maxValue >= 0.6 && (
                <circle
                  cx={city.coords.x}
                  cy={city.coords.y}
                  r={getRadius(city.orders) + 4}
                  fill="none"
                  stroke={getColor(city.orders)}
                  strokeWidth="0.5"
                  opacity="0.5"
                >
                  <animate
                    attributeName="r"
                    from={getRadius(city.orders)}
                    to={getRadius(city.orders) + 8}
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.6"
                    to="0"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              
              {/* Main dot */}
              <circle
                cx={city.coords.x}
                cy={city.coords.y}
                r={getRadius(city.orders)}
                fill={getColor(city.orders)}
                opacity="0.9"
                style={{ cursor: 'pointer' }}
              >
                <title>{`${city.city}: ${city.orders} orders`}</title>
              </circle>
              
              {/* City label */}
              <text
                x={city.coords.x}
                y={city.coords.y - getRadius(city.orders) - 3}
                textAnchor="middle"
                fill="#f1f5f9"
                fontSize="2.5"
                fontWeight="600"
              >
                {city.city.length > 10 ? city.city.slice(0, 8) + '...' : city.city}
              </text>
              
              {/* Value label */}
              <text
                x={city.coords.x}
                y={city.coords.y + 1}
                textAnchor="middle"
                fill="#fff"
                fontSize="2.2"
                fontWeight="700"
              >
                {city.orders}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* City Stats Bar Chart */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.5)',
        borderRadius: 12,
        padding: 16
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#94a3b8',
          marginBottom: 12
        }}>
          Orders Distribution by City
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={mapData.slice(0, 10)} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis 
              dataKey="city" 
              type="category" 
              stroke="#64748b" 
              tick={{ fontSize: 11 }}
              width={100}
            />
            <ReTooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 8,
                color: '#f1f5f9'
              }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload
                return (
                  <div style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '12px 16px',
                    fontSize: 13
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, color: '#f1f5f9' }}>
                      {row.city}
                    </div>
                    <div style={{ color: '#94a3b8' }}>
                      Orders: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{row.orders}</span>
                    </div>
                    <div style={{ color: '#94a3b8' }}>
                      Value: <span style={{ color: '#22c55e', fontWeight: 600 }}>₹{row.value?.toLocaleString()}</span>
                    </div>
                    <div style={{ color: '#94a3b8' }}>
                      Tonnage: <span style={{ color: '#a855f7', fontWeight: 600 }}>{Math.round(row.tonnage)} KG</span>
                    </div>
                  </div>
                )
              }}
            />
            <Bar dataKey="orders" radius={[0, 6, 6, 0]}>
              {mapData.slice(0, 10).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(entry.orders)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
