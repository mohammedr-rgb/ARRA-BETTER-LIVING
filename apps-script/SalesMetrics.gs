/**
 * Public, read-only metrics endpoint for the ARRA sales dashboard.
 * The workbook stays private. Only the aggregate fields currently shown on
 * the public dashboard are returned; source sheet rows are never serialized.
 * Deploy as a web app that executes as the owner and is accessible to anyone.
 */
const SALES_SPREADSHEET_ID = '1auxWTw7MntZdYHNb8hZZqWvG3WVQ60BS5Jz2-8kYcWE'
const SALES_SHEET_NAMES = ['Overall sales', 'Ads Spend', 'Logistics']
const SALES_CACHE_KEY = 'arra_sales_metrics_v1'
const SALES_CACHE_SECONDS = 300

function doGet(e) {
  const callback = String(e && e.parameter && e.parameter.callback || '')
  if (!/^__salesMetricsCb_[A-Za-z0-9_]+$/.test(callback)) {
    return ContentService.createTextOutput('Invalid callback').setMimeType(ContentService.MimeType.TEXT)
  }

  try {
    const cache = CacheService.getScriptCache()
    let serialized = cache.get(SALES_CACHE_KEY)
    if (!serialized) {
      serialized = JSON.stringify(buildSalesMetrics_())
      cache.put(SALES_CACHE_KEY, serialized, SALES_CACHE_SECONDS)
    }
    return ContentService.createTextOutput('window.' + callback + '(' + serialized + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT)
  } catch (error) {
    // Do not return exception text or spreadsheet contents to a public caller.
    const safeError = JSON.stringify({ schemaVersion: 1, error: 'Sales metrics are temporarily unavailable.' })
    return ContentService.createTextOutput('window.' + callback + '(' + safeError + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT)
  }
}

