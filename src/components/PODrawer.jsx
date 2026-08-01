import { useState, useMemo, useEffect } from 'react'
import { num, uniqueByPO, sumField, csvEscape } from '../lib/utils'
import { StatusPill } from './ui'

export function PODrawer({ po, data, onClose }) {
  const [tab, setTab] = useState('lines')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lines = useMemo(() => {
    if (!po) return []
    return data.filter(r => r['PO Number'] === po)
  }, [po, data])

  const summary = useMemo(() => {
    const base = lines[0] || {}
    const linePOs = uniqueByPO(lines)
    return {
      city: base['City'] || '—',
      platform: base['Platform'] || '—',
      status: base['Status'] || '—',
      value: sumField(lines, 'PO Value with Tax') || num(base['PO Value with Tax']),
      qty: sumField(lines, 'PO Qty'),
      tonnage: sumField(lines, 'Tonnage'),
      boxes: sumField(lines, 'Box Count'),
      mrp: num(base['MRP']),
      released: base['PO Released Date(MM-DD-YYYY)'],
      expiry: base['Expiry Date(MM-DD-YYYY)'],
      apptDate: base['Appointment Date(MM-DD-YYYY)'],
      apptId: base['Appointment ID'],
      entity: base['Entity'],
      invoice: base['Invoice No'],
      rtoReason: base['RTO Reason'],
      rtoTonnage: num(base['RTO Tonnage (MT)']),
      rtoValue: num(base['RTO Value at Risk']),
      transporter: base['Transporter'],
      facility: base['FacilityName'],
      overdue: base['Payment Overdue Alert'],
      poCount: linePOs.length,
      lineCount: lines.length,
    }
  }, [lines])

  if (!po) return null

  const downloadLines = () => {
    const rows = ['PO Line Items']
    rows.push('PO Number,Product,PO Qty,Delivered QTY,Rejected Qty,Tonnage,Box Count,MRP,Status,Appointment Date,Expiry Date,RTO Reason')
    lines.forEach(r => {
      rows.push([
        r['PO Number'], r['Product'], num(r['PO Qty']), num(r['Delivered QTY']), num(r['Rejected Qty']),
        num(r['Tonnage']), num(r['Box Count']), num(r['MRP']), r['Status'], r['Appointment Date(MM-DD-YYYY)'],
        r['Expiry Date(MM-DD-YYYY)'], r['RTO Reason'],
      ].map(x => csvEscape(String(x))).join(','))
    })
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${po}_lines.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const item = (label, value, color) => (
    <div style={{ minWidth: 140 }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || '#f1f5f9', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 998 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(720px, 92vw)', background: '#0f172a', borderLeft: '1px solid #334155', zIndex: 999, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700 }}>{po}</span>
              <StatusPill status={summary.status} />
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
              {summary.city} • {summary.platform} {summary.entity ? `• ${summary.entity}` : ''} • {summary.lineCount} line{summary.lineCount === 1 ? '' : 's'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, color: '#f1f5f9', width: 36, height: 36, fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ padding: '16px 24px', borderBottom: '1px solid #334155', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setTab('lines')} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid ' + (tab === 'lines' ? '#3b82f6' : '#334155'), background: tab === 'lines' ? 'rgba(59,130,246,0.15)' : 'transparent', color: tab === 'lines' ? '#3b82f6' : '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Line Items ({summary.lineCount})</button>
          <button onClick={() => setTab('overview')} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid ' + (tab === 'overview' ? '#3b82f6' : '#334155'), background: tab === 'overview' ? 'rgba(59,130,246,0.15)' : 'transparent', color: tab === 'overview' ? '#3b82f6' : '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Overview</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {tab === 'overview' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 18, marginBottom: 24 }}>
                {item('PO Value', '₹' + Math.round(summary.value).toLocaleString(), '#22c55e')}
                {item('Total Qty', summary.qty.toLocaleString())}
                {item('Tonnage', Math.round(summary.tonnage).toLocaleString() + ' KG')}
                {item('Box Count', summary.boxes.toLocaleString())}
                {item('MRP', summary.mrp ? '₹' + summary.mrp.toLocaleString() : '—')}
                {item('Released', summary.released || '—')}
                {item('Expiry', summary.expiry || '—')}
                {item('Appointment', summary.apptDate || '—')}
                {item('Appt ID', summary.apptId || '—')}
                {item('Transporter', summary.transporter || '—')}
                {item('Facility', summary.facility || '—')}
                {item('Invoice', summary.invoice || '—')}
                {item('Overdue Alert', summary.overdue || '—', (summary.overdue || '').toLowerCase().includes('overdue') ? '#ef4444' : '#f1f5f9')}
              </div>
              {summary.status === 'RTO' && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>↩️ RTO Details</div>
                  <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7 }}>
                    <span style={{ color: '#f1f5f9', fontWeight: 600 }}>Reason:</span> {summary.rtoReason || 'Not specified'}
                    {' • '}<span style={{ color: '#f1f5f9', fontWeight: 600 }}>Tonnage lost:</span> {Math.round(summary.rtoTonnage).toLocaleString()} KG
                    {' • '}<span style={{ color: '#f1f5f9', fontWeight: 600 }}>Value at risk:</span> ₹{Math.round(summary.rtoValue).toLocaleString()}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={downloadLines} style={{ background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>⬇ Download Line Items</button>
              </div>
            </div>
          )}

          {tab === 'lines' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #334155' }}>Product</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #334155' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #334155' }}>Delivered</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #334155' }}>Rejected</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #334155' }}>Tonnage</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #334155' }}>Boxes</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #334155' }}>MRP</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #334155' }}>Status</th>
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
                    <td style={{ padding: '10px', borderBottom: '1px solid #1e293b', textAlign: 'right', fontSize: 13 }}>{r['MRP'] ? '₹' + num(r['MRP']).toLocaleString() : '—'}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid #1e293b', fontSize: 13 }}><StatusPill status={r['Status']} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
