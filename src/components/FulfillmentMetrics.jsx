import { useMemo } from 'react'
import { uniqueByPO, parseMMDDDate } from '../lib/utils'

export function FulfillmentMetrics({ data }) {
  const metrics = useMemo(() => {
    const poData = uniqueByPO(data)
    const now = new Date()
    
    const leadTimes = []
    const bookingLeadTimes = []
    const deliveryLeadTimes = []
    const todayPOs = []
    const thisWeekPOs = []
    
    for (const r of poData) {
      const released = parseMMDDDate(r['PO Released Date(MM-DD-YYYY)'])
      const appointment = parseMMDDDate(r['Appointment Date(MM-DD-YYYY)'])
      const delivered = parseMMDDDate(r['Actual Delivery Date(MM-DD-YYYY)'])
      
      if (!released) continue
      
      // Today's POs
      const isToday = released.toDateString() === now.toDateString()
      if (isToday) todayPOs.push(r)
      
      // This week's POs
      const weekAgo = new Date(now)
      weekAgo.setDate(weekAgo.getDate() - 7)
      if (released >= weekAgo) thisWeekPOs.push(r)
      
      // Booking lead time (Release → Appointment)
      if (appointment) {
        const bookingDays = Math.round((appointment - released) / 86400000)
        if (bookingDays >= 0 && bookingDays <= 60) {
          bookingLeadTimes.push(bookingDays)
          leadTimes.push(bookingDays)
        }
      }
      
      // Delivery lead time (Appointment → Delivery)
      if (appointment && delivered) {
        const deliveryDays = Math.round((delivered - appointment) / 86400000)
        if (deliveryDays >= 0 && deliveryDays <= 60) {
          deliveryLeadTimes.push(deliveryDays)
        }
      }
    }
    
    const avg = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0
    const median = (arr) => {
      if (!arr.length) return 0
      const sorted = [...arr].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    }
    
    const avgBooking = avg(bookingLeadTimes)
    const avgDelivery = avg(deliveryLeadTimes)
    const avgTotal = avgBooking + avgDelivery
    
    // SLA compliance (assuming 10-day target for total lead time)
    const slaTarget = 10
    const metSLA = leadTimes.filter(l => l <= slaTarget).length
    const slaCompliance = leadTimes.length ? Math.round(metSLA / leadTimes.length * 100) : 0
    
    // Fulfillment speed (POs released today that are already dispatched)
    const todayDispatched = todayPOs.filter(r => 
      ['In-Transit', 'Delivered'].includes(r['Status'] || '')
    ).length
    const todayFulfillRate = todayPOs.length ? Math.round(todayDispatched / todayPOs.length * 100) : 0
    
    return {
      avgBookingLead: avgBooking,
      medianBookingLead: median(bookingLeadTimes),
      avgDeliveryLead: avgDelivery,
      medianDeliveryLead: median(deliveryLeadTimes),
      avgTotalLead: avgTotal,
      slaCompliance,
      slaTarget,
      todayPOsCount: todayPOs.length,
      thisWeekPOsCount: thisWeekPOs.length,
      todayFulfillRate,
      totalPOsTracked: leadTimes.length
    }
  }, [data])
  
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 16,
      marginBottom: 20
    }}>
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: '16px 20px'
      }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>AVG FULFILLMENT TIME</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>{metrics.avgTotalLead} <span style={{ fontSize: 14, color: '#64748b' }}>days</span></div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
          Release → Delivery
        </div>
      </div>
      
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: '16px 20px'
      }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>SLA COMPLIANCE</div>
        <div style={{ 
          fontSize: 28, 
          fontWeight: 700, 
          color: metrics.slaCompliance >= 80 ? '#22c55e' : metrics.slaCompliance >= 50 ? '#eab308' : '#ef4444' 
        }}>
          {metrics.slaCompliance}%
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
          Target: {metrics.slaTarget} days
        </div>
      </div>
      
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: '16px 20px'
      }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>TODAY'S POS</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#a855f7' }}>{metrics.todayPOsCount}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
          {metrics.todayFulfillRate}% dispatched
        </div>
      </div>
      
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: '16px 20px'
      }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>THIS WEEK</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#f97316' }}>{metrics.thisWeekPOsCount}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
          {metrics.totalPOsTracked} POs tracked
        </div>
      </div>
    </div>
  )
}
