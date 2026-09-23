import { Fragment, useMemo } from 'react'
import { num, sumField } from '../lib/utils'
import { StatusPill } from './ui'

const sectionStyle = {
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: '18px 20px',
}

const sectionTitle = {
  fontSize: 11,
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: 14,
}

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
    products: [...new Set(lines.map(l => l['Product']).filter(Boolean))],
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

  const isRTO = (summary.status || '').toLowerCase() === 'rto' || hasRTO

  const rankOf = (s) => {
    const st = String(s || '').toLowerCase()
    if (st === 'rto' || st.includes('deliver')) return 5
    if (st.includes('schedule') || st.includes('appoint')) return 4
    if (st.includes('transit') || st.includes('dispatch')) return 3
    if (st.includes('process') || st.includes('invoice')) return 2
    if (st.includes('pending')) return 1
    return 0
  }

  const rank = rankOf(summary.status)

  const origin = [summary.platform, summary.facility].filter(x => x && x !== '—').join(' • ') || 'Unknown origin'

  const steps = [
    { label: 'PO Released', icon: '📄', value: summary.released !== '—' ? summary.released : '', sub: origin },
    { label: 'Invoiced', icon: '🧾', value: summary.invoiceDate !== '—' ? summary.invoiceDate : '', sub: summary.invoiceNo !== '—' ? `Invoice: ${summary.invoiceNo}` : '' },
    { label: 'In Transit', icon: '🚚', value: summary.transporter !== '—' ? summary.transporter : '', sub: summary.trackingNo !== '—' ? `Tracking: ${summary.trackingNo}` : '' },
    { label: 'Appointment', icon: '📅', value: summary.apptDate !== '—' ? summary.apptDate : '', sub: summary.apptId !== '—' ? `ID: ${summary.apptId}` : '' },
    { label: 'Delivered', icon: '✅', value: summary.actualDelivery !== '—' ? summary.actualDelivery : '', sub: summary.grn !== '—' ? `GRN: ${summary.grn}` : '' },
    { label: 'Destination', icon: '📍', value: summary.city, sub: summary.pincode !== '—' ? `Pincode: ${summary.pincode}` : '' },
  ]

  const journeySteps = steps.map((s, i) => {
    const isDestination = i === 5
    let color = '#64748b'
    if (isRTO) color = s.value ? '#ef4444' : '#64748b'
    else if (isDestination) color = rank >= 5 ? '#22c55e' : '#64748b'
    else if (i < rank) color = '#22c55e'
    else if (i === Math.min(rank, 4)) color = '#3b82f6'
    return { ...s, color }
  })

  const item = (label, value, color) => (
    <div style={{ minWidth: 140 }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || '#f1f5f9', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <button
        onClick={onBack}
        style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 18 }}
      >
        ← Back
      </button>

      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700 }}>{po}</span>
          <StatusPill status={summary.status} />
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>
          {summary.city} • {summary.platform} {summary.entity !== '—' ? `• ${summary.entity}` : ''} • {lines.length} line item{lines.length === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{ ...sectionStyle, marginBottom: 18 }}>
        <div style={{ ...sectionTitle, marginBottom: 12 }}>
          🧭 Journey — <span style={{ color: '#60a5fa' }}>{origin}</span> <span style={{ color: '#475569' }}>→</span> <span style={{ color: '#60a5fa' }}>{summary.city}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', paddingBottom: 6 }}>
          {journeySteps.map((s, i) => (
            <Fragment key={s.label}>
              {i > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 18, color: '#475569', flexShrink: 0 }}>→</div>
              )}
              <div style={{ flexShrink: 0, width: 160, background: `${s.color}14`, border: `1px solid ${s.color}44`, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 16, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: s.value ? '#f1f5f9' : '#64748b', wordBreak: 'break-word' }}>{s.value || '—'}</div>
                {s.sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, wordBreak: 'break-word' }}>{s.sub}</div>}
              </div>
            </Fragment>
          ))}
        </div>
        {isRTO && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#ef4444' }}>
            ↩ RTO: {summary.rtoStatus !== '—' ? summary.rtoStatus : 'Returned'}{summary.rtoQty > 0 ? ` • ${Math.round(summary.rtoQty).toLocaleString()} KG` : ''}{summary.rtoValue > 0 ? ` • ₹${Math.round(summary.rtoValue).toLocaleString()}` : ''}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={sectionStyle}>
          <div style={sectionTitle}>Order Info</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
            {item('City', summary.city)}
            {item('Platform', summary.platform)}
            {item('Entity', summary.entity)}
            {item('Status', summary.status)}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitle}>Products & Qty</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
            {item('Product', summary.products.length ? summary.products.join(' • ') : '—')}
            {item('Qty', summary.qty.toLocaleString())}
            {item('Tonnage', Math.round(summary.tonnage).toLocaleString() + ' KG')}
            {item('Box Count', summary.boxes.toLocaleString())}
            {item('MRP', summary.mrp ? '₹' + summary.mrp.toLocaleString() : '—')}
            {item('Unit Cost', summary.unitCost ? '₹' + summary.unitCost.toLocaleString() : '—')}
            {item('PO Value', summary.poValue ? '₹' + Math.round(summary.poValue).toLocaleString() : '—', '#22c55e')}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitle}>Invoicing</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
            {item('Invoice Number', summary.invoiceNo, summary.invoiceNo !== '—' ? '#60a5fa' : undefined)}
            {item('Invoice Date', summary.invoiceDate)}
            {item('Invoice Value', summary.invoiceValue ? '₹' + Math.round(summary.invoiceValue).toLocaleString() : '—')}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitle}>Schedule</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
            {item('PO Release Date', summary.released)}
            {item('Appointment Date', summary.apptDate)}
            {item('PO Expiry Date', summary.expiry)}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitle}>RTO</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
            {item('RTO Status', summary.rtoStatus, hasRTO ? '#ef4444' : undefined)}
            {item('RTO Qty', hasRTO ? Math.round(summary.rtoQty).toLocaleString() + ' KG' : '—', hasRTO ? '#ef4444' : undefined)}
            {item('RTO Value', hasRTO ? '₹' + Math.round(summary.rtoValue).toLocaleString() : '—', hasRTO ? '#ef4444' : undefined)}
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitle}>Payment</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
            {item('Payment Status', summary.paymentStatus, (summary.paymentStatus || '').toLowerCase().includes('paid') ? '#22c55e' : undefined)}
            {item('Final Settlement', summary.finalSettlement ? '₹' + Math.round(summary.finalSettlement).toLocaleString() : '—')}
            {item('UTR Details', summary.utr)}
            {item('DN Amount', summary.dn ? '₹' + Math.round(summary.dn).toLocaleString() : '—')}
            {item('Overdue Alert', summary.overdue, (summary.overdue || '').toLowerCase().includes('overdue') ? '#ef4444' : '#f1f5f9')}
            {item('Final Fill Rate', summary.fillRate)}
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ ...sectionTitle, marginBottom: 12 }}>Line Items</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                {['Product', 'Qty', 'Delivered', 'Rejected', 'Tonnage', 'Boxes', 'MRP', 'Unit Cost', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Product' ? 'left' : 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '10px', borderBottom: '1px solid #1e293b', fontSize: 13, fontWeight: 600, maxWidth: 260 }}>{r['Product']}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #1e293b', textAlign: 'right', fontSize: 13 }}>{num(r['PO Qty'])}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #1e293b', textAlign: 'right', fontSize: 13, color: '#22c55e' }}>{num(r['Delivered QTY'])}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #1e293b', textAlign: 'right', fontSize: 13, color: '#ef4444' }}>{num(r['Rejected Qty'])}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #1e293b', textAlign: 'right', fontSize: 13 }}>{num(r['Tonnage'])}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #1e293b', textAlign: 'right', fontSize: 13 }}>{num(r['Box Count'])}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #1e293b', textAlign: 'right', fontSize: 13 }}>{num(r['MRP']) ? '₹' + num(r['MRP']).toLocaleString() : '—'}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #1e293b', textAlign: 'right', fontSize: 13 }}>{num(r['Unit Cost']) ? '₹' + num(r['Unit Cost']).toLocaleString() : '—'}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid #1e293b', fontSize: 13 }}><StatusPill status={r['Status']} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
