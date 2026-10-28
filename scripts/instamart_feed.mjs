const DEFAULT_TIMEOUT_MS = 12000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function normalizeAuthorizedFeedPayload(payload, { cities, skus, now = Date.now() }) {
  if (!payload || !Array.isArray(payload.observations)) {
    throw new Error('Feed response must be a JSON object with an observations array.');
  }
  const cityIds = new Set(cities.map(city => city.id));
  const skuIds = new Set(skus.map(sku => sku.id));
  const latest = new Map();
  for (const item of payload.observations) {
    if (!item || typeof item !== 'object') continue;
    const cityId = String(item.cityId || '').trim().toUpperCase().replace(/\s+/g, '_');
    const skuId = String(item.skuId || '').trim();
    if (!cityIds.has(cityId) || !skuIds.has(skuId)) continue;
    const observedMs = Date.parse(item.observedAt || '');
    if (!Number.isFinite(observedMs) || observedMs > now || now - observedMs > MAX_AGE_MS) continue;
    const sellingPrice = item.sellingPrice == null ? null : Number(item.sellingPrice);
    const mrp = item.mrp == null ? null : Number(item.mrp);
    const inStock = typeof item.inStock === 'boolean' ? item.inStock : null;
    if (!(Number.isFinite(sellingPrice) && sellingPrice > 0) && inStock === null) continue;
    if (sellingPrice !== null && (!Number.isFinite(sellingPrice) || sellingPrice <= 0)) continue;
    if (mrp !== null && (!Number.isFinite(mrp) || mrp <= 0)) continue;
    const sourceUrl = typeof item.sourceUrl === 'string' && /^https:\/\//i.test(item.sourceUrl) ? item.sourceUrl : null;
    const record = {
      cityId, skuId, sellingPrice, mrp, inStock,
      observedAt: new Date(observedMs).toISOString(),
      source: String(item.source || 'authorized-instamart-feed').slice(0, 120),
      sourceUrl,
      observationStatus: 'VERIFIED'
    };
    const key = `${cityId}_${skuId}`;
    const existing = latest.get(key);
    if (!existing || Date.parse(existing.observedAt) < observedMs) latest.set(key, record);
  }
  return [...latest.values()];
}

export function normalizeAuthorizedCompetitors(payload, { cities, now = Date.now() }) {
  if (!Array.isArray(payload?.competitors)) return [];
  const cityIds = new Set(cities.map(city => city.id));
  const latest = new Map();
  for (const item of payload.competitors) {
    if (!item || typeof item !== 'object') continue;
    const city = String(item.cityId || '').trim().toUpperCase().replace(/\s+/g, '_');
    const brand = String(item.brand || '').trim();
    const volumeMl = Number(item.volumeMl);
    const sellingPrice = Number(item.sellingPrice);
    const observedMs = Date.parse(item.observedAt || '');
    if (!cityIds.has(city) || !brand || brand.toUpperCase() === "GEM'S GOLD") continue;
    if (!Number.isFinite(volumeMl) || volumeMl <= 0 || !Number.isFinite(sellingPrice) || sellingPrice <= 0) continue;
    if (!Number.isFinite(observedMs) || observedMs > now || now - observedMs > MAX_AGE_MS) continue;
    const sourceUrl = typeof item.sourceUrl === 'string' && /^https:\/\//i.test(item.sourceUrl) ? item.sourceUrl : null;
    const record = {
      city, brand, volumeMl, sellingPrice,
      mrp: item.mrp == null ? null : Number(item.mrp),
      inStock: typeof item.inStock === 'boolean' ? item.inStock : null,
      observedAt: new Date(observedMs).toISOString(),
      source: String(item.source || 'authorized-licensed-competitor-feed').slice(0, 120),
      sourceUrl, observationStatus: 'VERIFIED'
    };
    const key = `${city}|${brand.toUpperCase()}|${volumeMl}`;
    const existing = latest.get(key);
    if (!existing || Date.parse(existing.observedAt) < observedMs) latest.set(key, record);
  }
  return [...latest.values()];
}

export async function fetchAuthorizedInstamartFeed({
  url = process.env.INSTAMART_FEED_URL,
  token = process.env.INSTAMART_FEED_TOKEN,
  cities,
  skus,
  now = Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!url || !token) {
    return { configured: false, observations: [], status: 'NO_AUTHORIZED_FEED_CONFIGURED' };
  }
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('INSTAMART_FEED_URL must be a valid HTTPS URL.'); }
  if (parsed.protocol !== 'https:') throw new Error('INSTAMART_FEED_URL must use HTTPS.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`Authorized feed returned HTTP ${response.status}.`);
    const payload = await response.json();
    const observations = normalizeAuthorizedFeedPayload(payload, { cities, skus, now });
    return {
      configured: true,
      observations,
      competitorObservations: normalizeAuthorizedCompetitors(payload, { cities, now }),
      status: observations.length ? 'AUTHORIZED_FEED_OK' : 'NO_FRESH_VALID_OBSERVATIONS'
    };
  } finally {
    clearTimeout(timeout);
  }
}
