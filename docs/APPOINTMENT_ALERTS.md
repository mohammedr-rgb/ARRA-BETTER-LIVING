# Appointment alerts

The scheduled workflow runs at **10:00 AM and 5:00 PM IST**. It reads the dashboard's appointment sheet and sends one email digest and one WhatsApp template message to each configured recipient. The digest contains separate sections for today's appointments, tomorrow's appointments, and the next seven days (the seven-day section follows the dashboard's inclusive window and therefore includes today's and tomorrow's appointments).

The workflow is intentionally inactive until at least one delivery channel is configured. It does not fetch appointment data when both channels are unconfigured.

## Configure GitHub Actions secrets

In the repository, open **Settings → Secrets and variables → Actions → New repository secret**. Add:

### Email

- `RESEND_API_KEY`: a sending-only Resend API key.
- `APPOINTMENT_EMAIL_FROM`: a sender address on a domain verified in Resend.
- `APPOINTMENT_EMAIL_TO`: comma-separated recipient email addresses.

Resend requires an API key and a verified sending domain before production email can be sent.

### WhatsApp

- `WHATSAPP_ACCESS_TOKEN`: a WhatsApp Business Cloud API access token with messaging permission.
- `WHATSAPP_PHONE_NUMBER_ID`: the registered business phone number ID.
- `WHATSAPP_TEMPLATE_NAME`: the name of an approved utility template whose body contains one text variable (`{{1}}`), for example `Appointment alerts:\n{{1}}`.
- `WHATSAPP_TEMPLATE_LANGUAGE`: the approved template language code, such as `en_US` (optional; defaults to `en_US`).
- `APPOINTMENT_WHATSAPP_TO`: comma-separated recipient numbers with country codes.

WhatsApp template approval and a registered Cloud API sender are required for scheduled outbound reminders. The workflow uses the WhatsApp Graph API v26.0.

## Schedule

The GitHub Actions cron is `30 4,11 * * *` UTC, corresponding to 10:00 AM and 5:00 PM IST. GitHub may start scheduled jobs a few minutes after the requested time. A maintainer can also run **Appointment Alerts → Run workflow** after configuring secrets.
