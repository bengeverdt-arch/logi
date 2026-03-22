// ============================================================
// nws.js — NWS API handler (spot forecast, alerts)
// Implemented in v0.4.0
// No API key required.
// ============================================================

import { jsonResponse } from '../cors.js';

export function handleNWS(request, env, url) {
  // TODO v0.4.0:
  // GET /api/nws/forecast?lat=&lng=
  //   - Hit NWS /points/{lat},{lng} to get forecast office and grid coords
  //   - Fetch forecast from /gridpoints/{office}/{x},{y}/forecast
  //   - Return parsed forecast periods (wind, RH, mixing height, transport winds)
  //   - Also return raw forecast text
  // GET /api/nws/alerts?lat=&lng=
  //   - Check for active RED FLAG warnings at coordinates
  return jsonResponse({ error: 'Not implemented.' }, 501);
}
