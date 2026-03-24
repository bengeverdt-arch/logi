// ============================================================
// osm.js — OpenStreetMap / Overpass API proxy
// Sensitive receptors within a radius of the burn unit centroid.
// No API key required.
// ============================================================

import { jsonResponse } from '../cors.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

export async function handleOSM(request, env, url) {
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');

  if (!lat || !lng) return jsonResponse({ error: 'Missing lat or lng.' }, 400);

  if (url.pathname === '/api/osm/receptors') {
    const radius = parseInt(url.searchParams.get('radius') || '1609', 10);
    return getReceptors(lat, lng, radius);
  }

  if (url.pathname === '/api/osm/watersources') {
    const radius = parseInt(url.searchParams.get('radius') || '4827', 10); // default 3 miles
    return getWaterSources(lat, lng, radius);
  }

  if (url.pathname === '/api/osm/infrastructure') {
    const hazardRadius = parseInt(url.searchParams.get('hazard_radius') || '1609', 10);  // 1 mile for power lines
    const heliRadius   = parseInt(url.searchParams.get('heli_radius')   || '16093', 10); // 10 miles for helipads
    return getInfrastructure(lat, lng, hazardRadius, heliRadius);
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

// ============================================================
// Water Sources
// ============================================================

async function getWaterSources(lat, lng, radius) {
  const query = buildWaterQuery(lat, lng, radius);

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

  const sources = parseWaterElements(data.elements || [], lat, lng);

  return jsonResponse({
    sources,
    query_radius_m: radius,
    source: 'OpenStreetMap via Overpass API',
  });
}

function buildWaterQuery(lat, lng, radius) {
  const around = `(around:${radius},${lat},${lng})`;
  return `[out:json][timeout:30];
(
  node["natural"="water"]${around};
  way["natural"="water"]${around};
  node["waterway"~"^(river|stream|canal|ditch)$"]${around};
  way["waterway"~"^(river|stream|canal|ditch)$"]${around};
  node["man_made"~"^(water_tower|storage_tank|reservoir_covered)$"]${around};
  way["man_made"~"^(water_tower|storage_tank|reservoir_covered)$"]${around};
  node["landuse"="reservoir"]${around};
  way["landuse"="reservoir"]${around};
  node["emergency"="fire_hydrant"]${around};
);
out center tags;`;
}

function classifyWater(tags) {
  const waterType = tags.water;
  const waterway  = tags.waterway;
  const manMade   = tags.man_made;
  const landuse   = tags.landuse;
  const emergency = tags.emergency;

  if (emergency === 'fire_hydrant')                         return 'hydrant';
  if (manMade === 'water_tower')                            return 'tank';
  if (manMade === 'storage_tank' || manMade === 'reservoir_covered') return 'tank';
  if (landuse === 'reservoir')                              return 'reservoir';
  if (waterway === 'river')                                 return 'river';
  if (waterway === 'stream')                                return 'stream';
  if (waterway === 'canal')                                 return 'canal';
  if (waterway === 'ditch')                                 return 'ditch';
  if (waterType === 'reservoir')                            return 'reservoir';
  if (waterType === 'pond')                                 return 'pond';
  if (waterType === 'lake')                                 return 'lake';
  return 'water';
}

// ============================================================
// Infrastructure — power lines (hazards) + helipads
// ============================================================

async function getInfrastructure(centerLat, centerLng, hazardRadius, heliRadius) {
  const query = buildInfraQuery(centerLat, centerLng, hazardRadius, heliRadius);

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

  const powerlines = [];
  const helipads   = [];
  const seenPower  = new Set();

  for (const el of (data.elements || [])) {
    const lat  = el.lat ?? el.center?.lat;
    const lng  = el.lon ?? el.center?.lon;
    if (!lat || !lng) continue;

    const tags = el.tags || {};
    const dist = haversine(parseFloat(centerLat), parseFloat(centerLng), lat, lng);

    if (tags.power === 'line') {
      const name    = tags.name || tags.ref || null;
      const voltage = tags.voltage || null;
      const key     = name ? `line:${name}` : `line:${el.id}`;
      if (!seenPower.has(key)) {
        seenPower.add(key);
        powerlines.push({ id: el.id, name, voltage, lat, lng, distance_miles: dist });
      }
    }

    if (tags.aeroway === 'helipad') {
      const name = tags.name || null;
      helipads.push({ id: el.id, name, lat, lng, distance_miles: dist });
    }
  }

  powerlines.sort((a, b) => a.distance_miles - b.distance_miles);
  helipads.sort((a, b) => a.distance_miles - b.distance_miles);

  return jsonResponse({
    powerlines,
    helipads,
    hazard_radius_m: hazardRadius,
    heli_radius_m:   heliRadius,
  });
}

function buildInfraQuery(centerLat, centerLng, hazardRadius, heliRadius) {
  const aroundHazard = `(around:${hazardRadius},${centerLat},${centerLng})`;
  const aroundHeli   = `(around:${heliRadius},${centerLat},${centerLng})`;
  return `[out:json][timeout:30];
(
  way["power"="line"]${aroundHazard};
  node["aeroway"="helipad"]${aroundHeli};
  way["aeroway"="helipad"]${aroundHeli};
);
out center tags;`;
}

function parseWaterElements(elements, centerLat, centerLng) {
  const seen = new Set();

  return elements
    .map(el => {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!lat || !lng) return null;

      const tags = el.tags || {};
      const type = classifyWater(tags);
      const name = tags.name || null;

      // Deduplicate waterways and hydrants by name or id to avoid listing every segment/node
      const dedupeKey = (type === 'river' || type === 'stream' || type === 'canal' || type === 'ditch')
        ? (name ? `${type}:${name}` : null)
        : (type === 'hydrant' ? `hydrant:${el.id}` : null);

      if (dedupeKey) {
        if (seen.has(dedupeKey)) return null;
        seen.add(dedupeKey);
      }

      const dist = haversine(parseFloat(centerLat), parseFloat(centerLng), lat, lng);

      return { id: el.id, type, name, lat, lng, distance_miles: dist };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance_miles - b.distance_miles);
}
