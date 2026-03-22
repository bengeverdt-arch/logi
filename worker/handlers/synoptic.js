// ============================================================
// synoptic.js — Synoptic Data API proxy (RAWS fuel moisture)
// Requires env.SYNOPTIC_TOKEN
// Set via: wrangler secret put SYNOPTIC_TOKEN
// ============================================================

import { jsonResponse } from '../cors.js';

export async function handleSynoptic(request, env, url) {
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');

  if (!lat || !lng) return jsonResponse({ error: 'Missing lat or lng.' }, 400);

  const token = env.SYNOPTIC_TOKEN;
  if (!token) return jsonResponse({ error: 'SYNOPTIC_TOKEN not configured. Set it with: wrangler secret put SYNOPTIC_TOKEN' }, 503);

  // Step 1: Find nearest RAWS station reporting fuel moisture + met vars
  const nearestUrl = new URL('https://api.synopticdata.com/v2/stations/nearest');
  nearestUrl.searchParams.set('token',  token);
  nearestUrl.searchParams.set('lat',    lat);
  nearestUrl.searchParams.set('lon',    lng);   // Synoptic uses 'lon'
  nearestUrl.searchParams.set('radius', '120'); // 120 mile search radius
  nearestUrl.searchParams.set('limit',  '5');
  nearestUrl.searchParams.set('vars',   'fuel_moisture,air_temp,relative_humidity,wind_speed,wind_direction');
  nearestUrl.searchParams.set('units',  'english');

  let nearestData;
  try {
    const res = await fetch(nearestUrl.toString());
    if (!res.ok) throw new Error(`Synoptic nearest: HTTP ${res.status}`);
    nearestData = await res.json();
  } catch (err) {
    return jsonResponse({ error: `Synoptic API error: ${err.message}` }, 502);
  }

  if (!nearestData.STATION?.length) {
    return jsonResponse({ error: 'No RAWS stations found within 120 miles reporting fuel moisture data.' }, 404);
  }

  const station = nearestData.STATION[0];

  // Step 2: Fetch 72-hour timeseries for that station
  const tsUrl = new URL('https://api.synopticdata.com/v2/stations/timeseries');
  tsUrl.searchParams.set('token',       token);
  tsUrl.searchParams.set('stid',        station.STID);
  tsUrl.searchParams.set('recent',      '4320'); // 72 hours in minutes
  tsUrl.searchParams.set('vars',        'fuel_moisture,air_temp,relative_humidity,wind_speed,wind_direction');
  tsUrl.searchParams.set('units',       'english');
  tsUrl.searchParams.set('obtimezone',  'local');

  let tsData;
  try {
    const res = await fetch(tsUrl.toString());
    if (!res.ok) throw new Error(`Synoptic timeseries: HTTP ${res.status}`);
    tsData = await res.json();
  } catch (err) {
    return jsonResponse({ error: `Synoptic timeseries error: ${err.message}` }, 502);
  }

  const obs = tsData.STATION?.[0]?.OBSERVATIONS ?? {};

  return jsonResponse({
    station: {
      stid:           station.STID,
      name:           station.NAME,
      lat:            parseFloat(station.LATITUDE),
      lng:            parseFloat(station.LONGITUDE),
      elevation_ft:   station.ELEVATION ?? null,
      distance_miles: parseFloat(station.DISTANCE),
    },
    observations: obs,
  });
}
