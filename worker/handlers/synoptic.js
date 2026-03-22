// ============================================================
// synoptic.js — Synoptic Data API handler (RAWS fuel moisture)
// Implemented in v0.3.0
// Requires: env.SYNOPTIC_TOKEN (set via: wrangler secret put SYNOPTIC_TOKEN)
// ============================================================

import { jsonResponse } from '../cors.js';

export function handleSynoptic(request, env, url) {
  // TODO v0.3.0:
  // GET /api/synoptic/nearest?lat=&lng=
  //   - Find nearest RAWS station to coordinates
  //   - Return station id, name, distance
  // GET /api/synoptic/timeseries?stid=&hours=72
  //   - Fetch fuel_moisture, air_temp, relative_humidity, wind_speed, wind_direction
  //   - Return last N hours of observations
  return jsonResponse({ error: 'Not implemented.' }, 501);
}
