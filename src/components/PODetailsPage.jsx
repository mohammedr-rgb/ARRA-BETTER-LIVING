import { useMemo } from 'react'
import { num, sumField } from '../lib/utils'
import { StatusPill } from './ui'
import './PODetailsPage.css'

export function PODetailsPage({ po, data, onBack }) {
  const lines = useMemo(() => {
    if (!po) return []
    return data.filter(r => r['PO Number'] === po)
  }, [po, data])

  const base = lines[0] || {}
  const summary = {
    city: base['City'] || '—',
    platform: base['Platform'] || '—',
    entity: base['Entity'] || '—',
    status: base['Status'] || '—',
    qty: sumField(lines, 'PO Qty'),
    tonnage: sumField(lines, 'Tonnage'),
    boxes: sumField(lines, 'Box Count'),
    mrp: num(base['MRP']),
    unitCost: num(base['Unit Cost']),
    poValue: num(base['PO Value with Tax']),
    invoiceNo: base['Invoice No'] || '—',
    invoiceValue: num(base['Invoice Value']),
    invoiceDate: base['Invoice Date (MM-DD-YYYY)'] || '—',
    released: base['PO Released Date(MM-DD-YYYY)'] || '—',
    apptDate: base['Appointment Date(MM-DD-YYYY)'] || '—',
    expiry: base['Expiry Date(MM-DD-YYYY)'] || '—',
    facility: base['FacilityName'] || '—',
    transporter: base['Transporter'] || '—',
    trackingNo: base['Tracking No'] || '—',
    apptId: base['Appointment ID'] || '—',
    actualDelivery: base['Actual Delivery Date(MM-DD-YYYY)'] || '—',
    grn: base['GRN details'] || '—',
    pincode: base['Pincode'] || '—',
    rtoStatus: base['RTO Status'] || '—',
    rtoQty: num(base['RTO Tonnage (MT)']),
    rtoValue: num(base['RTO Value at Risk']),
    paymentStatus: base['Payment status'] || '—',
    finalSettlement: num(base['Final Peding Settlement'] || base['Final Pending Settlement']),
    utr: base['UTR Details'] || '—',
    dn: num(base['DN amount']),
    overdue: base['Payment Overdue Alert'] || '—',
    fillRate: base['Final Fill Rate'] || '—',
  }

  const hasRTO = summary.rtoStatus !== '—' || summary.rtoQty > 0 || summary.rtoValue > 0
  const hasInvoiceInfo = summary.invoiceNo !== '—' || summary.invoiceDate !== '—' || summary.invoiceValue > 0
  const hasPaymentInfo = [summary.paymentStatus, summary.finalSettlement, summary.utr, summary.dn, summary.overdue, summary.fillRate]
    .some(value => value && value !== '—' && value !== 0)
  const isRTO = (summary.status || '').toLowerCase() === 'rto' || hasRTO

  const rankOf = (status) => {
    const value = String(status || '').toLowerCase()
    if (value === 'rto' || value.includes('deliver')) return 5
    if (value.includes('schedule') || value.includes('appoint')) return 4
    if (value.includes('transit') || value.includes('dispatch')) return 3
    if (value.includes('process') || value.includes('invoice')) return 2
    if (value.includes('pending')) return 1
    return 0
  }

  const rank = rankOf(summary.status)
  const origin = [summary.platform, summary.facility].filter(value => value && value !== '—').join(' • ') || 'Origin not recorded'
  const steps = [
    { label: 'PO released', icon: '📄', value: summary.released, sub: origin },
    { label: 'Invoiced', icon: '🧾', value: summary.invoiceDate, sub: summary.invoiceNo !== '—' ? `Invoice ${summary.invoiceNo}` : '' },
    { label: 'In transit', icon: '🚚', value: summary.transporter, sub: summary.trackingNo !== '—' ? `Tracking ${summary.trackingNo}` : '' },
    { label: 'Appointment', icon: '📅', value: summary.apptDate, sub: summary.apptId !== '—' ? `ID ${summary.apptId}` : '' },
    { label: 'Delivered', icon: '✅', value: summary.actualDelivery, sub: summary.grn !== '—' ? `GRN ${summary.grn}` : '' },
    { label: 'Destination', icon: '📍', value: summary.city, sub: summary.pincode !== '—' ? `Pincode ${summary.pincode}` : '' },
  ]
  const journeySteps = steps.map((step, index) => {
    const destination = index === 5
    let color = '#64748b'
    if (isRTO) color = step.value ? '#ef4444' : '#64748b'
    else if (destination) color = rank >= 5 ? '#22c55e' : '#64748b'
    else if (index < rank) color = '#22c55e'
    else if (index === Math.min(rank, 4)) color = '#3b82f6'
    return { ...step, color }
  })

  const item = (label, value, color) => {
    if (value == null || value === '' || value === '—') return null
    return (
      <div className="po-info-item" key={label}>
        <div className="po-info-label">{label}</div>
        <div className="po-info-value" style={color ? { color } : undefined}>{value}</div>
      </div>
    )
  }

  const metrics = [
    { label: 'Order quantity', value: summary.qty.toLocaleString(), unit: 'units' },
    { label: 'Tonnage', value: `${Math.round(summary.tonnage).toLocaleString()} KG` },
    { label: 'Boxes', value: summary.boxes.toLocaleString() },
    { label: 'PO value', value: summary.poValue ? `₹${Math.round(summary.poValue).toLocaleString()}` : '—', highlight: true },
  ]

  return (
    <main className="po-detail-page">
      <button className="po-back-button" onClick={onBack}>← Back to dashboard</button>

      <header className="po-page-header">
        <div className="po-title-row">
          <h1>{po}</h1>
          <StatusPill status={summary.status} />
        </div>
        <p>{summary.city} <span>•</span> {summary.platform}{summary.entity !== '—' ? <> <span>•</span> {summary.entity}</> : null}</p>
        <div className="po-line-count">{lines.length} line item{lines.length === 1 ? '' : 's'}</div>
      </header>

      <section className="po-summary-grid" aria-label="Purchase order summary">
        {metrics.map(metric => (
          <div className={`po-metric-card${metric.highlight ? ' po-metric-highlight' : ''}`} key={metric.label}>
            <div className="po-metric-label">{metric.label}</div>
            <div className="po-metric-value">{metric.value}</div>
            {metric.unit && <div className="po-metric-unit">{metric.unit}</div>}
          </div>
        ))}
      </section>

      <section className="po-section po-journey-section">
        <div className="po-section-heading">
          <div>
            <h2>Delivery journey</h2>
            <p>{origin} <span>→</span> {summary.city}</p>
          </div>
          {isRTO && <span className="po-rto-badge">↩ Returned</span>}
        </div>
        <ol className="po-journey-grid">
          {journeySteps.map(step => (
            <li className="po-journey-step" key={step.label} style={{ '--step-color': step.color }}>
              <div className="po-step-icon" aria-hidden="true">{step.icon}</div>
              <div className="po-step-copy">
                <div className="po-step-label">{step.label}</div>
                <div className={`po-step-value${step.value ? '' : ' is-empty'}`}>{step.value || 'Not recorded'}</div>
                {step.sub && <div className="po-step-note">{step.sub}</div>}
              </div>
            </li>
          ))}
        </ol>
        {hasRTO && <div className="po-rto-detail">{summary.rtoStatus !== '—' ? summary.rtoStatus : 'Return to origin'}{summary.rtoQty > 0 ? ` • ${Math.round(summary.rtoQty).toLocaleString()} KG` : ''}{summary.rtoValue > 0 ? ` • ₹${Math.round(summary.rtoValue).toLocaleString()}` : ''}</div>}
      </section>

      <section className="po-details-grid" aria-label="Purchase order details">
        <article className="po-section">
          <h2 className="po-card-heading">Order details</h2>
          <div className="po-info-grid">
            {item('City', summary.city)}
            {item('Platform', summary.platform)}
            {item('Entity', summary.entity)}
            {item('Status', summary.status)}
          </div>
        </article>

        <article className="po-section">
          <h2 className="po-card-heading">Schedule</h2>
          <div className="po-info-grid">
            {item('PO release date', summary.released)}
            {item('Appointment date', summary.apptDate)}
            {item('Expiry date', summary.expiry)}
          </div>
        </article>

        {hasInvoiceInfo && (
          <article className="po-section">
            <h2 className="po-card-heading">Invoicing</h2>
            <div className="po-info-grid">
              {item('Invoice number', summary.invoiceNo, summary.invoiceNo !== '—' ? '#60a5fa' : undefined)}
              {item('Invoice date', summary.invoiceDate)}
              {item('Invoice value', summary.invoiceValue ? `₹${Math.round(summary.invoiceValue).toLocaleString()}` : '—')}
            </div>
          </article>
        )}

        {(summary.mrp > 0 || summary.unitCost > 0) && (
          <article className="po-section">
            <h2 className="po-card-heading">Pricing</h2>
            <div className="po-info-grid">
              {item('MRP', summary.mrp ? `₹${summary.mrp.toLocaleString()}` : '—')}
              {item('Unit cost', summary.unitCost ? `₹${summary.unitCost.toLocaleString()}` : '—')}
            </div>
          </article>
        )}

        {hasPaymentInfo && (
          <article className="po-section">
            <h2 className="po-card-heading">Payment</h2>
            <div className="po-info-grid">
              {item('Payment status', summary.paymentStatus, (summary.paymentStatus || '').toLowerCase().includes('paid') ? '#22c55e' : undefined)}
              {item('Final settlement', summary.finalSettlement ? `₹${Math.round(summary.finalSettlement).toLocaleString()}` : '—')}
              {item('UTR details', summary.utr)}
              {item('Debit note amount', summary.dn ? `₹${Math.round(summary.dn).toLocaleString()}` : '—')}
              {item('Overdue alert', summary.overdue, (summary.overdue || '').toLowerCase().includes('overdue') ? '#ef4444' : undefined)}
              {item('Final fill rate', summary.fillRate)}
            </div>
          </article>
        )}

        {hasRTO && (
          <article className="po-section po-rto-section">
            <h2 className="po-card-heading">Return to origin</h2>
            <div className="po-info-grid">
              {item('RTO status', summary.rtoStatus, '#f87171')}
              {item('Returned quantity', summary.rtoQty ? `${Math.round(summary.rtoQty).toLocaleString()} KG` : '—', '#f87171')}
              {item('Value at risk', summary.rtoValue ? `₹${Math.round(summary.rtoValue).toLocaleString()}` : '—', '#f87171')}
            </div>
          </article>
        )}
      </section>

      <section className="po-section po-line-items-section">
        <div className="po-section-heading po-line-items-heading">
          <div>
            <h2>Line items</h2>
            <p>Products and quantities included in this PO</p>
          </div>
          <span className="po-item-count">{lines.length} item{lines.length === 1 ? '' : 's'}</span>
        </div>
        <div className="po-table-scroll">
          <table className="po-line-items-table">
            <thead>
              <tr>
                {['Product', 'Qty', 'Delivered', 'Rejected', 'Tonnage', 'Boxes', 'MRP', 'Unit cost', 'Status'].map((heading, index) => (
                  <th key={heading} className={index === 0 || index === 8 ? 'po-text-column' : ''}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((row, index) => (
                <tr key={`${row['Product'] || 'line'}-${index}`}>
                  <td className="po-product-cell">{row['Product']}</td>
                  <td>{num(row['PO Qty']).toLocaleString()}</td>
                  <td className="po-positive-cell">{num(row['Delivered QTY']).toLocaleString()}</td>
                  <td className="po-negative-cell">{num(row['Rejected Qty']).toLocaleString()}</td>
                  <td>{num(row['Tonnage']).toLocaleString()}</td>
                  <td>{num(row['Box Count']).toLocaleString()}</td>
                  <td>{num(row['MRP']) ? `₹${num(row['MRP']).toLocaleString()}` : '—'}</td>
                  <td>{num(row['Unit Cost']) ? `₹${num(row['Unit Cost']).toLocaleString()}` : '—'}</td>
                  <td className="po-status-cell"><StatusPill status={row['Status']} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="po-table-hint">Swipe or scroll horizontally to view all columns</div>
      </section>
    </main>
  )
}
