// ============================================================
// femastructures.js — FEMA USA Structures (ORNL), residential only
// Every building >450 sq ft, traced from satellite imagery, with an
// automated occupancy class. Replaces OSM building tags for homes:
// OSM had 13 homes within 1 mi of Berea, FEMA has ~1,800.
// Verified 2026-09-22 against Census 2020 housing units in 5 KY tracts:
// FEMA ÷ Census = 0.63–1.43 (low in town where one apartment building
// holds many units, high in rural tracts where some barns are counted).
// Imagery is ~2015 — homes built since then are missing.
// ============================================================

import { queryArcGIS } from './arcgis.js';

const FEMA_URL =
  'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0/query';

const LABEL = 'FEMA USA Structures';
const NEAREST_N = 10;
// Search outward in steps so the nearest homes are found without pulling
// thousands of buildings in town (service max is 2000 per request).
const STEPS_M = [200, 402, 804];

function circle(lat, lng, radiusMeters) {
  return {
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    distance: String(radiusMeters),
    units: 'esriSRUnit_Meter',
    spatialRel: 'esriSpatialRelIntersects',
    where: "OCC_CLS='Residential'",
  };
}

export async function getFEMAResidential(lat, lng, radiusMeters) {
  lat = parseFloat(lat);
  lng = parseFloat(lng);

  const countP = queryArcGIS(FEMA_URL, { ...circle(lat, lng, radiusMeters), returnCountOnly: 'true' }, LABEL);

  let homes = [];
  for (const r of [...STEPS_M.filter(s => s < radiusMeters), radiusMeters]) {
    const data = await queryArcGIS(FEMA_URL, {
      ...circle(lat, lng, r),
      outFields: 'LATITUDE,LONGITUDE',
      returnGeometry: 'false',
    }, LABEL);
    homes = (data.features || []).map(f => ({
      name: null,
      type: 'residential',
      lat: f.attributes.LATITUDE,
      lng: f.attributes.LONGITUDE,
    }));
    if (homes.length >= NEAREST_N) break;
  }

  const { count } = await countP;
  return { homes, total: count };
}

export const FEMA_NEAREST_N = NEAREST_N;
