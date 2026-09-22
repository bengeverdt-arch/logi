// ============================================================
// osm.js — OpenStreetMap / Overpass API proxy
// Sensitive receptors within a radius of the burn unit centroid.
// No API key required.
// ============================================================

import { jsonResponse } from '../cors.js';
import { getKYInstitutions } from './kyinstitutions.js';
import { getTIGERRoads }     from './tigerweb.js';
import { get3DHPWater }      from './hydro3dhp.js';
import { getFEMAResidential, FEMA_NEAREST_N } from './femastructures.js';
import { getCMSNursingHomes } from './cms.js';
import { getFAAHeliports }    from './faa.js';
import { getTransmissionLines } from './transmission.js';
import { nearestVertex }      from './arcgis.js';

const OVERPASS      = 'https://overpass-api.de/api/interpreter';
const OVERPASS_MIRROR = 'https://overpass.kumi.systems/api/interpreter'; // fallback

// Overpass's own [timeout:N] only bounds its query execution — a slow or
// queued server can still leave the HTTP connection hanging far longer
// (observed: a receptors query hung ~2 minutes before Cloudflare's edge
// gave up with a 524). Cut each attempt off client-side well before that
// so a stuck request fails fast instead of leaving the page looking frozen.
const FETCH_TIMEOUT_MS = 15000;

async function fetchOverpass(query) {
  const post = (endpoint) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    return fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   'LOGI-BurnPlanner/1.0 (https://logi-3gv.pages.dev; contact: bengeverdt@gmail.com)',
      },
      body:    `data=${encodeURIComponent(query)}`,
      signal:  controller.signal,
    }).finally(() => clearTimeout(timer));
  };

  let res;
  try {
    res = await post(OVERPASS);
  } catch (err) {
    res = null; // timeout/abort on primary — fall through to mirror
  }

  if (!res || !res.ok) {
    try {
      res = await post(OVERPASS_MIRROR);
    } catch (err) {
      throw new Error(`Overpass unreachable on both primary and mirror`);
    }
  }
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

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

// Receptors are merged from independent sources, each covering what it's
// most reliable for:
//   Overpass (OSM)      — care facilities (incl. assisted living)
//   CMS                 — certified nursing homes (official list)
//   KY Institutions     — schools + hospitals
//   Census TIGERweb     — primary + secondary roads
//   FEMA USA Structures — homes (nearest N listed + total count)
// A source that fails is named in `warnings` rather than silently dropped —
// "no schools found" when the school source was down would be a wrong field.
async function getReceptors(lat, lng, radius) {
  const [osm, cms, ky, roads, homes] = await Promise.allSettled([
    fetchOverpass(buildQuery(lat, lng, radius)),
    getCMSNursingHomes(lat, lng, radius),
    getKYInstitutions(lat, lng, radius),
    getTIGERRoads(lat, lng, radius),
    getFEMAResidential(lat, lng, radius),
  ]);

  const all = [osm, cms, ky, roads, homes];
  if (all.every(r => r.status === 'rejected')) {
    return jsonResponse({
      error: `All receptor sources failed (${all.map(r => r.reason.message).join('; ')})`,
    }, 502);
  }

  const warnings = [];
  const receptors = [];
  const care = [];
  if (cms.status === 'fulfilled') {
    care.push(...withDistance(cms.value, lat, lng));
  } else {
    warnings.push(`Certified nursing home list unavailable (CMS: ${cms.reason.message})`);
  }
  if (osm.status === 'fulfilled') {
    care.push(...parseElements(osm.value.elements || [], lat, lng));
  } else {
    warnings.push(`Assisted living / care facility scan unavailable (OpenStreetMap: ${osm.reason.message})`);
  }
  receptors.push(...dedupeCare(care));
  if (ky.status === 'fulfilled') {
    receptors.push(...withDistance(ky.value, lat, lng));
  } else {
    warnings.push(`School / hospital scan unavailable (KY Institutions: ${ky.reason.message})`);
  }
  if (roads.status === 'fulfilled') {
    receptors.push(...withDistance(roads.value, lat, lng));
  } else {
    warnings.push(`Road scan unavailable (Census TIGERweb: ${roads.reason.message})`);
  }

  let residentialTotal = null;
  if (homes.status === 'fulfilled') {
    residentialTotal = homes.value.total;
    receptors.push(...withDistance(homes.value.homes, lat, lng)
      .sort((a, b) => a.distance_miles - b.distance_miles)
      .slice(0, FEMA_NEAREST_N));
  } else {
    warnings.push(`Home scan unavailable (FEMA USA Structures: ${homes.reason.message})`);
  }

  // Bbox-queried sources — trim the corners back to a true radius.
  const radiusMi = radius / 1609.34;
  const inRange = receptors
    .filter(r => r.distance_miles <= radiusMi)
    .sort((a, b) => a.distance_miles - b.distance_miles);

  return jsonResponse({
    receptors: inRange,
    residential_total: residentialTotal,
    query_radius_m: radius,
    source: 'OpenStreetMap + CMS (care facilities), KY Institutions (schools/hospitals), Census TIGERweb (roads), FEMA USA Structures (homes)',
    warnings,
  });
}

