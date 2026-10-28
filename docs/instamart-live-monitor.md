# Instamart live monitoring setup

## Status and authorization

The monitor does not scrape Instamart pages or invent data. It reads a licensed/authorized HTTPS feed. Live monitoring remains inactive until the feed owner has granted access and the repository secrets below are configured.

Do not use the official Swiggy Builders Club API for competitive-intelligence or competitor-benchmarking use cases: its published access rules prohibit those uses. Competitor observations may only be included if the chosen data provider explicitly licenses that use.

## Required GitHub Actions secrets

In GitHub, open Settings → Secrets and variables → Actions → New repository secret and add:

- INSTAMART_FEED_URL: HTTPS URL for the authorized JSON feed.
- INSTAMART_FEED_TOKEN: bearer token for that feed.

Optional notification secrets:

- WHATSAPP_PHONE and WHATSAPP_APIKEY
- TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
- ALERT_WEBHOOK_URL

Never put tokens in source code, JSON files, commits, or issue comments.

## Feed contract

The feed URL must return JSON with an observations array. Each observation describes one of the configured GEM'S GOLD target city/SKU pairs:

    {
      "observations": [
        {
          "cityId": "COIMBATORE",
          "skuId": "pouch_1l",
          "sellingPrice": 199,
          "mrp": 249,
          "inStock": true,
          "observedAt": "2026-10-28T10:00:00+05:30",
          "source": "licensed-provider",
          "sourceUrl": "https://provider.example/observation"
        }
      ],
      "competitors": []
    }

The example values are illustrative only, not actual Instamart prices. The monitor accepts only configured city/SKU IDs, HTTPS feed URLs, positive prices, boolean stock values, and observations no older than 24 hours or in the future. Unknown/missing fields remain unknown. Only fresh observations are published as verified.

Optional competitors records should be supplied only under an explicit provider licence permitting competitor benchmarking. Required fields: cityId, brand, volumeMl, sellingPrice, and observedAt; optional fields are mrp, inStock, source, and sourceUrl.

## Schedule and deployment

The GitHub Actions workflow runs hourly at minute 17 and on pushes to master. It runs tests first. If both feed secrets exist, it fetches/validates the feed, refreshes public data, commits changed observations, builds the dashboard, and deploys GitHub Pages. Without the secrets it warns and does not claim that live monitoring ran. A configured feed error fails the monitoring step rather than carrying old prices forward.
