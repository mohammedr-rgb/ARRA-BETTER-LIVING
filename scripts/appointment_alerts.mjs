const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/14riCGmsLkuomzSETNSITLulbWyl7hono2U4NMRowpdI/export?format=csv&gid=1664329820'
const DASHBOARD_URL = 'https://mohammedr-rgb.github.io/ARRA-BETTER-LIVING/?tab=orders'
const TIME_ZONE = 'Asia/Kolkata'
const DAY_MS = 24 * 60 * 60 * 1000

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1 }
      else if (char === '"') quoted = false
      else value += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(value); value = '' }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = '' }
    else value += char
  }
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row) }
  const headers = (rows.shift() || []).map(header => header.replace(/^\uFEFF/, '').trim())
  return rows.filter(values => values.some(cell => cell.trim())).map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()])))
}

function parseDateKey(value) {
  const input = String(value || '').trim()
  let match = input.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  match = input.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (!match) return null
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`
}

function dateKeyInIST(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addDays(key, amount) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10)
}

function formatDate(key) {
  if (!key) return 'Date not set'
  const [year, month, day] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
    timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
  })
}

function aggregateAppointments(rows) {
  const byPOAndDate = new Map()
  for (const row of rows) {
    const po = row['PO Number']
    const date = parseDateKey(row['Appointment Date(MM-DD-YYYY)'])
    if (!po || !date) continue
    const key = `${po}|${date}`
    if (!byPOAndDate.has(key)) byPOAndDate.set(key, { po, date, city: row['City'] || '—', platform: row['Platform'] || '—', facility: row['FacilityName'] || '—', transporter: row['Transporter'] || '—', appointmentId: row['Appointment ID'] || '—', status: row['Status'] || '—', qty: 0, boxes: 0, tonnage: 0 })
    const appointment = byPOAndDate.get(key)
    appointment.qty += Number(String(row['PO Qty'] || 0).replace(/,/g, '')) || 0
    appointment.boxes += Number(String(row['Box Count'] || 0).replace(/,/g, '')) || 0
    appointment.tonnage += Number(String(row['Tonnage'] || 0).replace(/,/g, '')) || 0
  }
  return [...byPOAndDate.values()].sort((a, b) => a.date.localeCompare(b.date) || a.city.localeCompare(b.city) || a.po.localeCompare(b.po))
}

function appointmentLine(appointment) {
  return `${appointment.po} | ${appointment.city} | ${appointment.platform} | ${formatDate(appointment.date)} | Appt ID ${appointment.appointmentId} | ${appointment.status} | ${Math.round(appointment.boxes).toLocaleString('en-IN')} boxes`
}

function buildDigest(appointments, today) {
  const tomorrow = addDays(today, 1)
  const weekEnd = addDays(today, 7)
  const todayRows = appointments.filter(row => row.date === today)
  const tomorrowRows = appointments.filter(row => row.date === tomorrow)
  const weekRows = appointments.filter(row => row.date >= today && row.date <= weekEnd)
  const blocks = [
    [`TODAY — ${formatDate(today)} (${todayRows.length})`, todayRows],
    [`TOMORROW — ${formatDate(tomorrow)} (${tomorrowRows.length})`, tomorrowRows],
    [`NEXT 7 DAYS — through ${formatDate(weekEnd)} (${weekRows.length})`, weekRows],
  ]
  const text = blocks.map(([heading, rows]) => `${heading}\n${rows.length ? rows.map(appointmentLine).join('\n') : 'No appointments'}`).join('\n\n')
  return { text, todayRows, tomorrowRows, weekRows }
}

function parseList(value) {
  return String(value || '').split(/[;,\n]/).map(item => item.trim()).filter(Boolean)
}

async function sendEmail(digest, runDate) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.APPOINTMENT_EMAIL_FROM
  const recipients = parseList(process.env.APPOINTMENT_EMAIL_TO)
  if (!apiKey || !from || !recipients.length) {
    console.warn('Email alert skipped: set RESEND_API_KEY, APPOINTMENT_EMAIL_FROM, and APPOINTMENT_EMAIL_TO.')
    return false
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `Appointment alerts — ${formatDate(runDate)}`,
      text: `${digest.text}\n\nDashboard: ${DASHBOARD_URL}`,
    }),
  })
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`)
  console.log(`Appointment email sent to ${recipients.length} recipient(s).`)
  return true
}

