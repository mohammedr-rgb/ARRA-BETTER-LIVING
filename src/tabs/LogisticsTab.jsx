import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ComposedChart, Line
} from 'recharts'
import {
  MASTER_LOGISTICS_SUMMARY,
  getSeptemberShipments,
  computeSeptemberMetrics,
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

export default function LogisticsTab() {
  const [activeView, setActiveView] = useState('both') // 'both', 'summary', 'sep2026'
  const [shipments] = useState(() => getSeptemberShipments())
  const [selectedCarrier, setSelectedCarrier] = useState('All')
  const [selectedDest, setSelectedDest] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  // Filtered September shipments based on user selection
  const filteredShipments = useMemo(() => {
    return (shipments || []).filter(s => {
      if (selectedCarrier !== 'All' && s.carrier !== selectedCarrier) return false
      if (selectedDest !== 'All' && s.to !== selectedDest) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const match =
          (s.lrNo && String(s.lrNo).toLowerCase().includes(q)) ||
          (s.invoice && String(s.invoice).toLowerCase().includes(q)) ||
          (s.po && String(s.po).toLowerCase().includes(q)) ||
          (s.consignee && String(s.consignee).toLowerCase().includes(q)) ||
          (s.to && String(s.to).toLowerCase().includes(q)) ||
          (s.carrier && String(s.carrier).toLowerCase().includes(q))
        if (!match) return false
      }
      return true
    })
  }, [shipments, selectedCarrier, selectedDest, searchQuery])

  // Computed metrics for September filtered data
  const sepMetrics = useMemo(() => {
    return computeSeptemberMetrics(filteredShipments)
  }, [filteredShipments])

  // All destinations list for filter dropdown
  const allDestinations = useMemo(() => {
    const set = new Set((shipments || []).map(s => s.to).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [shipments])

  // Monthly summary chart data from Sheet 1
  const monthlyChartData = useMemo(() => {
    return ['July', 'August', 'September'].map(m => {
      const canonical = MASTER_LOGISTICS_SUMMARY.months[m]
      return {
        month: m,
        label: canonical?.label || m,
        tonnage: canonical?.tonnage || 0,
        spend: canonical?.value || 0,
        rate: canonical?.avgRate || 0,
        cxlSpend: canonical?.byCarrier?.CXL?.value || 0,
        rivigoSpend: canonical?.byCarrier?.RIVIGO?.value || 0,
        lccSpend: canonical?.byCarrier?.LCC?.value || 0,
        cxlTonnage: canonical?.byCarrier?.CXL?.tonnage || 0,
        rivigoTonnage: canonical?.byCarrier?.RIVIGO?.tonnage || 0,
        lccTonnage: canonical?.byCarrier?.LCC?.tonnage || 0,
      }
    })
  }, [])

  // Carrier benchmark data from Sheet 1
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

  // Surcharge & Cost Component breakdown for September
  const sepSurchargePieData = useMemo(() => {
    const b = sepMetrics.breakdown
    return [
      { name: 'KG Cost (Base Freight)', value: b.kgCost || 0, color: '#3b82f6' },
      { name: 'Docket Charges', value: b.docket || 0, color: '#a855f7' },
      { name: 'Stationary & Fuel', value: b.stationaryAndFuel || 0, color: '#f97316' },
      { name: 'GST', value: b.gst || 0, color: '#22c55e' },
    ].filter(x => x.value > 0)
  }, [sepMetrics])

  // Destination efficiency for September
  const sepDestChartData = useMemo(() => {
    return (sepMetrics?.destinations || []).slice(0, 8).map(d => {
      const destName = String(d?.destination || 'Unknown')
      return {
        destination: destName.length > 12 ? destName.slice(0, 10) + '...' : destName,
        fullName: destName,
        tonnage: Math.round(d?.tonnage || 0),
        spend: Math.round(d?.cost || 0),
        rate: d?.avgRate || 0,
      }
    })
  }, [sepMetrics])

  // Download raw shipments CSV
  const handleExportCSV = () => {
    const headers = [
      'S.NO', 'PO', 'DATE -DISPATCH', 'FROM', 'TO', 'CONSIGNEE',
      'LR number', 'QTY', 'INVOICE', 'WEIGHT (KG)', 'TRANSPORT',
      'KG COST (₹)', 'DOCKET CHARGE (₹)', 'STATIONARY &FUEL (₹)',
      'Value without GST (₹)', 'GST (₹)', 'Overall (₹)', 'Rate (₹/KG)'
    ]
    const rows = [headers.join(',')]
    filteredShipments.forEach(s => {
      rows.push([
        s.sno,
        csvEscape(s.po),
        csvEscape(s.date),
        csvEscape(s.from),
        csvEscape(s.to),
        csvEscape(s.consignee),
        csvEscape(s.lrNo),
        s.qty,
        csvEscape(s.invoice),
        s.weight,
        csvEscape(s.carrier),
        s.kgCost,
        s.docket,
        s.stationaryAndFuel,
        s.valWithoutGST,
        s.gst,
        s.overall,
        s.ratePerKg,
      ].join(','))
    })
    downloadCSV(rows, `SEP_2026_Logistics_Cost_Report_${selectedCarrier}.csv`)
  }

  // Download Excel XLSX
  const handleExportXLSX = () => {
    const aoa = [
      [
        'S.NO', 'PO', 'DATE -DISPATCH', 'FROM', 'TO', 'CONSIGNEE',
        'LR number', 'QTY', 'INVOICE', 'WEIGHT (KG)', 'TRANSPORT',
        'KG COST (₹)', 'DOCKET CHARGE (₹)', 'STATIONARY &FUEL (₹)',
        'Value without GST (₹)', 'GST (₹)', 'Overall (₹)', 'Rate (₹/KG)'
      ]
    ]
    filteredShipments.forEach(s => {
      aoa.push([
        s.sno,
        s.po,
        s.date,
        s.from,
        s.to,
        s.consignee,
        s.lrNo,
        s.qty,
        s.invoice,
        s.weight,
        s.carrier,
        s.kgCost,
        s.docket,
        s.stationaryAndFuel,
        s.valWithoutGST,
        s.gst,
        s.overall,
        s.ratePerKg,
      ])
    })
    downloadXLSX(aoa, `SEP_2026_Logistics_Cost_Report_${selectedCarrier}.xlsx`, 'SEP-2026')
  }

  // Shipment columns for DataTable matching Sheet 2 exactly
  const tableColumns = [
    {
      key: 'sno',
      label: 'S.No',
      accessor: r => r.sno,
      align: 'center',
      render: r => <span style={{ color: '#64748b', fontSize: 11 }}>{r.sno}</span>,
    },
    {
      key: 'po',
      label: 'PO Number',
      render: r => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#38bdf8' }}>
          {r.po || '—'}
        </span>
      ),
    },
    {
      key: 'date',
      label: 'Dispatch Date',
      accessor: r => r.date,
    },
    {
      key: 'carrier',
      label: 'Transport',
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
      key: 'route',
      label: 'Route',
      render: r => (
        <span style={{ fontSize: 12 }}>
          <span style={{ color: '#94a3b8' }}>{r.from || 'Coimbatore-TR'}</span>
          <span style={{ color: '#64748b', margin: '0 4px' }}>➔</span>
          <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{r.to}</span>
        </span>
      ),
    },
    {
      key: 'consignee',
      label: 'Consignee',
      accessor: r => r.consignee,
      render: r => (
        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {r.consignee || '—'}
        </span>
      ),
    },
    {
      key: 'lrNo',
      label: 'LR Number',
      render: r => (
        <span style={{ fontSize: 11, color: '#cbd5e1' }}>
          {r.lrNo || '—'}
        </span>
      ),
    },
    {
      key: 'invoice',
      label: 'Invoice',
      accessor: r => r.invoice,
      render: r => <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.invoice || '—'}</span>,
    },
    {
      key: 'qty',
      label: 'QTY',
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
      key: 'kgCost',
      label: 'KG Cost (₹)',
      accessor: r => r.kgCost,
      align: 'right',
      render: r => r.kgCost ? '₹' + Math.round(r.kgCost).toLocaleString() : '—',
    },
    {
      key: 'docket',
      label: 'Docket (₹)',
      accessor: r => r.docket,
      align: 'right',
      render: r => r.docket ? '₹' + Math.round(r.docket).toLocaleString() : '—',
    },
    {
      key: 'stationaryAndFuel',
      label: 'Stationary & Fuel (₹)',
      accessor: r => r.stationaryAndFuel,
      align: 'right',
      render: r => r.stationaryAndFuel ? '₹' + Math.round(r.stationaryAndFuel).toLocaleString() : '—',
    },
    {
      key: 'overall',
      label: 'Overall (₹)',
      accessor: r => r.overall,
      align: 'right',
      render: r => <span style={{ fontWeight: 700, color: '#22c55e' }}>{'₹' + Math.round(r.overall).toLocaleString()}</span>,
    },
    {
      key: 'ratePerKg',
      label: 'Rate (₹/KG)',
      accessor: r => r.ratePerKg,
      align: 'right',
      render: r => {
        const rate = r.ratePerKg || (r.weight ? r.overall / r.weight : 0)
        const color = rate <= 10 ? '#22c55e' : rate <= 16 ? '#eab308' : '#ef4444'
        return <span style={{ fontWeight: 600, color }}>{'₹' + rate.toFixed(2)}</span>
      },
    },
  ]

  return (
    <>
      <header>
        <div>
          <h1>Logistics & Freight Cost Report</h1>
          <div className="date">
            Summary Sheet & SEP-2026 Cost Report • Overall: {MASTER_LOGISTICS_SUMMARY.overall.totalTonnage.toLocaleString()} KG • ₹{Math.round(MASTER_LOGISTICS_SUMMARY.overall.totalValue).toLocaleString()} • ₹{MASTER_LOGISTICS_SUMMARY.overall.avgRate}/KG
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

      {/* View Switcher Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Active View:</span>
          {[
            { id: 'both', label: '📊 All Sections (Summary + SEP-2026)' },
            { id: 'summary', label: '📑 Overall Summary Report' },
            { id: 'sep2026', label: '🚚 SEP - 2026 Cost Report (41 Shipments)' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid ' + (activeView === tab.id ? '#3b82f6' : '#334155'),
                background: activeView === tab.id ? '#3b82f6' : '#0f172a',
                color: activeView === tab.id ? '#ffffff' : '#94a3b8',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

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

      {/* Top KPI Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="Overall Logistics Spend"
          icon="💳"
          color="#22c55e"
          value={'₹' + Math.round(MASTER_LOGISTICS_SUMMARY.overall.totalValue).toLocaleString()}
          change="▲ Overall Summary Sheet Total"
          changeColor="#22c55e"
        />
        <StatCard
          label="Total Tonnage Shipped"
          icon="⚖️"
          color="#3b82f6"
          value={Math.round(MASTER_LOGISTICS_SUMMARY.overall.totalTonnage).toLocaleString() + ' KG'}
          change="▲ 63.14 Metric Tonnes"
          changeColor="#38bdf8"
        />
        <StatCard
          label="Overall Rate / KG"
          icon="🎯"
          color="#f97316"
          value={'₹' + MASTER_LOGISTICS_SUMMARY.overall.avgRate + ' / kg'}
          change="● Aug: ₹11.87 (lowest) | Sep: ₹13.07"
          changeColor="#eab308"
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
          label="RIVIGO"
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

      {/* SECTION 1: OVERALL SUMMARY REPORT */}
      {(activeView === 'both' || activeView === 'summary') && (
        <div style={{ marginBottom: 24 }}>
          {/* Section Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>📑</span>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
              Sheet 1: Summery - Overall Logistics Report
            </h2>
          </div>

          {/* Master Summary Matrix Table */}
          <div style={{
            background: '#1e293b',
            borderRadius: 12,
            border: '1px solid #334155',
            padding: 16,
            marginBottom: 20,
            overflowX: 'auto',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0f172a', borderBottom: '2px solid #334155', color: '#94a3b8' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Month</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Carrier</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Tonnage (kg)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Value (₹)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Avg Rate (₹/kg)</th>
                </tr>
              </thead>
              <tbody>
                {/* July */}
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td rowSpan={4} style={{ padding: '10px 14px', fontWeight: 700, color: '#f1f5f9', verticalAlign: 'middle', borderRight: '1px solid #334155' }}>July</td>
                  <td style={{ padding: '8px 14px', color: '#3b82f6', fontWeight: 600 }}>CXL</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>12,355.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹1,06,264.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹9.41 (₹8.60 net)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '8px 14px', color: '#f97316', fontWeight: 600 }}>RIVIGO</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>3,209.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹78,034.58</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#ef4444' }}>₹24.32</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '8px 14px', color: '#a855f7', fontWeight: 600 }}>LCC</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>0.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹0.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '2px solid #334155', background: 'rgba(59,130,246,0.08)', fontWeight: 700 }}>
                  <td style={{ padding: '8px 14px', color: '#f1f5f9' }}>July Total</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#38bdf8' }}>15,564.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#22c55e' }}>₹1,84,298.58</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#eab308' }}>₹11.84 (₹12.48)</td>
                </tr>

                {/* August */}
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td rowSpan={4} style={{ padding: '10px 14px', fontWeight: 700, color: '#f1f5f9', verticalAlign: 'middle', borderRight: '1px solid #334155' }}>August</td>
                  <td style={{ padding: '8px 14px', color: '#3b82f6', fontWeight: 600 }}>CXL</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>25,651.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹2,14,945.50</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#22c55e' }}>₹8.38 (Lowest Rate)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '8px 14px', color: '#f97316', fontWeight: 600 }}>RIVIGO</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>10,732.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹2,16,759.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#ef4444' }}>₹20.20</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '8px 14px', color: '#a855f7', fontWeight: 600 }}>LCC</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>0.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹0.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '2px solid #334155', background: 'rgba(34,197,94,0.08)', fontWeight: 700 }}>
                  <td style={{ padding: '8px 14px', color: '#f1f5f9' }}>August Total</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#38bdf8' }}>36,383.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#22c55e' }}>₹4,31,704.50</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#22c55e' }}>₹11.87 (Lowest Month)</td>
                </tr>

                {/* September */}
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td rowSpan={4} style={{ padding: '10px 14px', fontWeight: 700, color: '#f1f5f9', verticalAlign: 'middle', borderRight: '1px solid #334155' }}>September</td>
                  <td style={{ padding: '8px 14px', color: '#3b82f6', fontWeight: 600 }}>CXL</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>8,228.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹84,789.60</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹10.31</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '8px 14px', color: '#f97316', fontWeight: 600 }}>RIVIGO</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>1,498.10</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹31,265.94</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#ef4444' }}>₹20.87</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '8px 14px', color: '#a855f7', fontWeight: 600 }}>LCC</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>1,465.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹19,352.50</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹13.21</td>
                </tr>
                <tr style={{ borderBottom: '2px solid #334155', background: 'rgba(249,115,22,0.08)', fontWeight: 700 }}>
                  <td style={{ padding: '8px 14px', color: '#f1f5f9' }}>September Total</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#38bdf8' }}>13,573.00</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#22c55e' }}>₹1,73,022.85</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: '#eab308' }}>₹12.75 (₹13.07)</td>
                </tr>

                {/* Grand Total */}
                <tr style={{ background: '#0f172a', fontWeight: 800, borderTop: '2px solid #3b82f6' }}>
                  <td colSpan={2} style={{ padding: '12px 14px', color: '#38bdf8', fontSize: 14 }}>GRAND TOTAL</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: '#38bdf8', fontSize: 14 }}>63,138.10 KG</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: '#22c55e', fontSize: 14 }}>₹7,61,411.12</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: '#eab308', fontSize: 14 }}>₹12.06 / KG</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Rate Insights Card */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
              💡 Rate Trajectory & Cost Drivers (WHY - ? Reasons)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
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
          </div>

          {/* Summary Charts */}
          <div className="charts-row">
            {/* Chart 1 */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="chart-title">Monthly Spend & Effective Rate Trend</div>
                  <div className="chart-period">July vs August vs September</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 12, fill: '#cbd5e1' }} />
                  <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 11, fill: '#cbd5e1' }} tickFormatter={v => '₹' + (v / 1000) + 'k'} />
                  <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fontSize: 11, fill: '#cbd5e1' }} tickFormatter={v => '₹' + v} domain={[0, 25]} />
                  <ReTooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                    formatter={(val, name) => {
                      if (name === 'Spend (₹)') return ['₹' + Number(val).toLocaleString(), name]
                      if (name === 'Effective Rate (₹/kg)') return ['₹' + Number(val).toFixed(2) + '/kg', name]
                      return [val, name]
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  <Bar yAxisId="left" dataKey="spend" name="Spend (₹)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="rate" name="Effective Rate (₹/kg)" stroke="#22c55e" strokeWidth={3} dot={{ r: 5, fill: '#22c55e' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2 */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="chart-title">Carrier Volume & Rate Benchmarking</div>
                  <div className="chart-period">CXL (₹9/kg) vs RIVIGO (₹21.12/kg) vs LCC (₹13.21/kg)</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={carrierBenchmarkData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="carrier" stroke="#64748b" tick={{ fontSize: 12, fill: '#cbd5e1' }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11, fill: '#cbd5e1' }} tickFormatter={v => (v / 1000) + 't'} />
                  <ReTooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
                    formatter={(val, name, item) => [
                      `${Number(val).toLocaleString()} KG (₹${item.payload.rate}/kg • ₹${Math.round(item.payload.spend).toLocaleString()})`,
                      'Tonnage'
                    ]}
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
        </div>
      )}

      {/* SECTION 2: SEP - 2026 LOGISTICS COST REPORT */}
      {(activeView === 'both' || activeView === 'sep2026') && (
        <div style={{ marginTop: 24, marginBottom: 30 }}>
          {/* Section Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🚚</span>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
                  Sheet 2: SEP - 2026 Logistics Cost Report ({filteredShipments.length} Shipments)
                </h2>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Billing Period: 01-09-2026 to 31-09-2026 • Detailed consignment dispatches for CXL, RIVIGO & LCC
                </div>
              </div>
            </div>

            {/* Carrier Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Filter Carrier:</span>
              {['All', 'CXL', 'RIVIGO', 'LCC'].map(c => {
                const isSelected = selectedCarrier === c
                const color = CARRIER_COLORS[c] || '#3b82f6'
                return (
                  <button
                    key={c}
                    onClick={() => setSelectedCarrier(c)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 8,
                      border: '1px solid ' + (isSelected ? color : '#334155'),
                      background: isSelected ? `${color}25` : '#0f172a',
                      color: isSelected ? color : '#94a3b8',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {c === 'All' ? 'All' : c}
                  </button>
                )
              })}

              <select
                value={selectedDest}
                onChange={e => setSelectedDest(e.target.value)}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  padding: '5px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  marginLeft: 6,
                }}
              >
                <option value="All">All Destinations</option>
                {allDestinations.filter(d => d !== 'All').map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Search PO, LR, Consignee..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  padding: '5px 10px',
                  fontSize: 12,
                  width: 170,
                  marginLeft: 6,
                }}
              />
            </div>
          </div>

          {/* September Summary Cards */}
          <div className="stats-grid" style={{ marginBottom: 16 }}>
            <StatCard
              label="SEP-2026 Dispatches"
              icon="📋"
              color="#3b82f6"
              value={sepMetrics.totalShipments}
              change={`Across ${sepMetrics.carriers.length} Carriers`}
              changeColor="#38bdf8"
            />
            <StatCard
              label="SEP-2026 Weight"
              icon="⚖️"
              color="#38bdf8"
              value={Math.round(sepMetrics.totalTonnage).toLocaleString() + ' KG'}
              change={`${sepMetrics.totalQty.toLocaleString()} Total Boxes`}
              changeColor="#38bdf8"
            />
            <StatCard
              label="SEP-2026 Total Cost"
              icon="💰"
              color="#22c55e"
              value={'₹' + Math.round(sepMetrics.totalCost).toLocaleString()}
              change={`Avg: ₹${sepMetrics.avgRate.toFixed(2)} / kg`}
              changeColor="#22c55e"
            />
            <StatCard
              label="KG Cost (Freight)"
              icon="🚛"
              color="#3b82f6"
              value={'₹' + Math.round(sepMetrics.breakdown.kgCost).toLocaleString()}
              change="Base Freight Value"
              changeColor="#94a3b8"
            />
            <StatCard
              label="Docket & Stationary"
              icon="📑"
              color="#f97316"
              value={'₹' + Math.round(sepMetrics.breakdown.docket + sepMetrics.breakdown.stationaryAndFuel).toLocaleString()}
              change="Surcharges & Handling"
              changeColor="#f97316"
            />
            <StatCard
              label="GST Total"
              icon="🏛️"
              color="#eab308"
              value={'₹' + Math.round(sepMetrics.breakdown.gst).toLocaleString()}
              change="5% - 18% Tax Component"
              changeColor="#eab308"
            />
          </div>

          {/* September Charts Row */}
          <div className="charts-row" style={{ marginBottom: 20 }}>
            {/* September Component Breakdown */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="chart-title">SEP-2026 Cost Component Breakdown</div>
                  <div className="chart-period">KG Cost vs Docket vs Stationary/Fuel vs GST</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sepSurchargePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      innerRadius={45}
                      paddingAngle={3}
                    >
                      {sepSurchargePieData.map(entry => (
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

            {/* September Destination Rate */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="chart-title">SEP-2026 Route Efficiency (₹/KG)</div>
                  <div className="chart-period">Average Cost per KG by Destination</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={sepDestChartData} layout="vertical">
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
                    {sepDestChartData.map(entry => (
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

          {/* September DataTable matching Sheet 2 */}
          <DataTable
            columns={tableColumns}
            rows={filteredShipments}
            defaultSortKey="sno"
            defaultSortDir="asc"
            pageSize={25}
          />
        </div>
      )}
    </>
  )
}
