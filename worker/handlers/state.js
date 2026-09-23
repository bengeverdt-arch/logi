// ============================================================
// state.js — which US state the unit sits in (Census TIGERweb).
// National. Lets the frontend show state-specific add-ons (e.g. the
// KY / KPFC notes on the BSMP checklist) only where they apply.
// ============================================================

import { jsonResponse } from '../cors.js';
import { queryArcGIS } from './arcgis.js';

export const STATES_URL =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query';

export async function handleState(request, env, url) {
  const lat = parseFloat(url.searchParams.get('lat'));
  const lng = parseFloat(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: 'Missing lat or lng.' }, 400);
  }

  let data;
  try {
    data = await queryArcGIS(STATES_URL, {
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'STUSAB,NAME',
      returnGeometry: 'false',
    }, 'TIGERweb states');
  } catch (err) {
    return jsonResponse({ error: err.message }, 502);
  }

  const attrs = data.features?.[0]?.attributes;
  return jsonResponse({
    state: attrs?.STUSAB ?? null,
    state_name: attrs?.NAME ?? null,
    source: 'Census TIGERweb',
  });
}