function whatsappText(digest) {
  const sections = [
    ['Today', digest.todayRows],
    ['Tomorrow', digest.tomorrowRows],
    ['Next 7 days', digest.weekRows],
  ]
  const lines = sections.map(([label, rows]) => {
    const preview = rows.slice(0, 3).map(row => `${row.po} · ${row.city} · ${formatDate(row.date)}`)
    if (rows.length > preview.length) preview.push(`+${rows.length - preview.length} more`)
    return `${label}: ${rows.length}${preview.length ? `\n${preview.join('\n')}` : ''}`
  })
  let result = `${lines.join('\n\n')}\n\nFull list: ${DASHBOARD_URL}`
  if (result.length > 950) result = `${result.slice(0, 925)}…\n${DASHBOARD_URL}`
  return result
}

async function sendWhatsApp(digest) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US'
  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || 'v26.0'
  const recipients = parseList(process.env.APPOINTMENT_WHATSAPP_TO).map(phone => phone.replace(/\D/g, ''))
  if (!token || !phoneNumberId || !templateName || !recipients.length) {
    console.warn('WhatsApp alert skipped: configure the Cloud API token, phone number ID, approved template name, and APPOINTMENT_WHATSAPP_TO.')
    return false
  }
  const message = whatsappText(digest)
  for (const recipient of recipients) {
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          components: [{ type: 'body', parameters: [{ type: 'text', text: message }] }],
        },
      }),
    })
    if (!response.ok) throw new Error(`WhatsApp provider returned HTTP ${response.status} for one recipient`)
  }
  console.log(`Appointment WhatsApp alert sent to ${recipients.length} recipient(s).`)
  return true
}

async function main() {
  const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.APPOINTMENT_EMAIL_FROM && parseList(process.env.APPOINTMENT_EMAIL_TO).length)
  const whatsappConfigured = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME && parseList(process.env.APPOINTMENT_WHATSAPP_TO).length)
  if (!emailConfigured && !whatsappConfigured) {
    console.log('No appointment alert channel is configured; nothing fetched or sent.')
    return
  }

  const response = await fetch(SHEET_CSV_URL, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Appointment sheet returned HTTP ${response.status}`)
  const rows = parseCsv(await response.text())
  if (!rows.length || !rows.some(row => 'Appointment Date(MM-DD-YYYY)' in row && 'PO Number' in row)) {
    throw new Error('Appointment sheet is empty or does not have the expected columns.')
  }
  const today = dateKeyInIST()
  const digest = buildDigest(aggregateAppointments(rows), today)
  const total = new Set([...digest.todayRows, ...digest.tomorrowRows, ...digest.weekRows].map(row => `${row.po}|${row.date}`)).size
  console.log(`Prepared appointment alert for ${formatDate(today)}: today ${digest.todayRows.length}, tomorrow ${digest.tomorrowRows.length}, next 7 days ${digest.weekRows.length}.`)
  if (!total) {
    console.log('No appointments in the alert windows; no notification sent.')
    return
  }
  if (process.env.APPOINTMENT_ALERT_DRY_RUN === 'true') {
    console.log('Dry run enabled; no notification sent.')
    return
  }
  if (emailConfigured) await sendEmail(digest, today)
  else console.warn('Email alert skipped: email delivery is not configured.')
  if (whatsappConfigured) await sendWhatsApp(digest)
  else console.warn('WhatsApp alert skipped: WhatsApp delivery is not configured.')
}

main().catch(error => {
  console.error(`Appointment alert run failed: ${error.message}`)
  process.exitCode = 1
})