function buildSalesMetrics_() {
  const workbook = SpreadsheetApp.openById(SALES_SPREADSHEET_ID)
  const grids = SALES_SHEET_NAMES.map(name => {
    const sheet = workbook.getSheetByName(name)
    if (!sheet) throw new Error('Required tab is missing')
    return sheet.getDataRange().getDisplayValues()
  })
  const [overall, ads, logistics] = grids

  if (!(overall[0] || []).some(value => String(value).includes('GMV Nov MTD'))) {
    throw new Error('Overall sales header did not match')
  }
  if (!(ads[0] || []).some(value => String(value).toLowerCase().includes('metric'))) {
    throw new Error('Ads Spend header did not match')
  }
  if (!logistics.some(row => salesCell_(row, 0) === 'Month' && salesCell_(row, 1) === 'Shipment Weight (kg)')) {
    throw new Error('Logistics header did not match')
  }

  const overallHeaders = overall[0] || []
  const totalRowIndex = overall.findIndex(row => ['Combined', 'All-platform total'].includes(salesCell_(row, 0)))
  const summaryRows = overall.slice(1, totalRowIndex >= 0 ? totalRowIndex + 1 : 6)
    .filter(row => salesCell_(row, 0) && !salesCell_(row, 0).startsWith('MoM basis') && !salesCell_(row, 0).startsWith('Source columns'))
  const summaryValue = (row, label) => {
    const index = overallHeaders.findIndex(header => String(header).trim().toLowerCase() === label.toLowerCase())
    return index >= 0 ? salesOptionalNumber_(salesCell_(row, index)) : null
  }

  const platformRows = summaryRows.map(row => ({
    platform: salesCell_(row, 0),
    gmvSep: summaryValue(row, 'GMV Sep'),
    gmvOct: summaryValue(row, 'GMV Oct'),
    gmvOctGrowth: summaryValue(row, 'GMV Oct/Sep %'),
    gmvNov: summaryValue(row, 'GMV Nov MTD'),
    gmvNovGrowth: summaryValue(row, 'GMV Nov/Oct MTD %'),
    invoiceSep: summaryValue(row, 'Invoice Sep'),
    invoiceOct: summaryValue(row, 'Invoice Oct'),
    invoiceNov: summaryValue(row, 'Invoice Nov MTD'),
    purchaseSep: summaryValue(row, 'Purchase cost Sep'),
    purchaseOct: summaryValue(row, 'Purchase cost Oct'),
    purchaseNov: summaryValue(row, 'Purchase cost Nov MTD'),
    netSep: summaryValue(row, 'Net Sep'),
    netOct: summaryValue(row, 'Net Oct'),
    netNov: summaryValue(row, 'Net Nov MTD'),
    netNovGrowth: summaryValue(row, 'Net Nov/Oct MTD %'),
    isTotal: ['Combined', 'All-platform total'].includes(salesCell_(row, 0)),
  }))
  const total = platformRows.find(row => row.isTotal) || platformRows[platformRows.length - 1] || {}
  const title = salesCell_(overallHeaders, 0)
  const cutoffMatch = title.match(/November MTD through ([^.]+)/i)
  const cutoff = cutoffMatch ? cutoffMatch[1].trim() : 'current source cutoff'
  const salesTrend = [
    { month: 'September', GMV: total.gmvSep ?? 0, Invoice: total.invoiceSep ?? 0, 'Purchase cost': total.purchaseSep ?? 0, 'Source net': total.netSep ?? 0 },
    { month: 'October', GMV: total.gmvOct ?? 0, Invoice: total.invoiceOct ?? 0, 'Purchase cost': total.purchaseOct ?? 0, 'Source net': total.netOct ?? 0 },
    { month: 'November MTD', GMV: total.gmvNov ?? 0, Invoice: total.invoiceNov ?? 0, 'Purchase cost': total.purchaseNov ?? 0, 'Source net': total.netNov ?? 0 },
  ]

  const adsHeaders = ads[0] || []
  const periods = adsHeaders.slice(2).map(value => String(value || '').trim()).filter(Boolean)
  const adRows = ads.slice(1).filter(row => salesCell_(row, 0) || salesCell_(row, 1)).map(row => {
    const platform = salesCell_(row, 0)
    const metric = salesCell_(row, 1) || (platform === 'Ads spend Overall' ? 'Total ad spend' : 'Spend')
    return {
      platform,
      metric,
      isPercent: metric.includes('%'),
      values: periods.map((_, index) => salesOptionalNumber_(salesCell_(row, index + 2))),
    }
  })
  const totalAds = adRows.find(row => row.platform.toLowerCase() === 'ads spend overall')
  let latestAdsIndex = -1
  if (totalAds) {
    for (let i = totalAds.values.length - 1; i >= 0; i--) {
      if (totalAds.values[i] !== null) { latestAdsIndex = i; break }
    }
  }

  const monthlyHeaderIndex = logistics.findIndex(row => salesCell_(row, 0) === 'Month' && salesCell_(row, 1) === 'Shipment Weight (kg)')
  const logisticsRows = []
  for (let i = monthlyHeaderIndex + 1; i < logistics.length; i++) {
    const row = logistics[i]
    const month = salesCell_(row, 0)
    if (!month || !/^(May|June|July|August|September|October|November|December)$/i.test(month)) break
    logisticsRows.push({
      month,
      weight: salesOptionalNumber_(salesCell_(row, 1)),
      cost: salesOptionalNumber_(salesCell_(row, 2)),
      costGrowth: salesOptionalNumber_(salesCell_(row, 3)),
      rate: salesOptionalNumber_(salesCell_(row, 4)),
    })
  }
  const carrierRows = logistics.slice(1)
    .filter(row => salesCell_(row, 20) && salesCell_(row, 20).toUpperCase() !== 'GRAND TOTAL')
    .map(row => ({
      carrier: salesCell_(row, 20),
      weight: salesOptionalNumber_(salesCell_(row, 21)),
      cost: salesOptionalNumber_(salesCell_(row, 22)),
      rate: salesOptionalNumber_(salesCell_(row, 23)),
    }))
    .filter(row => row.weight !== null || row.cost !== null)

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    platformRows,
    total,
    cutoff,
    salesTrend,
    adRows,
    periods,
    latestAdsPeriod: latestAdsIndex >= 0 ? periods[latestAdsIndex] : 'No total reported',
    latestAdsSpend: latestAdsIndex >= 0 ? totalAds.values[latestAdsIndex] : null,
    logisticsRows,
    latestLogistics: logisticsRows[logisticsRows.length - 1] || null,
    carrierRows,
    logisticsHeader: (logistics[0] || []).slice(15),
    sourceRows: SALES_SHEET_NAMES.map((source, index) => ({ source, rows: Math.max(0, grids[index].length - 1) })),
  }
}

function salesCell_(row, index) {
  return String((row && row[index]) ?? '').trim()
}

function salesOptionalNumber_(value) {
  const text = String(value ?? '').trim()
  if (!text || text === '—' || text === '-') return null
  const cleaned = text.replace(/[₹,%\s]/g, '').replace(/,/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}
