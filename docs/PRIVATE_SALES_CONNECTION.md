# Private Sales workbook connection

The Sales page uses a Google Apps Script web app as a small read-only filter. It reads only `Overall sales`, `Ads Spend`, and `Logistics` from the private workbook, then returns the aggregate metrics already displayed on the dashboard. It never returns source grids or rows from other tabs. The public dashboard and its filtered endpoint do expose those selected aggregate sales, advertising, monthly logistics, and carrier totals to dashboard visitors.

## One-time setup

1. Open the Sales workbook while signed in to the account that can read it. Do not change the workbook's sharing settings.
2. In the workbook, open **Extensions → Apps Script**. Replace the editor contents with `apps-script/SalesMetrics.gs` from this repository. In **Project Settings**, enable **Show `appsscript.json` manifest file in editor**, then replace the manifest with `apps-script/appsscript.json`.
3. Save. Choose **Deploy → New deployment → Web app**. Set **Execute as** to your account and **Who has access** to **Anyone** (if your Workspace blocks this option, stop and ask the Workspace admin; do not make the workbook public). Deploy and approve the read-only spreadsheet permission for this script.
4. Copy the deployed URL. It must end in `/exec`.
5. In GitHub, open **ARRA-BETTER-LIVING → Settings → Secrets and variables → Actions → Variables → New repository variable**. Name it `VITE_SALES_METRICS_URL` and set its value to the deployed `/exec` URL. This URL is not a secret; it serves only the allowlisted aggregate response.
6. In **Actions → Instamart Live Monitor**, choose **Run workflow**. The updated workflow will build and publish the dashboard using that variable. Open Sales and use **Refresh Sales Data**.

The script is deliberately read-only and accepts no sheet or range parameters. The only returned fields are the summaries consumed by `src/tabs/SalesTab.jsx`. The Apps Script cache refreshes the output every five minutes; the dashboard's refresh button can still return the cached response during that window.

If Google does not offer **Anyone** for the web app, the domain may restrict anonymous Apps Script access. Keep the workbook private and use a Workspace-approved proxy instead. Do not work around a domain policy by publishing the source sheet.
