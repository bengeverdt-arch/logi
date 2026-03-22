// ============================================================
// nws.js — NWS API proxy (spot forecast + active alerts)
// No API key required.
// ============================================================

import { jsonResponse } from '../cors.js';

const UA = 'LOGI-BurnPlanningTool/0.4 (github.com/bengeverdt-arch/logi)';

export async function handleNWS(request, env, url) {
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');

  if (!lat || !lng) return jsonResponse({ error: 'Missing lat or lng.' }, 400);

  try {
    if (url.pathname === '/api/nws/forecast') return await getForecast(lat, lng);
    if (url.pathname === '/api/nws/alerts')   return await getAlerts(lat, lng);
    return jsonResponse({ error: 'Not found.' }, 404);
  } catch (err) {
    return jsonResponse({ error: err.message }, 502);
  }
}

async function nwsGet(endpoint) {
  const res = await fetch(endpoint, {
    headers: { 'User-Agent': UA, 'Accept': 'application/geo+json' },
  });
  if (!res.ok) throw new Error(`NWS API returned ${res.status} for ${endpoint}`);
  return res.json();
}

async function getForecast(lat, lng) {
  // Step 1: resolve grid point
  const points = await nwsGet(`https://api.weather.gov/points/${lat},${lng}`);
  const forecastUrl = points.properties?.forecast;
  if (!forecastUrl) throw new Error('Could not resolve NWS grid point for these coordinates.');

  // Step 2: get forecast
  const forecast = await nwsGet(forecastUrl);
  const periods  = forecast.properties?.periods ?? [];

  return jsonResponse({
    office: points.properties?.cwa ?? null,
    periods: periods.slice(0, 6).map(p => ({
      name:              p.name,
      is_daytime:        p.isDaytime,
      temperature:       p.temperature,
      temperature_unit:  p.temperatureUnit,
      wind_speed:        p.windSpeed,
      wind_direction:    p.windDirection,
      short_forecast:    p.shortForecast,
      detailed_forecast: p.detailedForecast,
    })),
  });
}

async function getAlerts(lat, lng) {
  const data = await nwsGet(`https://api.weather.gov/alerts/active?point=${lat},${lng}`);
  const features = data.features ?? [];

  return jsonResponse({
    alerts: features.map(f => ({
      event:       f.properties.event,
      headline:    f.properties.headline,
      severity:    f.properties.severity,
      urgency:     f.properties.urgency,
      description: f.properties.description,
      expires:     f.properties.expires,
    })),
  });
}
