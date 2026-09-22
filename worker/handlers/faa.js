// ============================================================
// faa.js — FAA Aeronautical Data (ADDS) Airports layer, heliports only
// Backup for OSM helipads when Overpass is down. FAA-maintained,
// updated monthly (last edit seen 2026-09).
// ============================================================

import { envelope, queryArcGIS } from './arcgis.js';

const FAA_URL =
  'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/US_Airport/FeatureServer/0/query';

export async function getFAAHeliports(lat, lng, radiusMeters) {
  lat = parseFloat(lat);
  lng = parseFloat(lng);

  const data = await queryArcGIS(FAA_URL, {
    geometry: envelope(lat, lng, radiusMeters),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    where: "TYPE_CODE='HP'",
    outFields: 'IDENT,NAME',
    returnGeometry: 'true',
  }, 'FAA heliports');

  return (data.features || [])
    .filter(f => f.geometry)
    .map(f => ({
      id: f.attributes.IDENT || null,
      name: f.attributes.NAME || null,
      lat: f.geometry.y,
      lng: f.geometry.x,
    }));
}
