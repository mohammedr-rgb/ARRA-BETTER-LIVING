/**
 * Alert dispatcher with bounded timeouts, retries and delivery results.
 * Only alerts with verified, fresh source evidence may be sent.
 */
const REQUEST_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 2;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (response.ok || response.status < 500 || attempt === MAX_ATTEMPTS) return { response, attempts: attempt };
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
    } finally {
      clearTimeout(timer);
    }
    await sleep(300 * attempt);
  }
  return { error: lastError, attempts: MAX_ATTEMPTS };
}

function verifiedAlerts(alerts) {
  const now = Date.now();
  return (Array.isArray(alerts) ? alerts : []).filter(alert => {
    if (alert?.observationStatus !== 'VERIFIED' || !alert?.source || !alert?.observedAt) return false;
    const observedAt = Date.parse(alert.observedAt);
    return Number.isFinite(observedAt) && observedAt <= now && now - observedAt <= 86400000;
  });
}

async function deliver(channel, url, options) {
  const result = await fetchWithRetry(url, options);
  if (result.error) {
    console.error(`Alert delivery failed for ${channel} after ${result.attempts} attempts: ${result.error.name || 'network error'}`);
    return { channel, success: false, attempts: result.attempts, error: result.error.name || 'network error' };
  }
  let success = result.response.ok;
  if (channel === 'telegram') {
    try { success = success && (await result.response.json()).ok === true; } catch { success = false; }
  }
  if (!success) console.warn(`Alert delivery failed for ${channel}: HTTP ${result.response.status}`);
  else console.log(`Alert delivered through ${channel}.`);
  return { channel, success, attempts: result.attempts, status: result.response.status };
}

export async function sendAlertNotifications(alerts, summary) {
  const safeAlerts = verifiedAlerts(alerts);
  if (!safeAlerts.length) {
    console.log('No verified, fresh alerts to dispatch; no notification sent.');
    return [];
  }
  const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const lines = safeAlerts.slice(0, 8).map((alert, index) => `${index + 1}. ${alert.type} [${alert.city}]\n${alert.message}`);
  const message = `GEM'S GOLD Instamart verified alerts\n${nowIST}\n\n${lines.join('\n\n')}`;
  const results = [];
  const phone = process.env.WHATSAPP_PHONE?.replace(/[^0-9]/g, '');
  const apiKey = process.env.WHATSAPP_APIKEY;
  if (phone && apiKey) {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apiKey)}`;
    results.push(await deliver('whatsapp', url));
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) {
    results.push(await deliver('telegram', `https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message })
    }));
  }
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (webhook) {
    results.push(await deliver('webhook', webhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: "GEM'S GOLD Instamart Verified Alerts", timestamp: new Date().toISOString(), alertsCount: safeAlerts.length, alerts: safeAlerts, summary })
    }));
  }
  if (!results.length) console.log('No alert channel configured; set notification secrets to enable delivery.');
  return results;
}
