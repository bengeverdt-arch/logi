// ============================================================
// firedistrict.js — fire department whose response area covers the unit
// Source: Kentucky 911 Fire Response Service Boundaries (NG911 GIS,
// maintained by county 911 agencies). KENTUCKY ONLY — there is no
// national fire-district boundary dataset. Outside KY this returns
// fire_department: null and the plan field stays blank for manual entry.
// ============================================================

import { jsonResponse } from '../cors.js';
import { queryArcGIS } from './arcgis.js';

const KY_FIRE_URL =
  'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_911_RSB_Fire_WGS84WM/MapServer/0/query';

export async function handleFireDistrict(request, env, url) {
  const lat = parseFloat(url.searchParams.get('lat'));
  const lng = parseFloat(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: 'Missing lat or lng.' }, 400);
  }

  let data;
  try {
    data = await queryArcGIS(KY_FIRE_URL, {
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'DsplayName,DateUpdate',
      returnGeometry: 'false',
    }, 'KY 911 fire boundaries');
  } catch (err) {
    return jsonResponse({ error: err.message }, 502);
  }

  const names = [...new Set((data.features || [])
    .map(f => f.attributes.DsplayName?.trim())
    .filter(Boolean))];

  return jsonResponse({
    // More than one hit means the point sits on a boundary — list both.
    fire_department: names.length ? names.join(' / ') : null,
    source: 'Kentucky 911 Fire Response Service Boundaries',
    coverage: 'KY only',
  });
}
