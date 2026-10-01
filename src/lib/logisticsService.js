import rawSeptemberData from '../data/septemberLogisticsData.json'
import { num } from './utils'

export const LOGISTICS_SPREADSHEET_ID = '1ISxAO1oyQwNXphmrH2m_le7A8BqDo2IJRJ78jJ1MjZU'
export const SEP_2026_GID = '40975194'

// Parse multi-line CSV with proper quote handling
function parseRawCSVToRows(text) {
  const s = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const records = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(field.trim()); field = '' }
      else if (ch === '\n') {
        row.push(field.trim())
        field = ''
        if (row.some(v => v !== '')) records.push(row)
        row = []
      } else field += ch
    }
  }
  row.push(field.trim())
  if (row.some(v => v !== '')) records.push(row)
  return records
}

export function getLocalSepShipments() {
  return rawSeptemberData || []
}

// Fetch and accurately parse sheet "SEP -2026" (GID 40975194)
export async function fetchSep2026SheetData() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${LOGISTICS_SPREADSHEET_ID}/export?format=csv&gid=${SEP_2026_GID}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const allRows = parseRawCSVToRows(text)

    if (!allRows || allRows.length <= 1) {
      throw new Error('No data rows found in SEP -2026 sheet')
    }

    // Find actual header row index (row containing 'S.NO' or 'TRANSPORT')
    const headerIdx = allRows.findIndex(r => r.some(c => String(c).toUpperCase() === 'S.NO' || String(c).toUpperCase() === 'TRANSPORT'))
    if (headerIdx === -1) {
      throw new Error('Header row not found in sheet')
    }

    const header = allRows[headerIdx].map(h => String(h).trim().toUpperCase())

    const colIdx = {
      sno: header.findIndex(h => h === 'S.NO' || h === 'SN'),
      po: header.findIndex(h => h === 'PO'),
      date: header.findIndex(h => h.includes('DATE')),
      from: header.findIndex(h => h === 'FROM'),
      to: header.findIndex(h => h === 'TO'),
      consignee: header.findIndex(h => h === 'CONSIGNEE'),
      lrNo: header.findIndex(h => h.includes('LR')),
      qty: header.findIndex(h => h === 'QTY'),
      invoice: header.findIndex(h => h === 'INVOICE'),
      weight: header.findIndex(h => h.includes('WEIGHT') || h === 'WGT.'),
      carrier: header.findIndex(h => h.includes('TRANSPORT') || h === 'CARRIER'),
      kgCost: header.findIndex(h => h.includes('KG COST') || h === 'FREIGHT'),
      docket: header.findIndex(h => h.includes('DOCKET') || h.includes('D/D')),
      stationaryAndFuel: header.findIndex(h => h.includes('STATIONARY') || h.includes('FUEL')),
      valWithoutGST: header.findIndex(h => h.includes('WITHOUT GST')),
      gst: header.findIndex(h => h === 'GST'),
      overall: header.findIndex(h => h.includes('OVERALL') || h === 'TOTAL'),
    }

    const parsed = []
    for (let i = headerIdx + 1; i < allRows.length; i++) {
      const r = allRows[i]
      const snoVal = r[colIdx.sno]
      if (!snoVal || isNaN(parseInt(snoVal, 10))) continue

      const sno = parseInt(snoVal, 10)
      const weight = num(r[colIdx.weight])
      const overall = num(r[colIdx.overall])
      const carrier = (r[colIdx.carrier] || 'Unknown').trim()
      const rate = weight > 0 ? Math.round((overall / weight) * 100) / 100 : 0

      parsed.push({
        sno,
        id: `SEP-${sno}-${r[colIdx.lrNo] || r[colIdx.invoice] || i}`,
        po: (r[colIdx.po] || '').trim(),
        date: (r[colIdx.date] || '').trim(),
        from: (r[colIdx.from] || 'Coimbatore-TR').trim(),
        to: (r[colIdx.to] || '').trim(),
        consignee: (r[colIdx.consignee] || '').trim(),
        lrNo: (r[colIdx.lrNo] || '').trim(),
        qty: num(r[colIdx.qty]),
        invoice: (r[colIdx.invoice] || '').trim(),
        weight,
        carrier,
        kgCost: num(r[colIdx.kgCost]),
        docket: num(r[colIdx.docket]),
        stationaryAndFuel: num(r[colIdx.stationaryAndFuel]),
        valWithoutGST: num(r[colIdx.valWithoutGST]),
        gst: num(r[colIdx.gst]),
        overall,
        ratePerKg: rate,
      })
    }

    return {
      success: true,
      shipments: parsed.length > 0 ? parsed : rawSeptemberData,
      source: 'Google Sheet (SEP -2026 / GID 40975194)',
      timestamp: new Date().toISOString(),
    }
  } catch (err) {
    console.warn('Fallback to local SEP -2026 dataset:', err)
    return {
      success: false,
      shipments: rawSeptemberData,
      source: 'Local Cache (SEP -2026)',
      timestamp: new Date().toISOString(),
      error: err.message,
    }
  }
}