const CARE_DUP_MILES = 0.15; // CMS geocodes to the address, OSM to the building

// Same facility from CMS and OSM — keep the first (CMS goes in first,
// so its official name wins).
function dedupeCare(items) {
  const kept = [];
  for (const it of items) {
    if (kept.some(k => haversine(it.lat, it.lng, k.lat, k.lng) < CARE_DUP_MILES)) continue;
    kept.push(it);
  }
  return kept;
}

function withDistance(items, centerLat, centerLng) {
  return items.map(it => ({
    ...it,
    distance_miles: haversine(parseFloat(centerLat), parseFloat(centerLng), it.lat, it.lng),
  }));
}

function buildQuery(lat, lng, radius) {
  const around = `(around:${radius},${lat},${lng})`;
  // Homes moved to FEMA USA Structures; schools/hospitals to KY
  // Institutions; roads to TIGERweb. OSM still covers assisted living.
  return `[out:json][timeout:20];
(
  node["amenity"~"^(nursing_home|social_facility)$"]${around};
  way["amenity"~"^(nursing_home|social_facility)$"]${around};
);
out center tags;`;
}

function classify(tags) {
  if (['nursing_home', 'social_facility'].includes(tags.amenity)) return 'care_facility';
  return 'other';
}

function parseElements(elements, centerLat, centerLng) {
  return elements
    .map(el => {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!lat || !lng) return null;

      const tags = el.tags || {};
      const type = classify(tags);
      const name = tags.name || tags['addr:street'] || null;

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

// Water is merged from OSM (hydrants, tanks, plus whatever hydrography is
// mapped) and USGS 3DHP (authoritative streams + ponds, incl. unnamed farm
// ponds). 3DHP has no hydrants/tanks, so it supplements OSM, never replaces it.
async function getWaterSources(lat, lng, radius) {
  const [osm, hydro] = await Promise.allSettled([
    fetchOverpass(buildWaterQuery(lat, lng, radius)),
    get3DHPWater(lat, lng, radius),
  ]);

  if (osm.status === 'rejected' && hydro.status === 'rejected') {
    return jsonResponse({ error: `All water sources failed (OSM: ${osm.reason.message}; 3DHP: ${hydro.reason.message})` }, 502);
  }

  const warnings = [];
  const all = [];
  if (osm.status === 'fulfilled') {
    all.push(...parseWaterElements(osm.value.elements || [], lat, lng));
  } else {
    warnings.push(`Hydrant / tank scan unavailable (OpenStreetMap: ${osm.reason.message})`);
  }
  if (hydro.status === 'fulfilled') {
    all.push(...withDistance(hydro.value.features, lat, lng));
    if (hydro.value.partial) warnings.push('USGS 3DHP returned partial results (one layer failed)');
  } else {
    warnings.push(`USGS hydrography unavailable (3DHP: ${hydro.reason.message})`);
  }

  const radiusMi = radius / 1609.34;
  const sources = capWater(dedupeWater(
    all.filter(s => s.distance_miles <= radiusMi)
       .sort((a, b) => a.distance_miles - b.distance_miles)
  ));

  return jsonResponse({
    sources,
    query_radius_m: radius,
    source: 'OpenStreetMap via Overpass API, USGS 3D Hydrography Program',
    warnings,
  });
}

const STILL_WATER = new Set(['pond', 'lake', 'reservoir', 'water']);
const DUP_MILES   = 0.05; // ~80m — same unnamed pond reported by both sources

// Input must be sorted nearest-first, so the closer copy of a duplicate wins.
function dedupeWater(sorted) {
  const seenNames = new Set();
  const kept = [];
  for (const s of sorted) {
    if (s.type === 'hydrant' || s.type === 'tank') { kept.push(s); continue; }
    if (s.name) {
      // Sources disagree on pond vs lake vs reservoir for the same body —
      // key still water by name alone, moving water by name + type.
      const key = STILL_WATER.has(s.type) ? `still:${s.name.toLowerCase()}`
                                          : `${s.type}:${s.name.toLowerCase()}`;
      if (seenNames.has(key)) continue;
      seenNames.add(key);
    } else if (STILL_WATER.has(s.type) && kept.some(k =>
      !k.name && STILL_WATER.has(k.type) &&
      haversine(s.lat, s.lng, k.lat, k.lng) < DUP_MILES)) {
      continue;
    }
    kept.push(s);
  }
  return kept;
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

// Overpass is primary (it's the only source with local distribution lines).
// When it fails, fall back to FAA heliports + federal transmission lines,
// and say so — the transmission fallback is high-voltage only.
async function getInfrastructure(centerLat, centerLng, hazardRadius, heliRadius) {
  const warnings = [];
  let powerlines = [];
  let helipads = [];
  let powerlineSource = 'OpenStreetMap';
  let helipadSource = 'OpenStreetMap';

  let data = null;
  try {
    data = await fetchOverpass(buildInfraQuery(centerLat, centerLng, hazardRadius, heliRadius));
  } catch (err) {
    warnings.push(`OpenStreetMap unavailable (${err.message}) — using federal backups`);
  }

  if (data) {
    const seenPower = new Set();
    for (const el of (data.elements || [])) {
      // Ways come back with full geometry — measure to the nearest vertex.
      // A way's center can be miles off for a long line that passes close.
      const pt = el.geometry
        ? nearestVertex({ paths: [el.geometry.map(g => [g.lon, g.lat])] }, parseFloat(centerLat), parseFloat(centerLng))
        : { lat: el.lat, lng: el.lon };
      const lat = pt?.lat;
      const lng = pt?.lng;
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
  } else {
    const [lines, heli] = await Promise.allSettled([
      getTransmissionLines(centerLat, centerLng, hazardRadius),
      getFAAHeliports(centerLat, centerLng, heliRadius),
    ]);
    if (lines.status === 'fulfilled') {
      powerlines = withDistance(lines.value, centerLat, centerLng)
        .filter(p => p.distance_miles <= hazardRadius / 1609.34);
      powerlineSource = 'federal transmission line data, high-voltage only, mapped 2014–2018';
      warnings.push('Power lines: high-voltage transmission only — local distribution lines are NOT shown. Walk the unit.');
    } else {
      powerlineSource = null;
      warnings.push(`Power line scan unavailable (transmission backup: ${lines.reason.message})`);
    }
    if (heli.status === 'fulfilled') {
      helipads = withDistance(heli.value, centerLat, centerLng)
        .filter(h => h.distance_miles <= heliRadius / 1609.34);
      helipadSource = 'FAA';
    } else {
      helipadSource = null;
      warnings.push(`Helipad scan unavailable (FAA backup: ${heli.reason.message})`);
    }
  }

  powerlines.sort((a, b) => a.distance_miles - b.distance_miles);
  helipads.sort((a, b) => a.distance_miles - b.distance_miles);

  return jsonResponse({
    powerlines:       powerlines.slice(0, 5),
    powerlines_total: powerlines.length,
    helipads,
    hazard_radius_m:  hazardRadius,
    heli_radius_m:    heliRadius,
    powerline_source: powerlineSource,
    helipad_source:   helipadSource,
    warnings,
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
out tags geom;`;
}

// Max named sources to return per type — keeps list useful without being overwhelming
const WATER_TYPE_CAP = 5;

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

      // Deduplicate waterways by name; hydrants by id
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
    .filter(Boolean);
}

// Cap at WATER_TYPE_CAP per type (named and unnamed counted separately).
// Input must be sorted nearest-first.
function capWater(sorted) {
  const typeCnt = {};
  return sorted.filter(s => {
    const key = `${s.type}:${s.name ? 'named' : 'unnamed'}`;
    typeCnt[key] = (typeCnt[key] || 0) + 1;
    return typeCnt[key] <= WATER_TYPE_CAP;
  });
}
