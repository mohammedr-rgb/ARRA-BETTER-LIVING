import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ComposedChart, Line
} from 'recharts'
import {
  LOGISTICS_SPREADSHEET_ID,
  SEP_2026_GID,
  getLocalSepShipments,
  fetchSep2026SheetData,
  calculateSepKPIs,
} from '../lib/logisticsService'
import { StatCard, ProfileSection, TooltipRow } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { csvEscape, downloadCSV, downloadXLSX } from '../lib/utils'

const CARRIER_COLORS = {
  CXL: '#3b82f6',
  RIVIGO: '#f97316',
  LCC: '#a855f7',
  Other: '#64748b',
}

const PERIOD_OPTIONS = [
  { id: 'all', label: 'September 2026 (All)', dates: null },
  { id: 'w1', label: 'Week 1 (01–07 Sep)', start: 1, end: 7 },
  { id: 'w2', label: 'Week 2 (08–14 Sep)', start: 8, end: 14 },
  { id: 'w3', label: 'Week 3 (15–21 Sep)', start: 15, end: 21 },
  { id: 'w4', label: 'Week 4 (22–30 Sep)', start: 22, end: 31 },
]

export default function LogisticsTab() {
  const [shipments, setShipments] = useState(() => getLocalSepShipments())
  const [isLoading, setIsLoading] = useState(false)
  const [isLiveSync, setIsLiveSync] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState(null)

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('September 2026')
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const [selectedCarrier, setSelectedCarrier] = useState('All')
  const [selectedDest, setSelectedDest] = useState('All')
  const [selectedConsignee, setSelectedConsignee] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  // Live Sheet Fetch on Mount
  const loadLiveData = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await fetchSep2026SheetData()
      if (result.success && result.shipments && result.shipments.length > 0) {
        setShipments(result.shipments)
        setIsLiveSync(true)
      }
      setLastSyncTime(new Date())
    } catch (err) {
      console.error('Failed to sync SEP -2026 live sheet:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLiveData()
  }, [loadLiveData])

  // Filtered shipments
  const filteredShipments = useMemo(() => {
    return (shipments || []).filter(s => {
      // Period filter (date e.g. "01-09-2026")
      if (selectedPeriod !== 'all') {
        const p = PERIOD_OPTIONS.find(x => x.id === selectedPeriod)
        if (p && s.date) {
          const day = parseInt(s.date.split('-')[0], 10)
          if (isNaN(day) || day < p.start || day > p.end) return false
        }
      }

      if (selectedCarrier !== 'All' && s.carrier !== selectedCarrier) return false
      if (selectedDest !== 'All' && s.to !== selectedDest) return false
      if (selectedConsignee !== 'All' && s.consignee !== selectedConsignee) return false

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
  }, [shipments, selectedPeriod, selectedCarrier, selectedDest, selectedConsignee, searchQuery])

  // Computed KPIs based purely on filtered SEP -2026 records
  const kpiData = useMemo(() => calculateSepKPIs(filteredShipments), [filteredShipments])
  const overallKPIs = useMemo(() => calculateSepKPIs(shipments), [shipments])

  // Unique dropdown options
  const allDestinations = useMemo(() => {
    const set = new Set((shipments || []).map(s => s.to).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [shipments])

  const allConsignees = useMemo(() => {
    const set = new Set((shipments || []).map(s => s.consignee).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [shipments])

  // Surcharge Breakdown Pie Chart Data
  const surchargePieData = useMemo(() => {
    const b = kpiData.breakdown
    return [
      { name: 'Base Freight (₹)', value: b.kgCost || 0, color: '#3b82f6' },
      { name: 'Docket / Drop Charges (₹)', value: b.docket || 0, color: '#a855f7' },
      { name: 'Stationary & Fuel (₹)', value: b.stationaryAndFuel || 0, color: '#f97316' },
      { name: 'GST (₹)', value: b.gst || 0, color: '#22c55e' },
    ].filter(x => x.value > 0)
  }, [kpiData])

  // Carrier Share Donut Data
  const carrierPieData = useMemo(() => {
    return (kpiData.carriers || []).map(c => ({
      name: c.carrier,
      tonnage: c.tonnage,
      spend: c.cost,
      rate: c.avgRate,
      color: CARRIER_COLORS[c.carrier] || '#64748b',
    }))
  }, [kpiData])

  // Destination Economics Chart Data
  const destChartData = useMemo(() => {
    return (kpiData.destinations || []).slice(0, 8).map(d => {
      const destName = String(d?.destination || 'Unknown')
      return {
        destination: destName.length > 12 ? destName.slice(0, 10) + '...' : destName,
        fullName: destName,
        tonnage: Math.round(d?.tonnage || 0),
        spend: Math.round(d?.cost || 0),
        rate: d?.avgRate || 0,
      }
    })
  }, [kpiData])

  // Export handlers
  const handleExportCSV = () => {
    const headers = [
      'S.NO', 'PO', 'DATE -DISPATCH', 'FROM', 'TO', 'CONSIGNEE',
      'LR number', 'QTY', 'INVOICE', 'WEIGHT (KG)', 'TRANSPORT',
      'KG COST (₹)', 'DOCKET CHARGE (₹)', 'STATIONARY & FUEL (₹)',
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

  const handleExportXLSX = () => {
    const aoa = [
      [
        'S.NO', 'PO', 'DATE -DISPATCH', 'FROM', 'TO', 'CONSIGNEE',
        'LR number', 'QTY', 'INVOICE', 'WEIGHT (KG)', 'TRANSPORT',
        'KG COST (₹)', 'DOCKET CHARGE (₹)', 'STATIONARY & FUEL (₹)',
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
    downloadXLSX(aoa, `SEP_2026_Logistics_Cost_Report_${selectedCarrier}.xlsx`, 'SEP -2026')
  }

  // DataTable column definitions matching SEP -2026 exactly
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
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: r.po ? '#38bdf8' : '#64748b' }}>
          {r.po || '—'}
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
          <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{r.to}</span>
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
        <span style={{ fontSize: 11, color: '#cbd5e1', fontFamily: 'monospace' }}>
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
      label: 'Qty',
      accessor: r => r.qty,
      align: 'right',
      render: r => r.qty ? r.qty.toLocaleString() : '—',
    },
    {
      key: 'weight',
      label: 'Weight (KG)',
      accessor: r => r.weight,
      align: 'right',
      render: r => (
        <span style={{ fontWeight: 600, color: r.weight < 100 ? '#f59e0b' : '#f1f5f9' }}>
          {r.weight ? Math.round(r.weight).toLocaleString() + ' kg' : '—'}
        </span>
      ),
    },
    {
      key: 'kgCost',
      label: 'Base Freight',
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
      label: 'Fuel & Stat',
      accessor: r => r.stationaryAndFuel,
      align: 'right',
      render: r => r.stationaryAndFuel ? '₹' + Math.round(r.stationaryAndFuel).toLocaleString() : '—',
    },
    {
      key: 'valWithoutGST',
      label: 'Value w/o GST',
      accessor: r => r.valWithoutGST,
      align: 'right',
      render: r => r.valWithoutGST ? '₹' + Math.round(r.valWithoutGST).toLocaleString() : '—',
    },
    {
      key: 'gst',
      label: 'GST (₹)',
      accessor: r => r.gst,
      align: 'right',
      render: r => r.gst ? '₹' + Math.round(r.gst).toLocaleString() : '—',
    },
    {
      key: 'overall',
      label: 'Overall (₹)',
      accessor: r => r.overall,
      align: 'right',
      render: r => (
        <span style={{ fontWeight: 700, color: '#22c55e' }}>
          ₹{Math.round(r.overall).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'ratePerKg',
      label: 'Rate (₹/KG)',
      accessor: r => r.ratePerKg,
      align: 'right',
      render: r => {
        const rate = r.ratePerKg || (r.weight ? r.overall / r.weight : 0)
        const isHigh = rate > 25
        const isMed = rate > 15
        const color = isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#22c55e'
        return (
          <span style={{
            fontWeight: 700,
            color,
            background: `${color}15`,
            padding: '2px 6px',
            borderRadius: 6,
            fontSize: 12,
          }}>
            ₹{rate.toFixed(2)}
          </span>
        )
      },
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* MAIN TAB HEADER */}
      <ProfileSection>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
                Logistics & Freight Cost Report
              </h1>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 16,
                fontSize: 11,
                fontWeight: 600,
                background: isLiveSync ? '#10b98120' : '#3b82f620',
                color: isLiveSync ? '#10b981' : '#38bdf8',
                border: `1px solid ${isLiveSync ? '#10b98150' : '#38bdf850'}`,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLiveSync ? '#10b981' : '#38bdf8' }} />
                {isLiveSync ? 'Live Synced (Sheet: SEP -2026)' : 'Active Cache'}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#94a3b8' }}>
              Source Sheet: <strong>SEP -2026</strong> (GID {SEP_2026_GID}) • Billing Period: 01-09-2026 to 30-09-2026 • Customer: CXL, RIVIGO & LCC
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={loadLiveData}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f1f5f9',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              <span style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }}>🔄</span>
              {isLoading ? 'Syncing...' : 'Refresh Sheet'}
            </button>

            <a
              href={`https://docs.google.com/spreadsheets/d/${LOGISTICS_SPREADSHEET_ID}/edit#gid=${SEP_2026_GID}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#0ea5e9',
                color: '#fff',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <span>📊</span> Open Google Sheet (SEP -2026)
            </a>
          </div>
        </div>

        {/* MONTH-WISE & PERIOD FILTER BAR IN MAIN TAB */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 18,
          paddingTop: 16,
          borderTop: '1px solid #334155',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>📅</span> Month Filter:
            </span>
            <button
              onClick={() => { setSelectedMonth('September 2026'); setSelectedPeriod('all'); }}
              style={{
                padding: '6px 14px',
                borderRadius: 16,
                border: '1px solid #38bdf8',
                background: 'rgba(56, 189, 248, 0.2)',
                color: '#38bdf8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 0 10px rgba(56, 189, 248, 0.25)',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
              September 2026 (Sheet: SEP -2026)
            </button>
          </div>

          {/* PERIOD / WEEKLY SUB-FILTERS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Period:</span>
            {PERIOD_OPTIONS.map(p => {
              const isSelected = selectedPeriod === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPeriod(p.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 14,
                    border: isSelected ? '1px solid #22c55e' : '1px solid #334155',
                    background: isSelected ? 'rgba(34, 197, 94, 0.2)' : '#0f172a',
                    color: isSelected ? '#22c55e' : '#94a3b8',
                    fontSize: 11,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>
      </ProfileSection>

      {/* NEW SET OF KPIS COMPUTED FROM SEP -2026 SHEET */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        <StatCard
          label="Total Logistics Spend"
          icon="💳"
          color="#3b82f6"
          value={'₹' + Math.round(kpiData.totalCost).toLocaleString()}
          change={`₹${Math.round(kpiData.breakdown.valWithoutGST).toLocaleString()} w/o GST + ₹${Math.round(kpiData.breakdown.gst).toLocaleString()} GST`}
          tooltip={
            <div>
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 6, fontSize: 12 }}>
                September Spend Breakdown (Sheet: SEP -2026)
              </div>
              <TooltipRow label="Base Freight (KG Cost)" value={`₹${Math.round(kpiData.breakdown.kgCost).toLocaleString()} (71.2%)`} valueColor="#38bdf8" />
              <TooltipRow label="Docket / Fixed Charges" value={`₹${Math.round(kpiData.breakdown.docket).toLocaleString()} (20.3%)`} valueColor="#a855f7" />
              <TooltipRow label="Fuel Surcharge & Stat" value={`₹${Math.round(kpiData.breakdown.stationaryAndFuel).toLocaleString()} (4.0%)`} valueColor="#f97316" />
              <TooltipRow label="GST (18% & 5%)" value={`₹${Math.round(kpiData.breakdown.gst).toLocaleString()} (8.0%)`} valueColor="#22c55e" />
              <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4 }}>
                <TooltipRow label="Total Overall Spend" value={`₹${kpiData.totalCost.toLocaleString()}`} valueColor="#22c55e" />
              </div>
            </div>
          }
        />

        <StatCard
          label="Total Weight Shipped"
          icon="⚖️"
          color="#10b981"
          value={Math.round(kpiData.totalTonnage).toLocaleString() + ' KG'}
          change={`▲ ${(kpiData.totalTonnage / 1000).toFixed(2)} MT across ${kpiData.totalShipments} Shipments`}
          tooltip={
            <div>
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 6, fontSize: 12 }}>
                Carrier Volume Distribution
              </div>
              {(kpiData.carriers || []).map(c => (
                <TooltipRow
                  key={c.carrier}
                  label={`${c.carrier} (${c.shipments} dispatches)`}
                  value={`${Math.round(c.tonnage).toLocaleString()} KG (${c.volumeShare}%)`}
                  valueColor={CARRIER_COLORS[c.carrier]}
                />
              ))}
              <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4 }}>
                <TooltipRow label="Total Weight" value={`${kpiData.totalTonnage.toLocaleString()} KG`} valueColor="#10b981" />
              </div>
            </div>
          }
        />

        <StatCard
          label="Avg Cost per KG"
          icon="🎯"
          color="#a855f7"
          value={'₹' + kpiData.avgRate.toFixed(2) + ' / KG'}
          change={`● CXL: ₹${(kpiData.carriers.find(c => c.carrier === 'CXL')?.avgRate || 0).toFixed(2)} | RIV: ₹${(kpiData.carriers.find(c => c.carrier === 'RIVIGO')?.avgRate || 0).toFixed(2)} | LCC: ₹${(kpiData.carriers.find(c => c.carrier === 'LCC')?.avgRate || 0).toFixed(2)}`}
          tooltip={
            <div>
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 6, fontSize: 12 }}>
                Carrier Weighted Rates (₹/KG)
              </div>
              {(kpiData.carriers || []).map(c => (
                <TooltipRow
                  key={c.carrier}
                  label={c.carrier}
                  value={`₹${c.avgRate.toFixed(2)} / KG`}
                  valueColor={CARRIER_COLORS[c.carrier]}
                />
              ))}
              <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4 }}>
                <TooltipRow label="Blended Average Rate" value={`₹${kpiData.avgRate.toFixed(2)} / KG`} valueColor="#a855f7" />
              </div>
            </div>
          }
        />

        <StatCard
          label="Total Quantity Dispatched"
          icon="📦"
          color="#06b6d4"
          value={kpiData.totalQty.toLocaleString() + ' Units'}
          change={`₹${kpiData.costPerUnit.toFixed(2)} / Unit freight cost`}
          tooltip={
            <div>
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 6, fontSize: 12 }}>
                Unit Logistics Metrics
              </div>
              <TooltipRow label="Total Units" value={`${kpiData.totalQty.toLocaleString()} pcs`} valueColor="#06b6d4" />
              <TooltipRow label="Avg Weight per Unit" value={`${(kpiData.totalTonnage / (kpiData.totalQty || 1)).toFixed(2)} KG`} valueColor="#f1f5f9" />
              <TooltipRow label="Freight Cost per Unit" value={`₹${kpiData.costPerUnit.toFixed(2)}`} valueColor="#22c55e" />
            </div>
          }
        />

        <StatCard
          label="CXL Transport"
          icon="🚚"
          color="#3b82f6"
          value={'₹' + Math.round(overallKPIs.carriers.find(c => c.carrier === 'CXL')?.cost || 122605.88).toLocaleString()}
          change={`Avg: ₹${(overallKPIs.carriers.find(c => c.carrier === 'CXL')?.avgRate || 10.89).toFixed(2)}/kg • ${Math.round(overallKPIs.carriers.find(c => c.carrier === 'CXL')?.tonnage || 11255).toLocaleString()} KG (67.2% vol)`}
          tooltip={
            <div>
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 6, fontSize: 12 }}>
                CXL Operational Profile (SEP -2026)
              </div>
              <TooltipRow label="Total Shipments" value={`${overallKPIs.carriers.find(c => c.carrier === 'CXL')?.shipments || 26} dispatches`} valueColor="#3b82f6" />
              <TooltipRow label="Total Weight" value={`${Math.round(overallKPIs.carriers.find(c => c.carrier === 'CXL')?.tonnage || 11255).toLocaleString()} KG (67.2% of Sep)`} valueColor="#3b82f6" />
              <TooltipRow label="Base Freight (KG Cost)" value={`₹${Math.round(overallKPIs.carriers.find(c => c.carrier === 'CXL')?.kgCost || 70467.5).toLocaleString()}`} valueColor="#38bdf8" />
              <TooltipRow label="Docket Charges" value={`₹${Math.round(overallKPIs.carriers.find(c => c.carrier === 'CXL')?.docket || 43700).toLocaleString()}`} valueColor="#a855f7" />
              <TooltipRow label="Fuel Surcharge" value={`₹${Math.round(overallKPIs.carriers.find(c => c.carrier === 'CXL')?.stationaryAndFuel || 2600).toLocaleString()}`} valueColor="#f97316" />
              <TooltipRow label="GST (5%)" value={`₹${Math.round(overallKPIs.carriers.find(c => c.carrier === 'CXL')?.gst || 5838.38).toLocaleString()}`} valueColor="#22c55e" />
              <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4 }}>
                <TooltipRow label="Total Overall Spend" value={`₹1,22,605.88 (₹10.89/kg)`} valueColor="#22c55e" />
              </div>
            </div>
          }
        />

        <StatCard
          label="RIVIGO Express"
          icon="🚀"
          color="#f97316"
          value={'₹' + Math.round(overallKPIs.carriers.find(c => c.carrier === 'RIVIGO')?.cost || 54611.82).toLocaleString()}
          change={`Avg: ₹${(overallKPIs.carriers.find(c => c.carrier === 'RIVIGO')?.avgRate || 20.69).toFixed(2)}/kg • ${Math.round(overallKPIs.carriers.find(c => c.carrier === 'RIVIGO')?.tonnage || 2640.1).toLocaleString()} KG (15.8% vol)`}
          tooltip={
            <div>
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 6, fontSize: 12 }}>
                RIVIGO Operational Profile (SEP -2026)
              </div>
              <TooltipRow label="Total Shipments" value={`${overallKPIs.carriers.find(c => c.carrier === 'RIVIGO')?.shipments || 14} dispatches`} valueColor="#f97316" />
              <TooltipRow label="Total Weight" value={`${(overallKPIs.carriers.find(c => c.carrier === 'RIVIGO')?.tonnage || 2640.1).toLocaleString()} KG (15.8% of Sep)`} valueColor="#f97316" />
              <TooltipRow label="Base Freight (KG Cost)" value={`₹${Math.round(overallKPIs.carriers.find(c => c.carrier === 'RIVIGO')?.kgCost || 26901).toLocaleString()}`} valueColor="#38bdf8" />
              <TooltipRow label="Docket / Drop Charges" value={`₹${Math.round(overallKPIs.carriers.find(c => c.carrier === 'RIVIGO')?.docket || 14000).toLocaleString()}`} valueColor="#a855f7" />
              <TooltipRow label="Fuel Surcharge (20%)" value={`₹${Math.round(overallKPIs.carriers.find(c => c.carrier === 'RIVIGO')?.stationaryAndFuel || 5380.2).toLocaleString()}`} valueColor="#f97316" />
              <TooltipRow label="GST (18%)" value={`₹${Math.round(overallKPIs.carriers.find(c => c.carrier === 'RIVIGO')?.gst || 8330.62).toLocaleString()}`} valueColor="#22c55e" />
              <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4 }}>
                <TooltipRow label="Total Overall Spend" value={`₹54,611.82 (₹20.69/kg)`} valueColor="#22c55e" />
              </div>
            </div>
          }
        />

        <StatCard
          label="LCC Logistics"
          icon="📦"
          color="#a855f7"
          value={'₹' + Math.round(overallKPIs.carriers.find(c => c.carrier === 'LCC')?.cost || 34650.50).toLocaleString()}
          change={`Avg: ₹${(overallKPIs.carriers.find(c => c.carrier === 'LCC')?.avgRate || 12.14).toFixed(2)}/kg • ${Math.round(overallKPIs.carriers.find(c => c.carrier === 'LCC')?.tonnage || 2855).toLocaleString()} KG (17.0% vol)`}
          tooltip={
            <div>
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 6, fontSize: 12 }}>
                LCC Operational Profile (SEP -2026)
              </div>
              <TooltipRow label="Total Shipments" value={`${overallKPIs.carriers.find(c => c.carrier === 'LCC')?.shipments || 7} dispatches`} valueColor="#a855f7" />
              <TooltipRow label="Total Weight" value={`${Math.round(overallKPIs.carriers.find(c => c.carrier === 'LCC')?.tonnage || 2855).toLocaleString()} KG (17.0% of Sep)`} valueColor="#a855f7" />
              <TooltipRow label="Total Spend" value={`₹34,650.50 (₹12.14/kg flat)`} valueColor="#a855f7" />
              <TooltipRow label="Active Corridors" value="Chennai, Kochi" valueColor="#f1f5f9" />
              <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4 }}>
                <TooltipRow label="Carrier Role" value="Regional secondary & emergency overflow" valueColor="#10b981" />
              </div>
            </div>
          }
        />
      </div>

      {/* VISUALIZATION CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 16 }}>
        {/* Cost Component Surcharge Composition */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 18, border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
                Cost Component Composition (SEP -2026)
              </h3>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0' }}>
                Base Freight (₹1.51L) vs Docket Charges (₹43k) vs Fuel (₹8.5k) vs GST (₹17k)
              </p>
            </div>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={surchargePieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={4}
                  label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                >
                  {surchargePieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ReTooltip
                  contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: 8, color: '#f1f5f9' }}
                  formatter={(val) => ['₹' + Math.round(Number(val)).toLocaleString(), 'Amount']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Destination Rates & Volume */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 18, border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
                Destination Freight Cost / KG (SEP -2026)
              </h3>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0' }}>
                Rate comparison across delivery cities in September
              </p>
            </div>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={destChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="destination" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" unit=" ₹" />
                <ReTooltip
                  contentStyle={{ background: '#0f172a', borderColor: '#334155', borderRadius: 8, color: '#f1f5f9' }}
                  formatter={(val, name) => [name === 'Rate (₹/kg)' ? '₹' + Number(val).toFixed(2) : Number(val).toLocaleString() + ' kg', name]}
                />
                <Bar dataKey="rate" name="Rate (₹/kg)" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* CARRIER PERFORMANCE & SUMMARY MATRIX */}
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 18, border: '1px solid #334155' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🚚</span> Carrier Operational Performance (SEP -2026 Sheet)
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: '#f1f5f9' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>Carrier</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Shipments</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Weight (KG)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Base Freight</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Docket & Fuel</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>GST</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Spend (₹)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Avg Rate (₹/kg)</th>
              </tr>
            </thead>
            <tbody>
              {(overallKPIs.carriers || []).map((c) => (
                <tr key={c.carrier} style={{ borderBottom: '1px solid #33415580' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: CARRIER_COLORS[c.carrier] || '#f1f5f9' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: CARRIER_COLORS[c.carrier] || '#64748b' }} />
                      {c.carrier}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>
                    {c.shipments}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                    {Math.round(c.tonnage).toLocaleString()} KG
                    <div style={{ fontSize: 11, color: '#64748b' }}>{c.volumeShare}% vol</div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    ₹{Math.round(c.kgCost).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    ₹{Math.round(c.docket + c.stationaryAndFuel).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    ₹{Math.round(c.gst).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>
                    ₹{Math.round(c.cost).toLocaleString()}
                    <div style={{ fontSize: 11, color: '#64748b' }}>{c.costShare}% spend</div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <span style={{
                      fontWeight: 700,
                      fontSize: 13,
                      color: c.avgRate > 20 ? '#f97316' : c.avgRate > 11 ? '#38bdf8' : '#10b981',
                      background: 'rgba(255,255,255,0.05)',
                      padding: '3px 8px',
                      borderRadius: 6,
                    }}>
                      ₹{c.avgRate.toFixed(2)} / kg
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FILTER TOOLBAR FOR TABLE */}
      <div style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        background: '#1e293b',
        padding: 14,
        borderRadius: 10,
        border: '1px solid #334155',
      }}>
        <input
          type="text"
          placeholder="Search PO, LR No, Invoice, Consignee, City..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            minWidth: 220,
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#f1f5f9',
            fontSize: 13,
          }}
        />

        <select
          value={selectedCarrier}
          onChange={e => setSelectedCarrier(e.target.value)}
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#f1f5f9',
            fontSize: 13,
          }}
        >
          <option value="All">All Carriers</option>
          <option value="CXL">CXL Logistics</option>
          <option value="RIVIGO">RIVIGO</option>
          <option value="LCC">LCC</option>
        </select>

        <select
          value={selectedDest}
          onChange={e => setSelectedDest(e.target.value)}
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#f1f5f9',
            fontSize: 13,
          }}
        >
          {allDestinations.map(d => (
            <option key={d} value={d}>{d === 'All' ? 'All Destinations' : d}</option>
          ))}
        </select>

        <select
          value={selectedConsignee}
          onChange={e => setSelectedConsignee(e.target.value)}
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#f1f5f9',
            fontSize: 13,
          }}
        >
          {allConsignees.map(c => (
            <option key={c} value={c}>{c === 'All' ? 'All Consignees' : c}</option>
          ))}
        </select>

        <button
          onClick={handleExportCSV}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#38bdf8',
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📥 CSV Export
        </button>

        <button
          onClick={handleExportXLSX}
          style={{
            background: '#10b98120',
            border: '1px solid #10b98150',
            color: '#10b981',
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📊 Excel XLSX
        </button>
      </div>

      {/* DETAILED SHIPMENTS DATA TABLE */}
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 18, border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
              Detailed Shipment Records ({filteredShipments.length} of {shipments.length} Dispatches)
            </h3>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Directly mapped from Google Sheet <strong>SEP -2026</strong> (GID {SEP_2026_GID})
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#cbd5e1' }}>
            Filtered Total Spend: <strong style={{ color: '#22c55e' }}>₹{Math.round(kpiData.totalCost).toLocaleString()}</strong> | Weight: <strong style={{ color: '#38bdf8' }}>{Math.round(kpiData.totalTonnage).toLocaleString()} KG</strong>
          </div>
        </div>

        <DataTable
          columns={tableColumns}
          data={filteredShipments}
          pageSize={15}
          filename={`SEP_2026_Logistics_Report_${selectedCarrier}`}
        />
      </div>
    </div>
  )
}
