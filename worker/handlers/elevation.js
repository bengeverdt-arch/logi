// ============================================================
// elevation.js — USGS Elevation Point Query Service proxy
// Returns elevation in feet for a given lat/lng.
// No API key required.
// ============================================================

import { jsonResponse } from '../cors.js';

export async function handleElevation(request, env, url) {
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  if (!lat || !lng) return jsonResponse({ error: 'Missing lat or lng.' }, 400);

  try {
    const res = await fetch(
      `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&wkid=4326&includeDate=false`,
      { headers: { 'User-Agent': 'LOGI-BurnPlanningTool/0.9' } }
    );
    if (!res.ok) throw new Error(`EPQS HTTP ${res.status}`);
    const data = await res.json();
    // EPQS returns -1000000 for no-data locations (ocean, etc.)
    const raw = parseFloat(data.value);
    const elevation_ft = !isNaN(raw) && raw > -9999 ? Math.round(raw) : null;
    return jsonResponse({ elevation_ft });
  } catch (err) {
    return jsonResponse({ error: err.message }, 502);
  }
}
