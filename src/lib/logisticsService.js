import defaultShipments from '../data/logisticsData.json'
import { num } from './utils'

export const LOGISTICS_SHEET_ID = '1ISxAO1oyQwNXphmrH2m_le7A8BqDo2IJRJ78jJ1MjZU'
export const LOGISTICS_GIDS = {
  summary: '1904390094',
  cxlAugJuly: '0',
  septemberAll: '40975194',
  rivigoAugJuly: '1337918837',
}

// Canonical master numbers from the Google Sheet Summary tab
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
      strengths: 'Direct regional quick distribution',
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
        CXL: { tonnage: 12355.00, value: 106264.00, rate: 8.60 },
        RIVIGO: { tonnage: 3209.00, value: 78034.58, rate: 24.32 },
        LCC: { tonnage: 0, value: 0, rate: 0 },
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
        CXL: { tonnage: 25651.00, value: 214945.50, rate: 8.38 },
        RIVIGO: { tonnage: 10732.00, value: 216759.00, rate: 20.20 },
        LCC: { tonnage: 0, value: 0, rate: 0 },
      },
    },
    September: {
      label: 'September 2026',
      tonnage: 13573.00,
      value: 173022.85,
      avgRate: 12.75,
      avgRateBase: 13.07,
      byCarrier: {
        CXL: { tonnage: 8228.00, value: 84789.60, rate: 10.31 },
        RIVIGO: { tonnage: 1498.10, value: 31265.94, rate: 20.87 },
        LCC: { tonnage: 1465.00, value: 19352.50, rate: 13.21 },
      },
    },
  },
  overall: {
    totalTonnage: 63138.10,
    totalValue: 761411.12,
    avgRate: 12.06,
    totalShipments: defaultShipments.length,
  },
  reasons: [
    {
      title: 'Why August Had the Lowest Rate (₹11.87 / kg)',
      desc: 'August achieved the best cost efficiency because 70.5% of total volume (25,651 kg) was consolidated via CXL at its lowest rate of ₹8.38/kg. Bulk dispatches minimized per-KG docket and handling overhead.',
      type: 'positive',
    },
    {
      title: 'Why September Rate Rose (₹13.07 / kg)',
      desc: 'September rate increased due to smaller, fragmented batch sizes, introducing LCC (₹13.21/kg), and a higher proportion of fixed docket/fuel charges relative to lower shipment weights.',
      type: 'warning',
    },
    {
      title: 'Carrier Cost Disparity (CXL ₹9.00 vs RIVIGO ₹21.12 / kg)',
      desc: 'RIVIGO is 2.35× higher in cost per KG due to mandatory fuel surcharges (20%), fixed appointment charges (₹1,000/drop), ODA charges (₹800+), and long-distance coverage (Mumbai, Pune, Goa, Cochin, Vizag).',
      type: 'info',
    },
  ],
}

export function getInitialLogisticsData() {
  return defaultShipments
}

export function computeLogisticsMetrics(shipments) {
  let totalTonnage = 0
  let totalCost = 0
  let totalFreight = 0
  let totalDocket = 0
  let totalStationaryAndFuel = 0
  let totalAppointment = 0
  let totalInsurance = 0
  let totalOda = 0
  let totalGst = 0
  let totalQty = 0

  const carrierMap = {}
  const monthMap = {}
  const destMap = {}

  for (const s of shipments) {
    const w = num(s.weight)
    const cost = num(s.totalCost)
    const qty = num(s.qty)
    const c = s.carrier || 'Other'
    const m = s.month || 'Other'
    const dest = (s.to || 'Unknown').trim()

    totalTonnage += w
    totalCost += cost
    totalQty += qty
    totalFreight += num(s.freightAmount)
    totalDocket += num(s.docketCharges)
    totalStationaryAndFuel += num(s.stationaryAndFuel)
    totalAppointment += num(s.appointmentCharges)
    totalInsurance += num(s.insuranceCharges)
    totalOda += num(s.odaCharges)
    totalGst += num(s.gst)

    // Carrier
    if (!carrierMap[c]) carrierMap[c] = { carrier: c, shipments: 0, tonnage: 0, cost: 0, qty: 0 }
    carrierMap[c].shipments += 1
    carrierMap[c].tonnage += w
    carrierMap[c].cost += cost
    carrierMap[c].qty += qty

    // Month
    if (!monthMap[m]) monthMap[m] = { month: m, shipments: 0, tonnage: 0, cost: 0, qty: 0 }
    monthMap[m].shipments += 1
    monthMap[m].tonnage += w
    monthMap[m].cost += cost
    monthMap[m].qty += qty

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

  const months = Object.values(monthMap).map(x => ({
    ...x,
    avgRate: x.tonnage ? Math.round((x.cost / x.tonnage) * 100) / 100 : 0,
  }))

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
      freight: Math.round(totalFreight),
      docket: Math.round(totalDocket),
      fuelAndStationary: Math.round(totalStationaryAndFuel),
      appointment: Math.round(totalAppointment),
      insurance: Math.round(totalInsurance),
      oda: Math.round(totalOda),
      gst: Math.round(totalGst),
    },
    carriers,
    months,
    destinations,
  }
}
