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

  // /v2/stations/latest — radius=lat,lng,miles (single comma-separated param)
  const apiUrl = new URL('https://api.synopticdata.com/v2/stations/latest');
  apiUrl.searchParams.set('token',       token);
  apiUrl.searchParams.set('radius',      `${lat},${lng},120`);
  apiUrl.searchParams.set('vars',        'fuel_moisture,air_temp,relative_humidity,wind_speed,wind_direction');
  apiUrl.searchParams.set('units',       'english');
  apiUrl.searchParams.set('limit',       '10');
  apiUrl.searchParams.set('obtimezone',  'local');

  let data;
  try {
    const res = await fetch(apiUrl.toString());
    if (!res.ok) throw new Error(`Synoptic HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    return jsonResponse({ error: `Synoptic API error: ${err.message}` }, 502);
  }

  if (!data.STATION?.length) {
    return jsonResponse({ error: 'No RAWS stations found within 120 miles.' }, 404);
  }

  // Prefer first station that has a fuel moisture reading
  const station = data.STATION.find(s => s.OBSERVATIONS?.fuel_moisture_value_1?.value != null)
                  ?? data.STATION[0];

  const obs = station.OBSERVATIONS ?? {};
  const val = (key) => obs[key]?.value ?? null;
  const dt  = obs.date_time
              ?? obs.fuel_moisture_value_1?.date_time
              ?? obs.air_temp_value_1?.date_time
              ?? null;

  return jsonResponse({
    station: {
      stid:           station.STID,
      name:           station.NAME,
      lat:            parseFloat(station.LATITUDE),
      lng:            parseFloat(station.LONGITUDE),
      elevation_ft:   station.ELEVATION ?? null,
      distance_miles: parseFloat(station.DISTANCE),
    },
    latest: {
      date_time:         dt,
      fuel_moisture:     val('fuel_moisture_value_1'),
      air_temp:          val('air_temp_value_1'),
      relative_humidity: val('relative_humidity_value_1'),
      wind_speed:        val('wind_speed_value_1'),
      wind_direction:    val('wind_direction_value_1'),
    },
  });
}
