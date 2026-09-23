// ============================================================
// airnow.js — nearest ambient air monitors (EPA AirNow, national)
// Source: EPA OAR hosted service "AirNow Monitoring Site Data (Latest
// hour — Ozone and PM only)". Updated hourly, no key.
// Covers monitors that report in real time only — filter-based sites
// (e.g. some KY PM10 / lead samplers) are not in it; the frontend adds
// those from the KY list when the unit is near KY.
// Verified 2026-09-23 at Berea KY, Bozeman MT, Gainesville FL, Bend OR.
// ============================================================

import { jsonResponse } from '../cors.js';
import { queryArcGIS } from './arcgis.js';

const AIRNOW_URL =
  'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Air_Now_Current_Monitors_Ozone_and_PM/FeatureServer/0/query';

const RADIUS_MILES = 100;
const MAX_RETURNED = 10;

function haversine(lat1, lng1, lat2, lng2) {
  const R    = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
             * Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

export async function handleAirNow(request, env, url) {
  const lat = parseFloat(url.searchParams.get('lat'));
  const lng = parseFloat(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: 'Missing lat or lng.' }, 400);
  }

  let data;
  try {
    data = await queryArcGIS(AIRNOW_URL, {
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      distance: String(RADIUS_MILES),
      units: 'esriSRUnit_StatuteMile',
      spatialRel: 'esriSpatialRelIntersects',
      where: "Status = 'Active'",
      outFields: 'AQSID,SiteName,DataSource,MonitorType,PM25_AQI,OZONE_AQI,LocalTimeString',
      returnGeometry: 'true',
      outSR: '4326',
    }, 'EPA AirNow monitors');
  } catch (err) {
    return jsonResponse({ error: err.message }, 502);
  }

  const monitors = (data.features || [])
    .filter(f => f.geometry)
    .map(f => {
      const a = f.attributes;
      return {
        aqsid: a.AQSID,
        name: a.SiteName,
        agency: a.DataSource,
        temporary: a.MonitorType === 'Temporary',
        pm25_aqi: a.PM25_AQI ?? null,
        ozone_aqi: a.OZONE_AQI ?? null,
        observed: a.LocalTimeString ?? null,
        lat: f.geometry.y,
        lng: f.geometry.x,
        distance_miles: haversine(lat, lng, f.geometry.y, f.geometry.x),
      };
    })
    .sort((a, b) => a.distance_miles - b.distance_miles)
    .slice(0, MAX_RETURNED);

  return jsonResponse({
    monitors,
    radius_miles: RADIUS_MILES,
    source: 'EPA AirNow (latest hour, Ozone + PM)',
  });
}
