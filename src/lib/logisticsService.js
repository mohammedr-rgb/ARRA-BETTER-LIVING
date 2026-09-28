import septemberShipments from '../data/septemberLogisticsData.json'
import { num } from './utils'

export const LOGISTICS_SHEET_ID = '1ISxAO1oyQwNXphmrH2m_le7A8BqDo2IJRJ78jJ1MjZU'
export const LOGISTICS_GIDS = {
  summary: '1904390094',
  september2026: '40975194',
}

// Exact Master Numbers from "Summery - overall logistics report" (gid 1904390094)
export const MASTER_LOGISTICS_SUMMARY = {
  carriers: {
    CXL: {
      name: 'CXL Logistics',
      tonnage: 46234.00,
      value: 415999.10,
      avgRate: 9.00,
      color: '#3b82f6',
      badge: 'Primary Carrier (Lowest Cost)',
      strengths: 'Economical high-volume routes (Chennai, Bangalore, Hyderabad)',
    },
    RIVIGO: {
      name: 'RIVIGO',
      tonnage: 15439.10,
      value: 326059.52,
      avgRate: 21.12,
      color: '#f97316',
      badge: 'Express & Long Haul',
      strengths: 'West & East routes (Mumbai, Pune, Goa, Cochin, Vizag, Hooghly)',
    },
    LCC: {
      name: 'LCC',
      tonnage: 1465.00,
      value: 19352.50,
      avgRate: 13.21,
      color: '#a855f7',
      badge: 'Regional Secondary',
      strengths: 'Direct regional quick distribution (Chennai, Cochin)',
    },
  },
  months: {
    July: {
      label: 'July 2026',
      tonnage: 15564.00,
      value: 184298.58,
      avgRate: 11.84,
      avgRateBase: 12.48,
      byCarrier: {
        CXL: { tonnage: 12355.00, value: 106264.00, rate: 8.60, rateSheet: 9.41 },
        RIVIGO: { tonnage: 3209.00, value: 78034.58, rate: 24.32, rateSheet: 24.32 },
        LCC: { tonnage: 0, value: 0, rate: 0, rateSheet: 0 },
      },
    },
    August: {
      label: 'August 2026',
      tonnage: 36383.00,
      value: 431704.50,
      avgRate: 11.87,
      avgRateBase: 11.87,
      isLowestRate: true,
      byCarrier: {
        CXL: { tonnage: 25651.00, value: 214945.50, rate: 8.38, rateSheet: 8.38 },
        RIVIGO: { tonnage: 10732.00, value: 216759.00, rate: 20.20, rateSheet: 20.20 },
        LCC: { tonnage: 0, value: 0, rate: 0, rateSheet: 0 },
      },
    },
    September: {
      label: 'September 2026',
      tonnage: 13573.00,
      tonnageBase: 12471.10,
      value: 173022.85,
      avgRate: 12.75,
      avgRateBase: 13.07,
      byCarrier: {
        CXL: { tonnage: 8228.00, value: 84789.60, rate: 10.31, rateSheet: 10.31 },
        RIVIGO: { tonnage: 1498.10, value: 31265.94, rate: 20.87, rateSheet: 20.87 },
        LCC: { tonnage: 1465.00, value: 19352.50, rate: 13.21, rateSheet: 13.21 },
      },
    },
  },
  overall: {
    totalTonnage: 63138.10,
    totalValue: 761411.12,
    avgRate: 12.06,
  },
  reasons: [
    {
      title: 'August 2026 (₹11.87 / kg - Lowest Rate)',
      desc: '70.5% of volume (25,651 kg) was consolidated via CXL at its lowest rate of ₹8.38/kg. Bulk dispatches minimized per-KG docket and handling overhead.',
      type: 'positive',
    },
    {
      title: 'September 2026 (₹13.07 / kg - Rate Rose)',
      desc: 'Rate increased due to smaller load batches, introducing LCC (₹13.21/kg), and a higher proportion of fixed docket/fuel charges relative to lower shipment weights.',
      type: 'warning',
    },
    {
      title: 'Carrier Cost Disparity (CXL ₹9.00 vs RIVIGO ₹21.12 / kg)',
      desc: 'RIVIGO is 2.35× higher in cost per KG due to fuel surcharges, appointment fees (₹1,000/drop), ODA charges, and long-distance coverage (Mumbai, Pune, Goa, Cochin, Vizag).',
      type: 'info',
    },
  ],
}

export function getSeptemberShipments() {
  return septemberShipments
}

export function computeSeptemberMetrics(shipments) {
  let totalTonnage = 0
  let totalCost = 0
  let totalKgCost = 0
  let totalDocket = 0
  let totalStationaryAndFuel = 0
  let totalValWithoutGst = 0
  let totalGst = 0
  let totalQty = 0

  const carrierMap = {}
  const destMap = {}

  for (const s of shipments) {
    const w = num(s.weight)
    const cost = num(s.overall)
    const qty = num(s.qty)
    const c = s.carrier || 'Other'
    const dest = (s.to || 'Unknown').trim()

    totalTonnage += w
    totalCost += cost
    totalQty += qty
    totalKgCost += num(s.kgCost)
    totalDocket += num(s.docket)
    totalStationaryAndFuel += num(s.stationaryAndFuel)
    totalValWithoutGst += num(s.valWithoutGST)
    totalGst += num(s.gst)

    // Carrier
    if (!carrierMap[c]) carrierMap[c] = { carrier: c, shipments: 0, tonnage: 0, cost: 0, qty: 0 }
    carrierMap[c].shipments += 1
    carrierMap[c].tonnage += w
    carrierMap[c].cost += cost
    carrierMap[c].qty += qty

    // Destination
    if (!destMap[dest]) destMap[dest] = { destination: dest, shipments: 0, tonnage: 0, cost: 0, qty: 0 }
    destMap[dest].shipments += 1
    destMap[dest].tonnage += w
    destMap[dest].cost += cost
    destMap[dest].qty += qty
  }

  const carriers = Object.values(carrierMap).map(x => ({
    ...x,
    avgRate: x.tonnage ? Math.round((x.cost / x.tonnage) * 100) / 100 : 0,
    volumeShare: totalTonnage ? Math.round((x.tonnage / totalTonnage) * 1000) / 10 : 0,
    costShare: totalCost ? Math.round((x.cost / totalCost) * 1000) / 10 : 0,
  })).sort((a, b) => b.tonnage - a.tonnage)

  const destinations = Object.values(destMap).map(x => ({
    ...x,
    avgRate: x.tonnage ? Math.round((x.cost / x.tonnage) * 100) / 100 : 0,
  })).sort((a, b) => b.tonnage - a.tonnage)

  return {
    totalShipments: shipments.length,
    totalTonnage: Math.round(totalTonnage * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalQty,
    avgRate: totalTonnage ? Math.round((totalCost / totalTonnage) * 100) / 100 : 0,
    breakdown: {
      kgCost: Math.round(totalKgCost),
      docket: Math.round(totalDocket),
      stationaryAndFuel: Math.round(totalStationaryAndFuel),
      valWithoutGST: Math.round(totalValWithoutGst),
      gst: Math.round(totalGst),
    },
    carriers,
    destinations,
  }
}
