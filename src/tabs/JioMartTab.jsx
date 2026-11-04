import { useCallback, useEffect, useMemo, useState } from 'react'
import { num, parseCSV, MONTH_NAMES } from '../lib/utils'
import { ProfileSection } from '../components/ui'
import { DataTable } from '../components/DataTable'

const SPREADSHEET_ID = '1vocnshtKn8ezovFFsPr-bOkf7vqDIuhX9RXU3YWI2yQ'
const SHEETS = {
  main: 'Main Data',
  service: 'Service Invoice Sheet',
  disbursement: 'Disbursement',
}

function sheetCsvUrl(sheetName) {
  return 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(sheetName)
}

function parseSheetDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const dmy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function monthKey(value) {
  const date = parseSheetDate(value)
  return date ? date.getFullYear() * 12 + date.getMonth() : null
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  const formatted = Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })
  return amount < 0 ? '-₹' + formatted : '₹' + formatted
}

function getServiceInvoiceDate(row) {
  return row['Shipment Settled After'] || row['Invoice Created At']
}

const FEE_FIELDS = [
  { label: 'Seller commission', net: 'Net Seller commission', gst: 'Seller commission GST' },
  { label: 'Fixed fee', net: 'Net Fixed fee', gst: 'Fixed fee GST' },
  { label: 'Collection fee', net: 'Net Collection fee', gst: 'Collection fee GST' },
  { label: 'Shipping fee', net: 'Net Shipping fee', gst: 'Shipping fee GST' },
  { label: 'Reverse shipping fee', net: 'Net Reverse shipping fee', gst: 'Reverse shipping fee GST' },
  { label: 'Cancellation charges', net: 'Net Cancellation charges', gst: 'Cancellation charges GST' },
  { label: 'Shipping penalty', net: 'Net Shipping penalty', gst: 'Shipping penalty GST' },
  { label: 'Pick and pack fee', net: 'Net Pick And Pack Fee', gst: 'Pick And Pack Fee GST' },
]

