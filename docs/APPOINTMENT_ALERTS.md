# Appointment alerts (WhatsApp only)

The scheduled workflow runs at **10:00 AM and 5:00 PM IST**. It reads the dashboard appointment sheet and sends one WhatsApp template message to each configured recipient. The digest contains separate sections for today's appointments, tomorrow's appointments, and the next seven days (the seven-day section includes today and tomorrow).

The workflow stays inactive until every WhatsApp setting below is configured. It does not fetch appointment data or send messages before then.

## Configure GitHub Actions secrets

In the repository, open **Settings → Secrets and variables → Actions → New repository secret**. Add:

- `WHATSAPP_ACCESS_TOKEN`: a WhatsApp Business Cloud API access token with messaging permission.
- `WHATSAPP_PHONE_NUMBER_ID`: the registered business sending phone number ID (not the phone number itself).
- `WHATSAPP_TEMPLATE_NAME`: the name of an approved utility template whose body contains one text variable (`{{1}}`), for example `Appointment alerts:\\n{{1}}`.
- `WHATSAPP_TEMPLATE_LANGUAGE`: the approved template language code, such as `en_US` (optional; defaults to `en_US`).
- `APPOINTMENT_WHATSAPP_TO`: comma-separated recipient numbers with country codes.

WhatsApp template approval and a registered Cloud API sender are required for scheduled outbound reminders. The workflow uses the WhatsApp Graph API v26.0.

## Schedule

The GitHub Actions schedule is `30 4,11 * * *` UTC, corresponding to 10:00 AM and 5:00 PM IST. GitHub may start scheduled jobs a few minutes after the requested time. Use **Appointment Alerts → Run workflow** with dry run enabled to prepare a digest without sending messages. Turn off dry run only when you want to deliver the messages to all configured numbers.
