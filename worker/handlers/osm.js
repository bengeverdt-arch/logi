// ============================================================
// osm.js — OpenStreetMap / Overpass API proxy
// Sensitive receptors within a radius of the burn unit centroid.
// No API key required.
// ============================================================

import { jsonResponse } from '../cors.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

export async function handleOSM(request, env, url) {
  const lat    = url.searchParams.get('lat');
  const lng    = url.searchParams.get('lng');
  const radius = parseInt(url.searchParams.get('radius') || '1609', 10); // default 1 mile in meters

  if (!lat || !lng) return jsonResponse({ error: 'Missing lat or lng.' }, 400);

  if (url.pathname === '/api/osm/receptors') {
    return getReceptors(lat, lng, radius);
  }

  return jsonResponse({ error: 'Not found.' }, 404);
}

async function getReceptors(lat, lng, radius) {
  const query = buildQuery(lat, lng, radius);

  let data;
  try {
    const res = await fetch(OVERPASS, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    return jsonResponse({ error: `Overpass API error: ${err.message}` }, 502);
  }

  const receptors = parseElements(data.elements || [], lat, lng);

  return jsonResponse({
    receptors,
    query_radius_m: radius,
    source: 'OpenStreetMap via Overpass API',
  });
}

function buildQuery(lat, lng, radius) {
  const around = `(around:${radius},${lat},${lng})`;
  return `[out:json][timeout:25];
(
  node["amenity"~"^(school|college|university)$"]${around};
  way["amenity"~"^(school|college|university)$"]${around};
  node["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]${around};
  way["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]${around};
  node["amenity"~"^(nursing_home|social_facility)$"]${around};
  way["amenity"~"^(nursing_home|social_facility)$"]${around};
  node["landuse"="residential"]${around};
  way["landuse"="residential"]${around};
  way["highway"~"^(motorway|trunk|primary|secondary)$"]${around};
);
out center tags;`;
}

function classify(tags) {
  const a = tags.amenity;
  const l = tags.landuse;
  const h = tags.highway;
  if (['school', 'college', 'university'].includes(a))       return 'school';
  if (['hospital', 'clinic', 'doctors', 'pharmacy'].includes(a)) return 'medical';
  if (['nursing_home', 'social_facility'].includes(a))       return 'care_facility';
  if (l === 'residential')                                    return 'residential';
  if (['motorway', 'trunk', 'primary', 'secondary'].includes(h)) return 'road';
  return 'other';
}

function parseElements(elements, centerLat, centerLng) {
  const seen = new Set();

  return elements
    .map(el => {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!lat || !lng) return null;

      const tags = el.tags || {};
      const type = classify(tags);
      const name = tags.name || tags['addr:street'] || null;

      // Deduplicate roads by name to avoid listing every road segment
      if (type === 'road' && name) {
        if (seen.has(`road:${name}`)) return null;
        seen.add(`road:${name}`);
      }

      const dist = haversine(parseFloat(centerLat), parseFloat(centerLng), lat, lng);

      return { id: el.id, type, name, lat, lng, distance_miles: dist };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance_miles - b.distance_miles);
}

function haversine(lat1, lng1, lat2, lng2) {
  const R    = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
             * Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}
