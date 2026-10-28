/**
 * Backwards-compatible entry point. The monitor deliberately publishes Unknown
 * until an authorized live Instamart source is configured; no synthetic values.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInstamartMonitorAgent } from './instamart_monitor_safe.mjs';
export { runInstamartMonitorAgent };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runInstamartMonitorAgent().catch(error => {
    console.error('Instamart monitor failed:', error?.message || error);
    process.exitCode = 1;
  });
}