// Compute comprehensive KPI metrics purely from SEP -2026 records
export function calculateSepKPIs(shipments = []) {
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
  const consigneeMap = {}
  const dateMap = {}

  for (const s of shipments) {
    const w = num(s.weight)
    const cost = num(s.overall)
    const qty = num(s.qty)
    const c = (s.carrier || 'Other').trim()
    const dest = (s.to || 'Unknown').trim()
    const consignee = (s.consignee || 'Unknown').trim()
    const dateStr = s.date || 'Unknown'

    totalTonnage += w
    totalCost += cost
    totalQty += qty
    totalKgCost += num(s.kgCost)
    totalDocket += num(s.docket)
    totalStationaryAndFuel += num(s.stationaryAndFuel)
    totalValWithoutGst += num(s.valWithoutGST)
    totalGst += num(s.gst)

    // Carrier
    if (!carrierMap[c]) {
      carrierMap[c] = {
        carrier: c,
        shipments: 0,
        tonnage: 0,
        cost: 0,
        qty: 0,
        kgCost: 0,
        docket: 0,
        stationaryAndFuel: 0,
        gst: 0,
      }
    }
    carrierMap[c].shipments += 1
    carrierMap[c].tonnage += w
    carrierMap[c].cost += cost
    carrierMap[c].qty += qty
    carrierMap[c].kgCost += num(s.kgCost)
    carrierMap[c].docket += num(s.docket)
    carrierMap[c].stationaryAndFuel += num(s.stationaryAndFuel)
    carrierMap[c].gst += num(s.gst)

    // Destination
    if (!destMap[dest]) {
      destMap[dest] = {
        destination: dest,
        shipments: 0,
        tonnage: 0,
        cost: 0,
        qty: 0,
        carriers: new Set(),
      }
    }
    destMap[dest].shipments += 1
    destMap[dest].tonnage += w
    destMap[dest].cost += cost
    destMap[dest].qty += qty
    destMap[dest].carriers.add(c)

    // Consignee
    if (!consigneeMap[consignee]) {
      consigneeMap[consignee] = {
        consignee: consignee,
        shipments: 0,
        tonnage: 0,
        cost: 0,
        qty: 0,
      }
    }
    consigneeMap[consignee].shipments += 1
    consigneeMap[consignee].tonnage += w
    consigneeMap[consignee].cost += cost
    consigneeMap[consignee].qty += qty

    // Date
    if (!dateMap[dateStr]) {
      dateMap[dateStr] = { date: dateStr, tonnage: 0, cost: 0, shipments: 0 }
    }
    dateMap[dateStr].tonnage += w
    dateMap[dateStr].cost += cost
    dateMap[dateStr].shipments += 1
  }

  const carriers = Object.values(carrierMap).map(x => ({
    ...x,
    avgRate: x.tonnage ? Math.round((x.cost / x.tonnage) * 100) / 100 : 0,
    volumeShare: totalTonnage ? Math.round((x.tonnage / totalTonnage) * 1000) / 10 : 0,
    costShare: totalCost ? Math.round((x.cost / totalCost) * 1000) / 10 : 0,
    avgShipmentWeight: x.shipments ? Math.round(x.tonnage / x.shipments) : 0,
  })).sort((a, b) => b.tonnage - a.tonnage)

  const destinations = Object.values(destMap).map(x => ({
    ...x,
    carrierList: Array.from(x.carriers).join(', '),
    avgRate: x.tonnage ? Math.round((x.cost / x.tonnage) * 100) / 100 : 0,
    volumeShare: totalTonnage ? Math.round((x.tonnage / totalTonnage) * 1000) / 10 : 0,
    costShare: totalCost ? Math.round((x.cost / totalCost) * 1000) / 10 : 0,
  })).sort((a, b) => b.tonnage - a.tonnage)

  const consignees = Object.values(consigneeMap).map(x => ({
    ...x,
    avgRate: x.tonnage ? Math.round((x.cost / x.tonnage) * 100) / 100 : 0,
  })).sort((a, b) => b.cost - a.cost)

  const dateTimeline = Object.values(dateMap)

  return {
    totalShipments: shipments.length,
    totalTonnage: Math.round(totalTonnage * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalQty,
    avgRate: totalTonnage ? Math.round((totalCost / totalTonnage) * 100) / 100 : 0,
    costPerUnit: totalQty ? Math.round((totalCost / totalQty) * 100) / 100 : 0,
    breakdown: {
      kgCost: Math.round(totalKgCost * 100) / 100,
      docket: Math.round(totalDocket * 100) / 100,
      stationaryAndFuel: Math.round(totalStationaryAndFuel * 100) / 100,
      valWithoutGST: Math.round(totalValWithoutGst * 100) / 100,
      gst: Math.round(totalGst * 100) / 100,
    },
    carriers,
    destinations,
    consignees,
    dateTimeline,
  }
}
