import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ComposedChart, Line
} from 'recharts'
import {
  MASTER_LOGISTICS_SUMMARY,
  getInitialLogisticsData,
  computeLogisticsMetrics,
  LOGISTICS_SHEET_ID,
} from '../lib/logisticsService'
import { StatCard, CSVButton, ProfileSection } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { csvEscape, downloadCSV, downloadXLSX } from '../lib/utils'

const CARRIER_COLORS = {
  CXL: '#3b82f6',
  RIVIGO: '#f97316',
  LCC: '#a855f7',
  Other: '#64748b',
}

const MONTH_ORDER = ['July', 'August', 'September']

export default function LogisticsTab() {
  const [shipments] = useState(() => getInitialLogisticsData())
  const [selectedMonth, setSelectedMonth] = useState('All')
  const [selectedCarrier, setSelectedCarrier] = useState('All')
  const [selectedDest, setSelectedDest] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSummaryModal, setShowSummaryModal] = useState(false)

  // Filtered shipments based on user selection
  const filteredShipments = useMemo(() => {
    return shipments.filter(s => {
      if (selectedMonth !== 'All' && s.month !== selectedMonth) return false
      if (selectedCarrier !== 'All' && s.carrier !== selectedCarrier) return false
      if (selectedDest !== 'All' && s.to !== selectedDest) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const match =
          (s.lrNo && s.lrNo.toLowerCase().includes(q)) ||
          (s.invoiceNo && s.invoiceNo.toLowerCase().includes(q)) ||
          (s.po && s.po.toLowerCase().includes(q)) ||
          (s.consignee && s.consignee.toLowerCase().includes(q)) ||
          (s.to && s.to.toLowerCase().includes(q)) ||
          (s.carrier && s.carrier.toLowerCase().includes(q))
        if (!match) return false
      }
      return true
    })
  }, [shipments, selectedMonth, selectedCarrier, selectedDest, searchQuery])

  // Computed metrics for currently filtered data
  const metrics = useMemo(() => {
    return computeLogisticsMetrics(filteredShipments)
  }, [filteredShipments])

  // All destinations list for filter dropdown
  const allDestinations = useMemo(() => {
    const set = new Set(shipments.map(s => s.to).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [shipments])

  // Monthly summary data for chart and summary table
  const monthlyChartData = useMemo(() => {
    return MONTH_ORDER.map(m => {
      const canonical = MASTER_LOGISTICS_SUMMARY.months[m]
      const monthRows = shipments.filter(s => s.month === m)
      const computed = computeLogisticsMetrics(monthRows)
      return {
        month: m,
        label: canonical?.label || m,
        tonnage: canonical?.tonnage || computed.totalTonnage,
        spend: canonical?.value || computed.totalCost,
        rate: canonical?.avgRate || computed.avgRate,
        rateBase: canonical?.avgRateBase || computed.avgRate,
        cxlSpend: canonical?.byCarrier.CXL.value || 0,
        rivigoSpend: canonical?.byCarrier.RIVIGO.value || 0,
        lccSpend: canonical?.byCarrier.LCC.value || 0,
        cxlTonnage: canonical?.byCarrier.CXL.tonnage || 0,
        rivigoTonnage: canonical?.byCarrier.RIVIGO.tonnage || 0,
        lccTonnage: canonical?.byCarrier.LCC.tonnage || 0,
      }
    })
  }, [shipments])

  // Carrier benchmark data
  const carrierBenchmarkData = useMemo(() => {
    return Object.entries(MASTER_LOGISTICS_SUMMARY.carriers).map(([key, c]) => ({
      carrier: key,
      name: c.name,
      tonnage: c.tonnage,
      spend: c.value,
      rate: c.avgRate,
      color: c.color,
      share: Math.round((c.tonnage / MASTER_LOGISTICS_SUMMARY.overall.totalTonnage) * 100),
    }))
  }, [])

  // Surcharge & Cost Component breakdown data for Pie chart
  const surchargePieData = useMemo(() => {
    const b = metrics.breakdown
    return [
      { name: 'Base Freight', value: b.freight || 530000, color: '#3b82f6' },
      { name: 'Stationary & Fuel (20%)', value: b.fuelAndStationary || 45000, color: '#f97316' },
      { name: 'Docket & LR Charges', value: b.docket || 38000, color: '#a855f7' },
      { name: 'Appointment Fees', value: b.appointment || 32000, color: '#eab308' },
      { name: 'ODA & Other Fees', value: b.oda + b.insurance || 18000, color: '#06b6d4' },
      { name: 'GST', value: b.gst || 98000, color: '#22c55e' },
    ].filter(x => x.value > 0)
  }, [metrics])

  // Top destinations by spend & rate
  const destinationChartData = useMemo(() => {
    return (metrics?.destinations || []).slice(0, 8).map(d => {
      const destName = String(d?.destination || 'Unknown')
      return {
        destination: destName.length > 12 ? destName.slice(0, 10) + '...' : destName,
        fullName: destName,
        tonnage: Math.round(d?.tonnage || 0),
        spend: Math.round(d?.cost || 0),
        rate: d?.avgRate || 0,
      }
    })
  }, [metrics])

  // Download raw shipments CSV
  const handleExportCSV = () => {
    const headers = [
      'Month', 'Carrier', 'LR No', 'Date', 'From', 'To', 'Consignee',
      'Invoice No', 'PO', 'Qty / Boxes', 'Weight (KG)', 'Freight Rate (₹/kg)',
      'Freight Amount (₹)', 'Docket Charges (₹)', 'Fuel/Stationary (₹)',
      'Appointment (₹)', 'Total Cost (₹)', 'Effective Rate (₹/kg)', 'Delivery Date'
    ]
    const rows = [headers.join(',')]
    filteredShipments.forEach(s => {
      rows.push([
        csvEscape(s.month),
        csvEscape(s.carrier),
        csvEscape(s.lrNo),
        csvEscape(s.date),
        csvEscape(s.from),
        csvEscape(s.to),
        csvEscape(s.consignee),
        csvEscape(s.invoiceNo),
        csvEscape(s.po),
        s.qty,
        s.weight,
        s.freightRate,
        s.freightAmount,
        s.docketCharges,
        s.stationaryAndFuel,
        s.appointmentCharges,
        s.totalCost,
        s.ratePerKg,
        csvEscape(s.deliveryDate),
      ].join(','))
    })
    downloadCSV(rows, `Logistics_Report_${selectedMonth}_${selectedCarrier}.csv`)
  }

  // Download Excel XLSX
  const handleExportXLSX = () => {
    const aoa = [
      [
        'Month', 'Carrier', 'LR No', 'Date', 'From', 'To', 'Consignee',
        'Invoice No', 'PO', 'Qty / Boxes', 'Weight (KG)', 'Freight Rate (₹/kg)',
        'Freight Amount (₹)', 'Docket Charges (₹)', 'Fuel/Stationary (₹)',
        'Appointment (₹)', 'Total Cost (₹)', 'Effective Rate (₹/kg)', 'Delivery Date'
      ]
    ]
    filteredShipments.forEach(s => {
      aoa.push([
        s.month,
        s.carrier,
        s.lrNo,
        s.date,
        s.from,
        s.to,
        s.consignee,
        s.invoiceNo,
        s.po,
        s.qty,
        s.weight,
        s.freightRate,
        s.freightAmount,
        s.docketCharges,
        s.stationaryAndFuel,
        s.appointmentCharges,
        s.totalCost,
        s.ratePerKg,
        s.deliveryDate,
      ])
    })
    downloadXLSX(aoa, `Logistics_Report_${selectedMonth}_${selectedCarrier}.xlsx`, 'LogisticsData')
  }

  // Shipment columns for DataTable
  const tableColumns = [
    {
      key: 'lrNo',
      label: 'LR Number',
      render: r => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#38bdf8' }}>
          {r.lrNo || '—'}
        </span>
      ),
    },
    {
      key: 'date',
      label: 'Date',
      accessor: r => r.date,
    },
    {
      key: 'carrier',
      label: 'Carrier',
      render: r => {
        const color = CARRIER_COLORS[r.carrier] || '#94a3b8'
        return (
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 700,
            background: `${color}20`,
            color,
            border: `1px solid ${color}40`,
          }}>
            {r.carrier}
          </span>
        )
      },
    },
    {
      key: 'month',
      label: 'Month',
      accessor: r => r.month,
    },
    {
      key: 'route',
      label: 'Route',
      render: r => (
        <span style={{ fontSize: 12 }}>
          <span style={{ color: '#94a3b8' }}>{r.from || 'Coimbatore'}</span>
          <span style={{ color: '#64748b', margin: '0 4px' }}>➔</span>
          <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{r.to}</span>
        </span>
      ),
    },
    {
      key: 'consignee',
      label: 'Consignee',
      accessor: r => r.consignee || r.to,
      render: r => (
        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {r.consignee || r.to || '—'}
        </span>
      ),
    },
    {
      key: 'inv',
      label: 'Invoice / PO',
      render: r => (
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {r.invoiceNo || r.po || '—'}
        </span>
      ),
    },
    {
      key: 'qty',
      label: 'Qty / Box',
      accessor: r => r.qty,
      align: 'right',
      render: r => r.qty ? r.qty.toLocaleString() : '—',
    },
    {
      key: 'weight',
      label: 'Weight (KG)',
      accessor: r => r.weight,
      align: 'right',
      render: r => <span style={{ fontWeight: 600 }}>{r.weight ? Math.round(r.weight).toLocaleString() + ' kg' : '—'}</span>,
    },
    {
      key: 'totalCost',
      label: 'Total Cost',
      accessor: r => r.totalCost,
      align: 'right',
      render: r => <span style={{ fontWeight: 700, color: '#22c55e' }}>{'₹' + Math.round(r.totalCost).toLocaleString()}</span>,
    },
    {
      key: 'ratePerKg',
      label: 'Rate (₹/KG)',
      accessor: r => r.ratePerKg,
      align: 'right',
      render: r => {
        const rate = r.ratePerKg || (r.weight ? r.totalCost / r.weight : 0)
        const color = rate <= 10 ? '#22c55e' : rate <= 16 ? '#eab308' : '#ef4444'
        return <span style={{ fontWeight: 600, color }}>{'₹' + rate.toFixed(2)}</span>
      },
    },
    {
      key: 'deliveryDate',
      label: 'Delivery Date / HUB',
      render: r => (
        <div style={{ fontSize: 11 }}>
          <div style={{ color: '#cbd5e1' }}>{r.deliveryDate || '—'}</div>
          {r.hub && <div style={{ color: '#64748b', fontSize: 10 }}>{r.hub}</div>}
        </div>
      ),
    },
  ]

  return (
    <>
      <header>
        <div>
          <h1>Logistics & Freight Cost Report</h1>
          <div className="date">
            Data synced from Master Logistics Sheet • {MASTER_LOGISTICS_SUMMARY.overall.totalTonnage.toLocaleString()} KG • ₹{Math.round(MASTER_LOGISTICS_SUMMARY.overall.totalValue).toLocaleString()} spend • Overall Avg: ₹{MASTER_LOGISTICS_SUMMARY.overall.avgRate}/KG
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href={`https://docs.google.com/spreadsheets/d/${LOGISTICS_SHEET_ID}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(59,130,246,0.15)',
              border: '1px solid rgba(59,130,246,0.3)',
              color: '#38bdf8',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            📊 Open Google Sheet
          </a>
          <ProfileSection />
        </div>
      </header>

      {/* Filter Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        background: '#1e293b',
        padding: '12px 16px',
        borderRadius: 12,
        border: '1px solid #334155',
        marginBottom: 20,
      }}>
        {/* Month Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginRight: 4 }}>Month:</span>
          {['All', 'July', 'August', 'September'].map(m => (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                border: '1px solid ' + (selectedMonth === m ? '#3b82f6' : '#334155'),
                background: selectedMonth === m ? '#3b82f6' : '#0f172a',
                color: selectedMonth === m ? '#ffffff' : '#94a3b8',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {m === 'All' ? 'All Months' : m}
            </button>
          ))}
        </div>

        {/* Carrier Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginRight: 4 }}>Carrier:</span>
          {['All', 'CXL', 'RIVIGO', 'LCC'].map(c => {
            const isSelected = selectedCarrier === c
            const color = CARRIER_COLORS[c] || '#3b82f6'
            return (
              <button
                key={c}
                onClick={() => setSelectedCarrier(c)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  border: '1px solid ' + (isSelected ? color : '#334155'),
                  background: isSelected ? `${color}25` : '#0f172a',
                  color: isSelected ? color : '#94a3b8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {c === 'All' ? 'All Carriers' : c}
              </button>
            )
          })}
        </div>

        {/* Destination & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={selectedDest}
            onChange={e => setSelectedDest(e.target.value)}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 8,
              color: '#f1f5f9',
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value="All">All Destinations</option>
            {allDestinations.filter(d => d !== 'All').map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search LR, Invoice, City..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 8,
              color: '#f1f5f9',
              padding: '6px 12px',
              fontSize: 12,
              width: 180,
            }}
          />

          <div style={{ display: 'flex', gap: 6 }}>
            <CSVButton onClick={handleExportCSV} label="CSV" />
            <button
              onClick={handleExportXLSX}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#22c55e',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Excel XLSX
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="Total Logistics Spend"
          icon="💳"
          color="#22c55e"
          value={'₹' + Math.round(metrics.totalCost).toLocaleString()}
          change={`▲ ${metrics.totalShipments} Consignments • ${selectedMonth} Scope`}
          changeColor="#22c55e"
        />
        <StatCard
          label="Total Tonnage Shipped"
          icon="⚖️"
          color="#3b82f6"
          value={Math.round(metrics.totalTonnage).toLocaleString() + ' KG'}
          change={`▲ ${metrics.totalQty.toLocaleString()} Total Units / Boxes`}
          changeColor="#38bdf8"
        />
        <StatCard
          label="Avg Rate per KG"
          icon="🎯"
          color="#f97316"
          value={'₹' + metrics.avgRate.toFixed(2) + ' / kg'}
          change={metrics.avgRate <= 10 ? '▲ Highly Cost Efficient' : metrics.avgRate <= 13 ? '● Standard Blend Rate' : '▼ Premium/Express Routes'}
          changeColor={metrics.avgRate <= 10 ? '#22c55e' : metrics.avgRate <= 13 ? '#eab308' : '#ef4444'}
        />
        <StatCard
          label="CXL Logistics"
          icon="🚚"
          color="#3b82f6"
          value={'₹' + Math.round(MASTER_LOGISTICS_SUMMARY.carriers.CXL.value).toLocaleString()}
          change={`₹${MASTER_LOGISTICS_SUMMARY.carriers.CXL.avgRate}/kg • 46,234 kg (73.2% vol)`}
          changeColor="#38bdf8"
        />
        <StatCard
          label="RIVIGO Logistics"
          icon="🚀"
          color="#f97316"
          value={'₹' + Math.round(MASTER_LOGISTICS_SUMMARY.carriers.RIVIGO.value).toLocaleString()}
          change={`₹${MASTER_LOGISTICS_SUMMARY.carriers.RIVIGO.avgRate}/kg • 15,439 kg (24.5% vol)`}
          changeColor="#f97316"
        />
        <StatCard
          label="LCC Logistics"
          icon="📦"
          color="#a855f7"
          value={'₹' + Math.round(MASTER_LOGISTICS_SUMMARY.carriers.LCC.value).toLocaleString()}
          change={`₹${MASTER_LOGISTICS_SUMMARY.carriers.LCC.avgRate}/kg • 1,465 kg (2.3% vol)`}
          changeColor="#a855f7"
        />
      </div>

      {/* Root-Cause / Management Insights Card ("WHY - ? Reasons") */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>💡</span>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
              Logistics Cost Insights & Rate Analysis (WHY - ? Reasons)
            </div>
          </div>
          <button
            onClick={() => setShowSummaryModal(v => !v)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid #334155',
              color: '#94a3b8',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {showSummaryModal ? 'Hide Details' : 'View Master Sheet Matrix'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          {MASTER_LOGISTICS_SUMMARY.reasons.map((r, i) => (
            <div
              key={i}
              style={{
                background: '#0f172a',
                padding: '12px 14px',
                borderRadius: 8,
                borderLeft: `4px solid ${r.type === 'positive' ? '#22c55e' : r.type === 'warning' ? '#eab308' : '#38bdf8'}`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>
                {r.title}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                {r.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Expandable Master Matrix Table */}
        {showSummaryModal && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #334155', overflowX: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#38bdf8', marginBottom: 8 }}>
              Overall Summary Matrix (From Master Google Sheet)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0f172a', borderBottom: '2px solid #334155', color: '#94a3b8' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Month</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Carrier</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Tonnage (KG)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Value (₹)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Rate (₹/KG)</th>
                </tr>
              </thead>
              <tbody>
                {/* July */}
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td rowSpan={4} style={{ padding: '8px 12px', fontWeight: 600, color: '#f1f5f9', verticalAlign: 'middle', borderRight: '1px solid #334155' }}>July</td>
                  <td style={{ padding: '6px 12px', color: '#3b82f6' }}>CXL</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>12,355.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹1,06,264.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹9.41 (₹8.60 net)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '6px 12px', color: '#f97316' }}>RIVIGO</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>3,209.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹78,034.58</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#ef4444' }}>₹24.32</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '6px 12px', color: '#a855f7' }}>LCC</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>0.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹0.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '2px solid #334155', background: 'rgba(59,130,246,0.05)', fontWeight: 600 }}>
                  <td style={{ padding: '6px 12px', color: '#f1f5f9' }}>July Total</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#38bdf8' }}>15,564.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#22c55e' }}>₹1,84,298.58</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#eab308' }}>₹11.84 (₹12.48)</td>
                </tr>

                {/* August */}
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td rowSpan={4} style={{ padding: '8px 12px', fontWeight: 600, color: '#f1f5f9', verticalAlign: 'middle', borderRight: '1px solid #334155' }}>August</td>
                  <td style={{ padding: '6px 12px', color: '#3b82f6' }}>CXL</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>25,651.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹2,14,945.50</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#22c55e' }}>₹8.38 (Lowest)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '6px 12px', color: '#f97316' }}>RIVIGO</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>10,732.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹2,16,759.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#ef4444' }}>₹20.20</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '6px 12px', color: '#a855f7' }}>LCC</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>0.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹0.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '2px solid #334155', background: 'rgba(59,130,246,0.05)', fontWeight: 600 }}>
                  <td style={{ padding: '6px 12px', color: '#f1f5f9' }}>August Total</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#38bdf8' }}>36,383.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#22c55e' }}>₹4,31,704.50</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#22c55e' }}>₹11.87 (Lowest Month)</td>
                </tr>

                {/* September */}
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td rowSpan={4} style={{ padding: '8px 12px', fontWeight: 600, color: '#f1f5f9', verticalAlign: 'middle', borderRight: '1px solid #334155' }}>September</td>
                  <td style={{ padding: '6px 12px', color: '#3b82f6' }}>CXL</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>8,228.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹84,789.60</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹10.31</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '6px 12px', color: '#f97316' }}>RIVIGO</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>1,498.10</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹31,265.94</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#ef4444' }}>₹20.87</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '6px 12px', color: '#a855f7' }}>LCC</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>1,465.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹19,352.50</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>₹13.21</td>
                </tr>
                <tr style={{ borderBottom: '2px solid #334155', background: 'rgba(59,130,246,0.05)', fontWeight: 600 }}>
                  <td style={{ padding: '6px 12px', color: '#f1f5f9' }}>September Total</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#38bdf8' }}>13,573.00</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#22c55e' }}>₹1,73,022.85</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: '#eab308' }}>₹12.75 (₹13.07)</td>
                </tr>

                {/* Grand Total */}
                <tr style={{ background: '#0f172a', fontWeight: 700, borderTop: '2px solid #3b82f6' }}>
                  <td colSpan={2} style={{ padding: '10px 12px', color: '#38bdf8', fontSize: 13 }}>GRAND TOTAL</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#38bdf8', fontSize: 13 }}>63,138.10 KG</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontSize: 13 }}>₹7,61,411.12</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#eab308', fontSize: 13 }}>₹12.06 / KG</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Visual Analytics Charts Row */}
      <div className="charts-row" style={{ marginBottom: 20 }}>
        {/* Chart 1: Monthly Cost & Rate Trend */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Monthly Logistics Cost & Rate Trend</div>
              <div className="chart-period">Spend (₹) vs Effective Rate (₹/kg)</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 12, fill: '#cbd5e1' }} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 11, fill: '#cbd5e1' }} tickFormatter={v => '₹' + (v / 1000) + 'k'} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fontSize: 11, fill: '#cbd5e1' }} tickFormatter={v => '₹' + v} domain={[0, 25]} />
              <ReTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                formatter={(val, name) => {
                  if (name === 'Total Spend (₹)') return ['₹' + Number(val).toLocaleString(), name]
                  if (name === 'Effective Rate (₹/kg)') return ['₹' + Number(val).toFixed(2) + '/kg', name]
                  return [val, name]
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar yAxisId="left" dataKey="spend" name="Total Spend (₹)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="rate" name="Effective Rate (₹/kg)" stroke="#22c55e" strokeWidth={3} dot={{ r: 5, fill: '#22c55e' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Carrier Volume & Rate Comparison */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Carrier Volume & Rate Benchmarking</div>
              <div className="chart-period">CXL vs RIVIGO vs LCC</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={carrierBenchmarkData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="carrier" stroke="#64748b" tick={{ fontSize: 12, fill: '#cbd5e1' }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11, fill: '#cbd5e1' }} tickFormatter={v => (v / 1000) + 't'} />
              <ReTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                formatter={(val, name, item) => {
                  return [
                    `${Number(val).toLocaleString()} KG (₹${item.payload.rate}/kg • ₹${Math.round(item.payload.spend).toLocaleString()})`,
                    'Tonnage'
                  ]
                }}
              />
              <Bar dataKey="tonnage" name="Tonnage (KG)" radius={[4, 4, 0, 0]}>
                {carrierBenchmarkData.map(entry => (
                  <Cell key={entry.carrier} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="charts-row" style={{ marginBottom: 20 }}>
        {/* Chart 3: Cost Surcharge Breakdown */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Logistics Cost Component Surcharge Breakdown</div>
              <div className="chart-period">Freight Base vs Fuel vs Appointment vs Docket vs GST</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={surchargePieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={50}
                  paddingAngle={3}
                >
                  {surchargePieData.map(entry => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <ReTooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                  formatter={(val) => ['₹' + Number(val).toLocaleString(), 'Amount']}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Top Destination Route Efficiency */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Route & Destination Cost Efficiency</div>
              <div className="chart-period">Average Cost per KG (₹/kg) by City</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={destinationChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11, fill: '#cbd5e1' }} tickFormatter={v => '₹' + v} />
              <YAxis dataKey="destination" type="category" stroke="#64748b" tick={{ fontSize: 11, fill: '#cbd5e1' }} width={90} />
              <ReTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                formatter={(val, name, item) => [
                  `₹${Number(val).toFixed(2)}/kg (Total: ${item.payload.tonnage.toLocaleString()} KG • ₹${item.payload.spend.toLocaleString()})`,
                  'Avg Rate'
                ]}
              />
              <Bar dataKey="rate" name="Rate (₹/kg)" fill="#06b6d4" radius={[0, 4, 4, 0]}>
                {destinationChartData.map(entry => (
                  <Cell
                    key={entry.destination}
                    fill={entry.rate <= 10 ? '#22c55e' : entry.rate <= 15 ? '#3b82f6' : '#f97316'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Shipment Records DataTable */}
      <div style={{ marginBottom: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
              Consignment & Shipment Level Records ({filteredShipments.length} rows)
            </h2>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              Detailed LR-wise breakdown with freight rates, docket fees, stationary, fuel, appointment charges, and delivery dates.
            </div>
          </div>
        </div>

        <DataTable
          columns={tableColumns}
          rows={filteredShipments}
          defaultSortKey="weight"
          defaultSortDir="desc"
          pageSize={20}
        />
      </div>
    </>
  )
}