export default function JioMartTab() {
  const [data, setData] = useState({ main: [], service: [], disbursement: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [selectedMonths, setSelectedMonths] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const entries = await Promise.all(Object.entries(SHEETS).map(async ([key, name]) => {
        const response = await fetch(sheetCsvUrl(name))
        if (!response.ok) throw new Error('Could not load “' + name + '” (HTTP ' + response.status + ').')
        const parsed = parseCSV(await response.text())
        return [key, parsed]
      }))
      const loaded = Object.fromEntries(entries)
      if (!loaded.main.length || !loaded.main.some(row => row['Shipment Number'] && 'Final Amount' in row)) {
        throw new Error('“Main Data” is missing the expected order columns.')
      }
      if (!loaded.service.length || !loaded.service.some(row => 'Service Invoice Number' in row && 'Total with GST' in row)) {
        throw new Error('“Service Invoice Sheet” is missing service fee or settlement columns.')
      }
      if (!loaded.disbursement.length || !loaded.disbursement.some(row => 'Account_Book' in row && 'Amount' in row)) {
        throw new Error('“Disbursement” is missing seller-payable ledger columns.')
      }
      loaded.main = loaded.main.filter(row => String(row['Shipment Number'] || '').trim())
      setData(loaded)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err?.message || 'Could not load JioMart payout data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const monthOptions = useMemo(() => {
    const months = new Map()
    const collect = (rows, dateField) => {
      for (const row of rows || []) {
        const key = monthKey(dateField(row))
        if (key === null) continue
        const month = key % 12
        const year = Math.floor(key / 12)
        months.set(key, MONTH_NAMES[month] + ' ' + String(year).slice(-2))
      }
    }
    collect(data.main, row => row.Date)
    collect(data.service, getServiceInvoiceDate)
    collect(data.disbursement, row => row.Created_At)
    return [...months.entries()].sort((a, b) => b[0] - a[0]).map(([key, label]) => ({ key, label }))
  }, [data])

  const toggleMonth = key => {
    setSelectedMonths(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const metrics = useMemo(() => {
    const inPeriod = value => !selectedMonths.size || selectedMonths.has(monthKey(value))
    const mainRows = data.main.filter(row => inPeriod(row.Date))
    const serviceRows = data.service.filter(row => inPeriod(getServiceInvoiceDate(row)))
    const ledgerRows = data.disbursement.filter(row => inPeriod(row.Created_At))

    const ordersByShipment = new Map()
    const uniqueLines = new Map()
    for (const row of mainRows) {
      const shipment = String(row['Shipment Number'] || '').trim()
      if (!shipment) continue
      if (!ordersByShipment.has(shipment)) {
        ordersByShipment.set(shipment, { shipment, statuses: new Set(), paymentMethods: new Set(), amounts: new Set(), quantity: 0 })
      }
      const order = ordersByShipment.get(shipment)
      if (row.Status) order.statuses.add(String(row.Status).trim())
      if (row.Payment_method) order.paymentMethods.add(String(row.Payment_method).trim())
      if (String(row['Final Amount'] || '').trim() !== '') order.amounts.add(num(row['Final Amount']))
      const lineKey = [shipment, row.Sku, row.Shipment_item, row.Quantity, row.MRP]
        .map(value => String(value || '').trim()).join('|')
      if (!uniqueLines.has(lineKey)) {
        const line = {
          shipment,
          sku: String(row.Sku || '').trim(),
          product: String(row.Shipment_item || '').trim() || 'Unspecified product',
          quantity: num(row.Quantity),
        }
        uniqueLines.set(lineKey, line)
        order.quantity += line.quantity
      }
    }

    const orders = [...ordersByShipment.values()].map(order => ({
      ...order,
      status: order.statuses.size === 1 ? [...order.statuses][0] : (order.statuses.size ? 'status_conflict' : 'unknown'),
      paymentMethod: order.paymentMethods.size === 1 ? [...order.paymentMethods][0] : (order.paymentMethods.size ? 'mixed' : 'unknown'),
      orderValue: order.amounts.size === 1 ? [...order.amounts][0] : null,
      amountConflict: order.amounts.size > 1,
    }))
    const orderValue = orders.reduce((sum, order) => sum + (order.orderValue ?? 0), 0)
    const deliveredValue = orders.filter(order => order.status === 'delivered').reduce((sum, order) => sum + (order.orderValue ?? 0), 0)

    const statusMap = new Map()
    for (const order of orders) {
      if (!statusMap.has(order.status)) statusMap.set(order.status, { status: order.status, shipments: 0, units: 0, orderValue: 0 })
      const row = statusMap.get(order.status)
      row.shipments += 1
      row.units += order.quantity
      row.orderValue += order.orderValue ?? 0
    }
    const statusRows = [...statusMap.values()].sort((a, b) => b.shipments - a.shipments)

    const paymentMap = new Map()
    for (const order of orders) {
      if (!paymentMap.has(order.paymentMethod)) paymentMap.set(order.paymentMethod, { paymentMethod: order.paymentMethod, shipments: 0, orderValue: 0 })
      const row = paymentMap.get(order.paymentMethod)
      row.shipments += 1
      row.orderValue += order.orderValue ?? 0
    }
    const paymentRows = [...paymentMap.values()].sort((a, b) => b.shipments - a.shipments)

    const productMap = new Map()
    for (const line of uniqueLines.values()) {
      const key = line.sku + '|' + line.product
      if (!productMap.has(key)) productMap.set(key, { sku: line.sku || '—', product: line.product, units: 0, shipments: new Set() })
      const product = productMap.get(key)
      product.units += line.quantity
      product.shipments.add(line.shipment)
    }
    const query = searchQuery.trim().toLowerCase()
    const productRows = [...productMap.values()]
      .map(product => ({ sku: product.sku, product: product.product, units: product.units, shipments: product.shipments.size }))
      .filter(product => !query || product.sku.toLowerCase().includes(query) || product.product.toLowerCase().includes(query))
      .sort((a, b) => b.units - a.units)

    const recordTypeMap = new Map()
    for (const row of serviceRows) {
      const recordType = String(row['Record Type (Shipment/ Cancellation/ Return)'] || 'Unknown').trim()
      if (!recordTypeMap.has(recordType)) recordTypeMap.set(recordType, { recordType, records: 0, paymentTotal: 0, feesWithGst: 0 })
      const summary = recordTypeMap.get(recordType)
      summary.records += 1
      summary.paymentTotal += num(row['Payment Total'])
      summary.feesWithGst += num(row['Total with GST'])
    }
    const recordTypeRows = [...recordTypeMap.values()].sort((a, b) => a.recordType.localeCompare(b.recordType))

    const feeRows = FEE_FIELDS.map(fee => {
      const net = serviceRows.reduce((sum, row) => sum + num(row[fee.net]), 0)
      const gst = serviceRows.reduce((sum, row) => sum + num(row[fee.gst]), 0)
      return { fee: fee.label, netExGst: net, gst, totalWithGst: net + gst }
    }).filter(row => row.netExGst || row.gst || row.totalWithGst)
    const totalServiceFees = serviceRows.reduce((sum, row) => sum + num(row['Total with GST']), 0)
    const totalInvoicePayment = serviceRows.reduce((sum, row) => sum + num(row['Payment Total']), 0)
    const totalInvoiceDiscount = serviceRows.reduce((sum, row) => sum + num(row['Total Discount']), 0)
    const totalServiceGst = serviceRows.reduce((sum, row) => sum + num(row['GST Total']), 0)

    const serviceInvoiceByNumber = new Map()
    for (const row of serviceRows) {
      const invoice = String(row['Service Invoice Number'] || '').trim()
      if (!invoice) continue
      serviceInvoiceByNumber.set(invoice, (serviceInvoiceByNumber.get(invoice) || 0) + num(row['Total with GST']))
    }
    const postedInvoiceNumbers = new Set(
      data.disbursement
        .filter(row => String(row.Event || '').trim().toLowerCase() === 'service invoice')
        .map(row => String(row.Document_Number || '').trim())
        .filter(Boolean)
    )
    const invoiceNumbers = [...serviceInvoiceByNumber.keys()]
    const postedInvoiceCount = invoiceNumbers.filter(invoice => postedInvoiceNumbers.has(invoice)).length
    const unmatchedInvoiceCount = invoiceNumbers.length - postedInvoiceCount
    const matchedServiceFee = invoiceNumbers
      .filter(invoice => postedInvoiceNumbers.has(invoice))
      .reduce((sum, invoice) => sum + serviceInvoiceByNumber.get(invoice), 0)
    const unmatchedServiceFee = invoiceNumbers
      .filter(invoice => !postedInvoiceNumbers.has(invoice))
      .reduce((sum, invoice) => sum + serviceInvoiceByNumber.get(invoice), 0)

    const eventMap = new Map()
    for (const row of ledgerRows) {
      const event = String(row.Event || 'Unknown').trim()
      if (!eventMap.has(event)) eventMap.set(event, { event, entries: 0, amount: 0 })
      const summary = eventMap.get(event)
      summary.entries += 1
      summary.amount += num(row.Amount)
    }
    const eventRows = [...eventMap.values()].sort((a, b) => b.amount - a.amount)

    const accountableMap = new Map()
    for (const row of ledgerRows) {
      const accountableType = String(row.Accountable_Type || 'Unknown').trim()
      if (!accountableMap.has(accountableType)) accountableMap.set(accountableType, { accountableType, entries: 0, amount: 0 })
      const summary = accountableMap.get(accountableType)
      summary.entries += 1
      summary.amount += num(row.Amount)
    }
    const accountableRows = [...accountableMap.values()].sort((a, b) => b.amount - a.amount)
    const netSellerPayableMovement = ledgerRows.reduce((sum, row) => sum + num(row.Amount), 0)
    const bankPayoutRows = ledgerRows.filter(row => /payout|bank transfer|settlement transfer|withdrawal|disbursement|paid to bank/i.test(String(row.Event || '')))
    const bankPayoutAmount = bankPayoutRows.reduce((sum, row) => sum + num(row.Amount), 0)

    return {
      orders,
      orderValue,
      deliveredValue,
      units: orders.reduce((sum, order) => sum + order.quantity, 0),
      returnedCount: orders.filter(order => order.status === 'shipment_returned').length,
      canceledCount: orders.filter(order => order.status === 'canceled').length,
      amountConflictCount: orders.filter(order => order.amountConflict).length,
      missingAmountCount: orders.filter(order => order.orderValue === null).length,
      statusConflictCount: orders.filter(order => order.status === 'status_conflict').length,
      statusRows,
      paymentRows,
      productRows,
      serviceRecordCount: serviceRows.length,
      recordTypeRows,
      feeRows,
      totalServiceFees,
      totalInvoicePayment,
      totalInvoiceDiscount,
      totalServiceGst,
      postedInvoiceCount,
      unmatchedInvoiceCount,
      matchedServiceFee,
      unmatchedServiceFee,
      eventRows,
      accountableRows,
      netSellerPayableMovement,
      bankPayoutRows,
      bankPayoutAmount,
    }
  }, [data, selectedMonths, searchQuery])

  const orderStatusColumns = [
    { key: 'status', label: 'Order Status', align: 'left', render: row => row.status.replace(/_/g, ' ') },
    { key: 'shipments', label: 'Shipments', align: 'right', accessor: row => row.shipments },
    { key: 'units', label: 'Units', align: 'right', accessor: row => row.units },
    { key: 'orderValue', label: 'Final Order Amount (₹)', align: 'right', accessor: row => row.orderValue, render: row => formatCurrency(row.orderValue) },
  ]
  const paymentColumns = [
    { key: 'paymentMethod', label: 'Payment Method', align: 'left' },
    { key: 'shipments', label: 'Shipments', align: 'right', accessor: row => row.shipments },
    { key: 'orderValue', label: 'Final Order Amount (₹)', align: 'right', accessor: row => row.orderValue, render: row => formatCurrency(row.orderValue) },
  ]
  const productColumns = [
    { key: 'sku', label: 'SKU', align: 'left' },
    { key: 'product', label: 'Product', align: 'left' },
    { key: 'units', label: 'Units', align: 'right', accessor: row => row.units },
    { key: 'shipments', label: 'Shipments', align: 'right', accessor: row => row.shipments },
  ]
  const recordTypeColumns = [
    { key: 'recordType', label: 'Record Type', align: 'left' },
    { key: 'records', label: 'Records', align: 'right', accessor: row => row.records },
    { key: 'paymentTotal', label: 'Payment Total (₹)', align: 'right', accessor: row => row.paymentTotal, render: row => formatCurrency(row.paymentTotal) },
    { key: 'feesWithGst', label: 'Service Fees / Credits incl. GST (₹)', align: 'right', accessor: row => row.feesWithGst, render: row => formatCurrency(row.feesWithGst) },
  ]
  const feeColumns = [
    { key: 'fee', label: 'Fee Category', align: 'left' },
    { key: 'netExGst', label: 'Net ex. GST (₹)', align: 'right', accessor: row => row.netExGst, render: row => formatCurrency(row.netExGst) },
    { key: 'gst', label: 'GST (₹)', align: 'right', accessor: row => row.gst, render: row => formatCurrency(row.gst) },
    { key: 'totalWithGst', label: 'Net incl. GST (₹)', align: 'right', accessor: row => row.totalWithGst, render: row => formatCurrency(row.totalWithGst) },
  ]
  const eventColumns = [
    { key: 'event', label: 'Ledger Event', align: 'left' },
    { key: 'entries', label: 'Entries', align: 'right', accessor: row => row.entries },
    { key: 'amount', label: 'Signed Ledger Amount (₹)', align: 'right', accessor: row => row.amount, render: row => formatCurrency(row.amount) },
  ]
  const accountableColumns = [
    { key: 'accountableType', label: 'Ledger Type', align: 'left' },
    { key: 'entries', label: 'Entries', align: 'right', accessor: row => row.entries },
    { key: 'amount', label: 'Signed Ledger Amount (₹)', align: 'right', accessor: row => row.amount, render: row => formatCurrency(row.amount) },
  ]

  const stats = [
    { label: 'Unique Shipments', icon: '📦', color: '#38bdf8', value: metrics.orders.length.toLocaleString('en-IN') },
    { label: 'Gross Order Amount', icon: '🛒', color: '#22c55e', value: formatCurrency(metrics.orderValue) },
    { label: 'Settled Invoice Payment Total', icon: '🧾', color: '#a855f7', value: formatCurrency(metrics.totalInvoicePayment) },
    { label: 'Service Fees / Credits incl. GST', icon: '↕️', color: '#f59e0b', value: formatCurrency(metrics.totalServiceFees) },
    { label: 'Seller Payable Ledger Movement', icon: '💸', color: '#14b8a6', value: formatCurrency(metrics.netSellerPayableMovement) },
  ]

  return (
    <>
      <header>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>📱</span>
            <h1 style={{ margin: 0 }}>Jio Mart Orders &amp; Payout Analysis</h1>
          </div>
          <div className="date" style={{ marginTop: 4 }}>
            Main Data • Service Invoice Sheet • Disbursement • {selectedMonths.size ? 'Selected periods' : 'All periods'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={loadData} disabled={loading} style={{ background: '#1e293b', color: '#38bdf8', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            ↻ {loading ? 'Loading…' : 'Refresh JioMart Data'}
          </button>
          <ProfileSection />
        </div>
      </header>

      {error && <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}
      {loading && !data.main.length && <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Loading JioMart order and payout data…</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0 16px' }}>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>PERIOD:</span>
        <button onClick={() => setSelectedMonths(new Set())} style={{ padding: '4px 12px', borderRadius: 14, border: '1px solid ' + (selectedMonths.size ? '#334155' : '#3b82f6'), background: selectedMonths.size ? '#1e293b' : 'rgba(59,130,246,0.18)', color: selectedMonths.size ? '#94a3b8' : '#38bdf8', cursor: 'pointer', fontSize: 12 }}>All</button>
        {monthOptions.map(month => {
          const active = selectedMonths.has(month.key)
          return <button key={month.key} onClick={() => toggleMonth(month.key)} style={{ padding: '4px 12px', borderRadius: 14, border: '1px solid ' + (active ? '#3b82f6' : '#334155'), background: active ? 'rgba(59,130,246,0.18)' : '#1e293b', color: active ? '#38bdf8' : '#94a3b8', cursor: 'pointer', fontSize: 12 }}>{month.label}</button>
        })}
        <span style={{ color: '#64748b', fontSize: 11, marginLeft: 4 }}>Period uses order date, settlement date, or ledger creation date per source.</span>
      </div>

      {!loading && !error && (
        <>
          <div className="stats-grid" style={{ marginTop: 0 }}>
            {stats.map(stat => (
              <div className="stat-card" key={stat.label}>
                <div className="stat-header">
                  <div className="stat-label">{stat.label}</div>
                  <div className="stat-icon" style={{ background: stat.color + '26', color: stat.color }}>{stat.icon}</div>
                </div>
                <div className="stat-value">{stat.value}</div>
              </div>
            ))}
          </div>

          <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
            Order amounts, service invoice fees, and seller-payable ledger movements are shown separately to avoid treating gross order value as payout.
            Amount signs follow the source: negative values are deductions or reversals; positive values are credits or receivables.
          </div>

          {(metrics.amountConflictCount || metrics.missingAmountCount || metrics.statusConflictCount) > 0 && (
            <div style={{ color: '#fbbf24', fontSize: 12, margin: '12px 0' }}>
              Review Main Data: {metrics.amountConflictCount} shipments have conflicting order amounts, {metrics.missingAmountCount} are missing amounts, and {metrics.statusConflictCount} have conflicting statuses.
            </div>
          )}

          <div className="recent-orders" style={{ marginTop: 20 }}>
            <div className="orders-header"><div className="orders-title">📦 Order metrics by status</div></div>
            <DataTable columns={orderStatusColumns} rows={metrics.statusRows} pageSize={10} filename="jiomart_orders_by_status.csv" emptyMessage="No shipments in this period" />
          </div>
          <div className="recent-orders" style={{ marginTop: 20 }}>
            <div className="orders-header"><div className="orders-title">💳 Order amount by payment method</div></div>
            <DataTable columns={paymentColumns} rows={metrics.paymentRows} pageSize={10} filename="jiomart_orders_by_payment_method.csv" emptyMessage="No payment methods in this period" />
          </div>
          <div className="recent-orders" style={{ marginTop: 20 }}>
            <div className="orders-header" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="orders-title">🧴 Product units</div>
              <input type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search product or SKU…" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '7px 12px', fontSize: 12, minWidth: 240 }} />
            </div>
            <DataTable columns={productColumns} rows={metrics.productRows} pageSize={10} filename="jiomart_product_units.csv" emptyMessage="No products found" />
          </div>

          <div className="recent-orders" style={{ marginTop: 24 }}>
            <div className="orders-header"><div className="orders-title">🧾 Service invoice settlement details</div></div>
            <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
              Invoice payment totals and service fees are from Service Invoice Sheet. The source distinguishes shipments from returns; displayed signs are preserved.
            </div>
            <div className="stats-grid" style={{ marginTop: 0 }}>
              {[
                { label: 'Service Invoice Records', icon: '🧾', color: '#38bdf8', value: metrics.serviceRecordCount.toLocaleString('en-IN') },
                { label: 'Service Invoice Payment Total', icon: '💰', color: '#22c55e', value: formatCurrency(metrics.totalInvoicePayment) },
                { label: 'Net Service Fees incl. GST', icon: '↕️', color: '#f59e0b', value: formatCurrency(metrics.totalServiceFees) },
                { label: 'Total Discounts', icon: '🏷️', color: '#a855f7', value: formatCurrency(metrics.totalInvoiceDiscount) },
                { label: 'GST Total', icon: '🧾', color: '#14b8a6', value: formatCurrency(metrics.totalServiceGst) },
              ].map(stat => (
                <div className="stat-card" key={stat.label}>
                  <div className="stat-header">
                    <div className="stat-label">{stat.label}</div>
                    <div className="stat-icon" style={{ background: stat.color + '26', color: stat.color }}>{stat.icon}</div>
                  </div>
                  <div className="stat-value">{stat.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, fontWeight: 700, color: '#f1f5f9' }}>Payment totals and fees by record type</div>
            <DataTable columns={recordTypeColumns} rows={metrics.recordTypeRows} pageSize={10} filename="jiomart_service_invoice_by_record_type.csv" emptyMessage="No service invoice records in this period" />
            <div style={{ marginTop: 18, fontWeight: 700, color: '#f1f5f9' }}>Fee breakdown</div>
            <DataTable columns={feeColumns} rows={metrics.feeRows} pageSize={10} filename="jiomart_service_invoice_fee_breakdown.csv" emptyMessage="No fee details in this period" />
            <div style={{ marginTop: 12, color: '#94a3b8', fontSize: 12 }}>
              Service invoice refs in period: {metrics.postedInvoiceCount} found in Disbursement, {metrics.unmatchedInvoiceCount} not found. Matched invoice fee total: {formatCurrency(metrics.matchedServiceFee)}; unmatched fee total: {formatCurrency(metrics.unmatchedServiceFee)}.
            </div>
          </div>

          <div className="recent-orders" style={{ marginTop: 24 }}>
            <div className="orders-header"><div className="orders-title">💸 Seller payable / disbursement ledger</div></div>
            <div className="stats-grid" style={{ marginTop: 0 }}>
              {[
                { label: 'Net Seller Payable Movement', icon: '💸', color: '#14b8a6', value: formatCurrency(metrics.netSellerPayableMovement) },
                { label: 'Bank Payout Transfer', icon: '🏦', color: metrics.bankPayoutRows.length ? '#22c55e' : '#f59e0b', value: metrics.bankPayoutRows.length ? formatCurrency(metrics.bankPayoutAmount) : 'Not recorded' },
              ].map(stat => (
                <div className="stat-card" key={stat.label}>
                  <div className="stat-header">
                    <div className="stat-label">{stat.label}</div>
                    <div className="stat-icon" style={{ background: stat.color + '26', color: stat.color }}>{stat.icon}</div>
                  </div>
                  <div className="stat-value">{stat.value}</div>
                </div>
              ))}
            </div>
            <div style={{ color: '#fbbf24', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: 12, margin: '12px 0', fontSize: 12, lineHeight: 1.6 }}>
              The Disbursement tab records seller-payable ledger movements. It does not show a bank transfer or UTR for cash received, so the ledger movement above is not labeled as payout received.
            </div>
            <div style={{ marginTop: 14, fontWeight: 700, color: '#f1f5f9' }}>Ledger amount by event</div>
            <DataTable columns={eventColumns} rows={metrics.eventRows} pageSize={10} filename="jiomart_disbursement_by_event.csv" emptyMessage="No ledger events in this period" />
            <div style={{ marginTop: 18, fontWeight: 700, color: '#f1f5f9' }}>Ledger amount by accounting type</div>
            <DataTable columns={accountableColumns} rows={metrics.accountableRows} pageSize={10} filename="jiomart_disbursement_by_accounting_type.csv" emptyMessage="No accounting entries in this period" />
          </div>

          <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#bfdbfe', borderRadius: 8, padding: 12, marginTop: 16, fontSize: 12, lineHeight: 1.6 }}>
            Aggregate metrics only; customer names, shipment numbers, and tracking IDs are not displayed.
          </div>
        </>
      )}

      {lastUpdated && <div style={{ textAlign: 'right', color: '#64748b', fontSize: 11, marginTop: 16 }}>Sheets refreshed {lastUpdated.toLocaleString()}</div>}
    </>
  )
}
