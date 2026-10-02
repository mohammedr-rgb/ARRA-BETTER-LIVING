/**
 * Instant Alert Notification Dispatcher for Instamart Monitor Agent
 * 
 * Supports:
 * - Telegram Bot API (Markdown formatted messages with emojis)
 * - Generic Webhooks (Discord, Slack, Make, Zapier, WhatsApp Business API)
 */

export async function sendAlertNotifications(alerts, summary) {
  if (!alerts || alerts.length === 0) {
    console.log('ℹ️ No new price or stock alerts to dispatch.');
    return;
  }

  console.log(`\n🔔 Dispatching ${alerts.length} Instant Alert Notifications...`);

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  const genericWebhookUrl = process.env.ALERT_WEBHOOK_URL;

  // 1. Telegram Dispatch
  if (telegramToken && telegramChatId) {
    try {
      const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      let message = `🚨 *GEM'S GOLD Instamart Price & Stock Alerts*\n📅 *${nowIST}*\n\n`;

      alerts.slice(0, 10).forEach((alert, idx) => {
        message += `${idx + 1}. *${alert.type}* [${alert.city}]\n`;
        message += `👉 ${alert.message}\n\n`;
      });

      if (summary) {
        message += `📊 *Summary:* ${summary.totalInStock}/${summary.totalMonitoredPairs} SKUs Active • Avg 1L: ₹${summary.avgBottle1LPrice}`;
      }

      const tgUrl = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
      const response = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: message,
          parse_mode: 'Markdown'
        })
      });

      const resJson = await response.json();
      if (resJson.ok) {
        console.log('✅ Telegram alert notifications sent successfully!');
      } else {
        console.warn('⚠️ Telegram dispatch warning:', resJson.description);
      }
    } catch (err) {
      console.error('❌ Error dispatching Telegram alert:', err.message);
    }
  }

  // 2. Generic Webhook (Discord / Slack / Make / WhatsApp Webhook Gateway)
  if (genericWebhookUrl) {
    try {
      const payload = {
        title: "GEM'S GOLD Instamart Monitor Alerts",
        timestamp: new Date().toISOString(),
        alertsCount: alerts.length,
        alerts: alerts,
        summary: summary
      };

      const response = await fetch(genericWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log('✅ Generic webhook alert notifications sent successfully!');
      } else {
        console.warn('⚠️ Webhook response status:', response.status);
      }
    } catch (err) {
      console.error('❌ Error dispatching webhook alert:', err.message);
    }
  }

  if (!telegramToken && !genericWebhookUrl) {
    console.log('ℹ️ Note: Set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID or ALERT_WEBHOOK_URL in repository secrets to receive instant mobile notifications.');
  }
}
