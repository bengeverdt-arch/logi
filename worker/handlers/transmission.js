// ============================================================
// transmission.js — US Electric Power Transmission Lines
// Backup for OSM power lines when Overpass is down.
// HIGH-VOLTAGE ONLY (138–345 kV seen in KY) — local distribution lines
// along roads are not in this dataset. Line records were sourced
// 2014–2018, validated through 2019, last edited 2023-09.
// Verified 2026-09-22: real owners (Kentucky Utilities, EKPC) and
// substations (J K Smith, Fawkes) near Berea.
// ============================================================

import { envelope, queryArcGIS, nearestVertex } from './arcgis.js';

const TL_URL =
  'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query';

export async function getTransmissionLines(lat, lng, radiusMeters) {
  lat = parseFloat(lat);
  lng = parseFloat(lng);

  const data = await queryArcGIS(TL_URL, {
    geometry: envelope(lat, lng, radiusMeters),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    where: '1=1',
    outFields: 'OBJECTID_1,VOLTAGE,OWNER',
    returnGeometry: 'true',
    maxAllowableOffset: '0.0002',
  }, 'Transmission lines');

  return (data.features || []).map(f => {
    const pt = nearestVertex(f.geometry, lat, lng);
    if (!pt) return null;
    const a = f.attributes;
    const owner = a.OWNER && a.OWNER !== 'NOT AVAILABLE' ? a.OWNER : null;
    return {
      id: a.OBJECTID_1,
      name: owner,
      // Frontend expects volts, same as the OSM voltage tag.
      voltage: a.VOLTAGE > 0 ? String(Math.round(a.VOLTAGE * 1000)) : null,
      ...pt,
    };
  }).filter(Boolean);
}
