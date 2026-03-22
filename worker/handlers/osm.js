// ============================================================
// osm.js — OpenStreetMap / Overpass API handler (receptors, water)
// Implemented in v0.5.0 (receptors) and v0.7.0 (water sources)
// No API key required.
// ============================================================

import { jsonResponse } from '../cors.js';

export function handleOSM(request, env, url) {
  // TODO v0.5.0:
  // GET /api/osm/receptors?lat=&lng=&radius=1609 (radius in meters, default 1 mile)
  //   - Overpass query for: schools, hospitals, nursing homes, residential areas, major roads
  //   - Return list with name, type, coordinates
  // TODO v0.7.0:
  // GET /api/osm/water?bbox=
  //   - Overpass query for streams, rivers, ponds, lakes within/adjacent to burn unit
  return jsonResponse({ error: 'Not implemented.' }, 501);
}
