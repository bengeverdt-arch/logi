// ============================================================
// geocode.js — Nominatim geocoder proxy
// No API key required. Worker sets required User-Agent header.
// ============================================================

import { jsonResponse } from '../cors.js';

export async function handleGeocode(request, env, url) {
  const q = url.searchParams.get('q');
  if (!q) return jsonResponse({ error: 'Missing q.' }, 400);

  const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`;

  let data;
  try {
    const res = await fetch(nomUrl, {
      headers: {
        'User-Agent':       'LOGI-BurnPlanning/1.0 (prescribed fire planning tool)',
        'Accept-Language':  'en',
      },
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    return jsonResponse({ error: `Geocode error: ${err.message}` }, 502);
  }

  if (!data.length) return jsonResponse({ error: 'Location not found.' }, 404);

  const place = data[0];
  return jsonResponse({
    lat:     parseFloat(place.lat),
    lng:     parseFloat(place.lon),
    display: place.display_name,
  });
}
