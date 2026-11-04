import { useCallback, useEffect, useMemo, useState } from 'react'
import { num, parseCSV, MONTH_NAMES } from '../lib/utils'
import { ProfileSection } from '../components/ui'
import { DataTable } from '../components/DataTable'

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1vocnshtKn8ezovFFsPr-bOkf7vqDIuhX9RXU3YWI2yQ/export?format=csv&gid=0'

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

function formatCurrency(value) {
  return '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

export default function JioMartTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [selectedMonths, setSelectedMonths] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(SHEET_CSV_URL)
      if (!response.ok) throw new Error('Could not load the JioMart sheet (HTTP ' + response.status + ').')
      const parsed = parseCSV(await response.text())
      if (!parsed.length || !parsed.some(row => row['Shipment Number'] && 'Final Amount' in row)) {
        throw new Error('The JioMart sheet does not have the expected order columns.')
      }
      setRows(parsed.filter(row => String(row['Shipment Number'] || '').trim()))
      setLastUpdated(new Date())
    } catch (err) {
      setError(err?.message || 'Could not load JioMart order data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const monthOptions = useMemo(() => {
    const months = new Map()
    for (const row of rows) {
      const date = parseSheetDate(row['Date'])
      if (!date) continue
      const key = date.getFullYear() * 12 + date.getMonth()
      months.set(key, MONTH_NAMES[date.getMonth()] + ' ' + String(date.getFullYear()).slice(-2))
    }
    return [...months.entries()].sort((a, b) => b[0] - a[0]).map(([key, label]) => ({ key, label }))
  }, [rows])

  const toggleMonth = key => {
    setSelectedMonths(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const metrics = useMemo(() => {
    const periodRows = rows.filter(row => {
      if (!selectedMonths.size) return true
      const date = parseSheetDate(row['Date'])
      if (!date) return false
      return selectedMonths.has(date.getFullYear() * 12 + date.getMonth())
    })

    const ordersByShipment = new Map()
    const uniqueLines = new Map()
    for (const row of periodRows) {
      const shipment = String(row['Shipment Number'] || '').trim()
      if (!shipment) continue
      if (!ordersByShipment.has(shipment)) {
        ordersByShipment.set(shipment, { shipment, statuses: new Set(), paymentMethods: new Set(), amounts: new Set(), quantity: 0 })
      }
      const order = ordersByShipment.get(shipment)
      if (row['Status']) order.statuses.add(String(row['Status']).trim())
      if (row['Payment_method']) order.paymentMethods.add(String(row['Payment_method']).trim())
      if (String(row['Final Amount'] || '').trim() !== '') order.amounts.add(num(row['Final Amount']))

      const lineKey = [shipment, row['Sku'], row['Shipment_item'], row['Quantity'], row['MRP']]
        .map(value => String(value || '').trim()).join('|')
      if (!uniqueLines.has(lineKey)) {
        const line = {
          shipment,
          sku: String(row['Sku'] || '').trim(),
          product: String(row['Shipment_item'] || '').trim() || 'Unspecified product',
          quantity: num(row['Quantity']),
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
    const totalOrderValue = orders.reduce((sum, order) => sum + (order.orderValue ?? 0), 0)
    const deliveredOrderValue = orders.filter(order => order.status === 'delivered')
      .reduce((sum, order) => sum + (order.orderValue ?? 0), 0)
    const totalUnits = orders.reduce((sum, order) => sum + order.quantity, 0)

    const statusMap = new Map()
    for (const order of orders) {
      if (!statusMap.has(order.status)) statusMap.set(order.status, { status: order.status, shipments: 0, units: 0, orderValue: 0 })
      const summary = statusMap.get(order.status)
      summary.shipments += 1
      summary.units += order.quantity
      summary.orderValue += order.orderValue ?? 0
    }
    const statusRows = [...statusMap.values()].sort((a, b) => b.shipments - a.shipments)

    const paymentMap = new Map()
    for (const order of orders) {
      if (!paymentMap.has(order.paymentMethod)) paymentMap.set(order.paymentMethod, { paymentMethod: order.paymentMethod, shipments: 0, orderValue: 0 })
      const summary = paymentMap.get(order.paymentMethod)
      summary.shipments += 1
      summary.orderValue += order.orderValue ?? 0
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

    return {
      orders,
      totalUnits,
      totalOrderValue,
      deliveredOrderValue,
      returnCount: orders.filter(order => order.status === 'shipment_returned').length,
      canceledCount: orders.filter(order => order.status === 'canceled').length,
      amountConflictCount: orders.filter(order => order.amountConflict).length,
      missingAmountCount: orders.filter(order => order.orderValue === null).length,
      statusConflictCount: orders.filter(order => order.status === 'status_conflict').length,
      statusRows,
      paymentRows,
      productRows,
    }
  }, [rows, selectedMonths, searchQuery])

  const statusColumns = [
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

  const stats = [
    { label: 'Unique Shipments', icon: '📦', color: '#38bdf8', value: metrics.orders.length.toLocaleString('en-IN') },
    { label: 'Units', icon: '🧴', color: '#a855f7', value: metrics.totalUnits.toLocaleString('en-IN') },
    { label: 'Final Order Amount', icon: '₹', color: '#22c55e', value: formatCurrency(metrics.totalOrderValue) },
    { label: 'Delivered Order Amount', icon: '✅', color: '#14b8a6', value: formatCurrency(metrics.deliveredOrderValue) },
    { label: 'Returns / Cancellations', icon: '↩️', color: '#ef4444', value: metrics.returnCount + ' / ' + metrics.canceledCount },
  ]

  return (
    <>
      <header>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>📱</span>
            <h1 style={{ margin: 0 }}>Jio Mart Orders &amp; Metrics</h1>
          </div>
          <div className="date" style={{ marginTop: 4 }}>
            Aggregate view only; customer names and tracking IDs are hidden • {selectedMonths.size ? 'Selected periods' : 'All periods'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={loadData} disabled={loading} style={{ background: '#1e293b', color: '#38bdf8', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            ↻ {loading ? 'Loading…' : 'Refresh JioMart Sheet'}
          </button>
          <ProfileSection />
        </div>
      </header>

      {error && <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}
      {loading && !rows.length && <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Loading JioMart order data…</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0 16px' }}>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>PERIOD:</span>
        <button onClick={() => setSelectedMonths(new Set())} style={{ padding: '4px 12px', borderRadius: 14, border: '1px solid ' + (selectedMonths.size ? '#334155' : '#3b82f6'), background: selectedMonths.size ? '#1e293b' : 'rgba(59,130,246,0.18)', color: selectedMonths.size ? '#94a3b8' : '#38bdf8', cursor: 'pointer', fontSize: 12 }}>All</button>
        {monthOptions.map(month => {
          const active = selectedMonths.has(month.key)
          return <button key={month.key} onClick={() => toggleMonth(month.key)} style={{ padding: '4px 12px', borderRadius: 14, border: '1px solid ' + (active ? '#3b82f6' : '#334155'), background: active ? 'rgba(59,130,246,0.18)' : '#1e293b', color: active ? '#38bdf8' : '#94a3b8', cursor: 'pointer', fontSize: 12 }}>{month.label}</button>
        })}
        <span style={{ color: '#64748b', fontSize: 11, marginLeft: 4 }}>Selected months combine; All shows every month.</span>
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

          {(metrics.amountConflictCount || metrics.missingAmountCount || metrics.statusConflictCount) > 0 && (
            <div style={{ color: '#fbbf24', fontSize: 12, margin: '12px 0' }}>
              Review source rows: {metrics.amountConflictCount} shipments have conflicting amounts, {metrics.missingAmountCount} are missing amounts, and {metrics.statusConflictCount} have conflicting statuses.
            </div>
          )}

          <div className="recent-orders" style={{ marginTop: 20 }}>
            <div className="orders-header">
              <div className="orders-title">Shipments and order amount by status</div>
            </div>
            <DataTable columns={statusColumns} rows={metrics.statusRows} pageSize={10} filename="jiomart_metrics_by_status.csv" emptyMessage="No JioMart shipments in this period" />
          </div>
          <div className="recent-orders" style={{ marginTop: 20 }}>
            <div className="orders-header">
              <div className="orders-title">Order amount by payment method</div>
            </div>
            <DataTable columns={paymentColumns} rows={metrics.paymentRows} pageSize={10} filename="jiomart_metrics_by_payment_method.csv" emptyMessage="No payment methods in this period" />
          </div>
          <div className="recent-orders" style={{ marginTop: 20 }}>
            <div className="orders-header" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="orders-title">Product units</div>
              <input type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search product or SKU…" style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', padding: '7px 12px', fontSize: 12, minWidth: 240 }} />
            </div>
            <DataTable columns={productColumns} rows={metrics.productRows} pageSize={10} filename="jiomart_product_units.csv" emptyMessage="No products found" />
          </div>
          <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.35)', color: '#fbbf24', borderRadius: 8, padding: 12, marginTop: 16, fontSize: 12, lineHeight: 1.6 }}>
            “Final Order Amount” is the order amount from the sheet, not a seller payout. Payout reconciliation needs a JioMart settlement report with the net payout, fees, deductions, and settlement date.
          </div>
        </>
      )}

      {lastUpdated && <div style={{ textAlign: 'right', color: '#64748b', fontSize: 11, marginTop: 16 }}>Sheet refreshed {lastUpdated.toLocaleString()}</div>}
    </>
  )
}
