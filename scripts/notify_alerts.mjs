/**
 * Instant Alert Notification Dispatcher for Instamart Monitor Agent
 * 
 * Supports:
 * - WhatsApp API (CallMeBot free personal/group WhatsApp gateway)
 * - Telegram Bot API (Markdown formatted messages with emojis)
 * - Generic Webhooks (Discord, Slack, Make, Zapier, WhatsApp Business Cloud API)
 */

export async function sendAlertNotifications(alerts, summary) {
  if (!alerts || alerts.length === 0) {
    console.log('ℹ️ No new price or stock alerts to dispatch.');
    return;
  }

  console.log(`\n🔔 Dispatching ${alerts.length} Instant Alert Notifications...`);

  const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // 1. WhatsApp Dispatch (via CallMeBot Free WhatsApp Gateway)
  const whatsappPhone = process.env.WHATSAPP_PHONE;
  const whatsappApiKey = process.env.WHATSAPP_APIKEY;

  if (whatsappPhone && whatsappApiKey) {
    try {
      let waMessage = `🚨 *GEM'S GOLD Instamart Alerts*\n📅 ${nowIST}\n\n`;
      alerts.slice(0, 8).forEach((alert, idx) => {
        waMessage += `${idx + 1}. *${alert.type}* [${alert.city}]\n${alert.message}\n\n`;
      });
      if (summary) {
        waMessage += `📊 *Active:* ${summary.totalInStock}/${summary.totalMonitoredPairs} SKUs In-Stock • Avg 1L: ₹${summary.avgBottle1LPrice}`;
      }

      const cleanPhone = whatsappPhone.replace(/[^0-9]/g, '');
      const waUrl = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodeURIComponent(waMessage)}&apikey=${encodeURIComponent(whatsappApiKey)}`;
      
      const res = await fetch(waUrl);
      if (res.ok) {
        console.log(`✅ WhatsApp alert successfully sent to +${cleanPhone}!`);
      } else {
        console.warn('⚠️ WhatsApp dispatch response status:', res.status);
      }
    } catch (err) {
      console.error('❌ Error sending WhatsApp notification:', err.message);
    }
  }

  // 2. Telegram Dispatch
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (telegramToken && telegramChatId) {
    try {
      let tgMessage = `🚨 *GEM'S GOLD Instamart Price & Stock Alerts*\n📅 *${nowIST}*\n\n`;
      alerts.slice(0, 10).forEach((alert, idx) => {
        tgMessage += `${idx + 1}. *${alert.type}* [${alert.city}]\n`;
        tgMessage += `👉 ${alert.message}\n\n`;
      });

      if (summary) {
        tgMessage += `📊 *Summary:* ${summary.totalInStock}/${summary.totalMonitoredPairs} SKUs Active • Avg 1L: ₹${summary.avgBottle1LPrice}`;
      }

      const tgUrl = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
      const response = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: tgMessage,
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

  // 3. Generic Webhook (Discord / Slack / Make / Zapier / WhatsApp Cloud API)
  const genericWebhookUrl = process.env.ALERT_WEBHOOK_URL;
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

  if (!whatsappPhone && !telegramToken && !genericWebhookUrl) {
    console.log('ℹ️ Tip: Set WHATSAPP_PHONE & WHATSAPP_APIKEY or TELEGRAM_BOT_TOKEN in repository secrets to receive instant mobile alerts.');
  }
}
