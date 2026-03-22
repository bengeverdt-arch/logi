// ============================================================
// landstatus.js — Federal land status via Esri USA Federal Lands
// No API key required.
// Covers: BLM, NPS, USFS, FWS, BOR, DOD
// ============================================================

import { jsonResponse } from '../cors.js';

const FEDERAL_LANDS_URL =
  'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Federal_Lands/FeatureServer/0/query';

export async function handleLandStatus(request, env, url) {
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');

  if (!lat || !lng) return jsonResponse({ error: 'Missing lat or lng.' }, 400);

  const params = new URLSearchParams({
    geometry:        JSON.stringify({ x: parseFloat(lng), y: parseFloat(lat), spatialReference: { wkid: 4326 } }),
    geometryType:    'esriGeometryPoint',
    spatialRel:      'esriSpatialRelIntersects',
    outFields:       'Agency,unit_name',
    returnGeometry:  'false',
    f:               'json',
  });

  let data;
  try {
    const res = await fetch(`${FEDERAL_LANDS_URL}?${params}`);
    if (!res.ok) throw new Error(`Esri HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    return jsonResponse({ error: `Land status API error: ${err.message}` }, 502);
  }

  if (data.error) {
    return jsonResponse({ error: `Esri error: ${data.error.message || JSON.stringify(data.error)}` }, 502);
  }

  const features = data.features || [];
  if (!features.length) {
    return jsonResponse({ federal: null });
  }

  const attrs = features[0].attributes;
  return jsonResponse({
    federal: {
      agency:    attrs.Agency,
      unit_name: attrs.unit_name,
    },
  });
}
