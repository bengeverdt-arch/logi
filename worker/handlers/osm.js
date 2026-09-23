// ============================================================
// osm.js — OpenStreetMap / Overpass API proxy
// Sensitive receptors within a radius of the burn unit centroid.
// No API key required.
// ============================================================

import { jsonResponse } from '../cors.js';
import { getKYInstitutions } from './kyinstitutions.js';
import { getNCESSchools } from './nces.js';
import { getTIGERRoads }     from './tigerweb.js';
import { get3DHPWater }      from './hydro3dhp.js';
import { getFEMAResidential, FEMA_NEAREST_N } from './femastructures.js';
import { getCMSNursingHomes } from './cms.js';
import { getFAAHeliports }    from './faa.js';
import { getTransmissionLines } from './transmission.js';
import { nearestVertex }      from './arcgis.js';

const OVERPASS      = 'https://overpass-api.de/api/interpreter';
const OVERPASS_MIRROR = 'https://overpass.kumi.systems/api/interpreter'; // fallback

// Overpass is a SUPPLEMENTAL source everywhere: federal/official sources
// carry the load, OSM adds what only it has (distribution lines, hydrants,
// assisted living). It has been unreliable (down most of 2026-09-22/23),
// so it gets a hard deadline — primary and mirror are raced in parallel
// and the whole call, including reading the body, is cut off at
// OVERPASS_DEADLINE_MS. A slow Overpass must never hold up the plan.
const OVERPASS_DEADLINE_MS = 8000;

async function fetchOverpass(query) {
  const controller = new AbortController();
  const post = async (endpoint) => {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   'LOGI-BurnPlanner/1.0 (https://logi-3gv.pages.dev; contact: bengeverdt@gmail.com)',
      },
      body:    `data=${encodeURIComponent(query)}`,
      signal:  controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Overpass timed out after ${OVERPASS_DEADLINE_MS / 1000}s`));
    }, OVERPASS_DEADLINE_MS);
  });

  try {
    return await Promise.race([
      Promise.any([post(OVERPASS), post(OVERPASS_MIRROR)])
        .catch(() => { throw new Error('Overpass unreachable on both primary and mirror'); }),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort(); // cancel whichever request lost the race
  }
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
//   KY Institutions     — schools + hospitals (KY only)
//   NCES EDGE           — public + private K-12 schools (national)
//   Census TIGERweb     — primary + secondary roads
//   FEMA USA Structures — homes (nearest N listed + total count)
// A source that fails is named in `warnings` rather than silently dropped —
// "no schools found" when the school source was down would be a wrong field.
async function getReceptors(lat, lng, radius) {
  const [osm, cms, ky, nces, roads, homes] = await Promise.allSettled([
    fetchOverpass(buildQuery(lat, lng, radius)),
    getCMSNursingHomes(lat, lng, radius),
    getKYInstitutions(lat, lng, radius),
    getNCESSchools(lat, lng, radius),
    getTIGERRoads(lat, lng, radius),
    getFEMAResidential(lat, lng, radius),
  ]);

  const all = [osm, cms, ky, nces, roads, homes];
  if (all.every(r => r.status === 'rejected')) {
    return jsonResponse({
      error: `All receptor sources failed (${all.map(r => r.reason.message).join('; ')})`,
    }, 502);
  }

  const warnings = [];
  const receptors = [];
  // Official lists first so their names win when the same facility is
  // also in OSM. OSM + NCES cover every state; KY Institutions adds KY coverage.
  const facilities = [];
  if (cms.status === 'fulfilled') {
    facilities.push(...withDistance(cms.value, lat, lng).map(f => ({ ...f, src: 'cms' })));
  } else {
    warnings.push(`Certified nursing home list unavailable (CMS: ${cms.reason.message})`);
  }
  if (ky.status === 'fulfilled') {
    facilities.push(...withDistance(ky.value, lat, lng).map(f => ({ ...f, src: 'ky' })));
  } else {
    warnings.push(`KY school / hospital list unavailable (KY Institutions: ${ky.reason.message})`);
  }
  if (nces.status === 'fulfilled') {
    facilities.push(...withDistance(nces.value.schools, lat, lng).map(f => ({ ...f, src: 'nces' })));
    nces.value.failed.forEach(msg => warnings.push(`Partial school list (${msg})`));
  } else {
    warnings.push(`National school list unavailable (NCES: ${nces.reason.message})`);
  }
  if (osm.status === 'fulfilled') {
    facilities.push(...parseElements(osm.value.elements || [], lat, lng).map(f => ({ ...f, src: 'osm' })));
  } else {
    warnings.push(`OpenStreetMap supplement unavailable (${osm.reason.message}) — assisted living, clinics, and hospitals outside KY may be missing`);
  }
  receptors.push(...dedupeAcrossSources(facilities).map(({ src, ...f }) => f));
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
    source: 'OpenStreetMap (schools/medical/care), CMS (nursing homes), KY Institutions (KY schools/hospitals), NCES (K-12 schools), Census TIGERweb (roads), FEMA USA Structures (homes)',
    warnings,
  });
}

const DUP_INFRA_MILES = 0.1;

// Keep the first of any two items from different sources within `miles`.
function dedupeNear(items, miles) {
  const kept = [];
  for (const it of items) {
    if (kept.some(k => k.src !== it.src && haversine(it.lat, it.lng, k.lat, k.lng) < miles)) continue;
    kept.push(it);
  }
  return kept;
}

const DUP_FACILITY_MILES = 0.15; // official lists geocode to the address, OSM to the building

// Same facility reported by two sources — keep the first. Only collapses
// across sources: two schools on one campus from the same list both stay.
function dedupeAcrossSources(items) {
  const kept = [];
  for (const it of items) {
    if (kept.some(k => k.src !== it.src && k.type === it.type &&
        haversine(it.lat, it.lng, k.lat, k.lng) < DUP_FACILITY_MILES)) continue;
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
  // Homes moved to FEMA USA Structures, roads to TIGERweb. Schools,
  // medical and care stay here — OSM is the only one of these that
  // covers every state (KY Institutions is Kentucky-only).
  return `[out:json][timeout:20];
(
  node["amenity"~"^(school|college|university)$"]${around};
  way["amenity"~"^(school|college|university)$"]${around};
  node["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]${around};
  way["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]${around};
  node["amenity"~"^(nursing_home|social_facility)$"]${around};
  way["amenity"~"^(nursing_home|social_facility)$"]${around};
);
out center tags;`;
}

function classify(tags) {
  const a = tags.amenity;
  if (['school', 'college', 'university'].includes(a))           return 'school';
  if (['hospital', 'clinic', 'doctors', 'pharmacy'].includes(a)) return 'medical';
  if (['nursing_home', 'social_facility'].includes(a))           return 'care_facility';
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

      // Only real hospitals may auto-fill the plan's nearest-hospital field.
      return { id: el.id, type, name, lat, lng, distance_miles: dist, hospital: tags.amenity === 'hospital' };
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
    // Name only the sources that actually answered.
    source: [osm.status === 'fulfilled' ? 'OpenStreetMap (hydrants, tanks, mapped water)' : null,
             hydro.status === 'fulfilled' ? 'USGS 3D Hydrography Program (streams, ponds)' : null]
            .filter(Boolean).join(' + '),
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

// Federal sources always run (FAA heliports, HIFLD-derived transmission
// lines). OSM runs alongside with a hard deadline and adds what only it
// has — local distribution lines and unregistered helipads.
async function getInfrastructure(centerLat, centerLng, hazardRadius, heliRadius) {
  const warnings = [];
  const cLat = parseFloat(centerLat);
  const cLng = parseFloat(centerLng);

  const [osm, lines, heli] = await Promise.allSettled([
    fetchOverpass(buildInfraQuery(centerLat, centerLng, hazardRadius, heliRadius)),
    getTransmissionLines(centerLat, centerLng, hazardRadius),
    getFAAHeliports(centerLat, centerLng, heliRadius),
  ]);

  const osmLines = [];
  const osmHeli  = [];
  if (osm.status === 'fulfilled') {
    const seenPower = new Set();
    for (const el of (osm.value.elements || [])) {
      // Ways come back with full geometry — measure to the nearest vertex.
      // A way's center can be miles off for a long line that passes close.
      const pt = el.geometry
        ? nearestVertex({ paths: [el.geometry.map(g => [g.lon, g.lat])] }, cLat, cLng)
        : { lat: el.lat, lng: el.lon };
      const lat = pt?.lat;
      const lng = pt?.lng;
      if (!lat || !lng) continue;

      const tags = el.tags || {};
      const dist = haversine(cLat, cLng, lat, lng);

      if (tags.power === 'line') {
        const name    = tags.name || tags.ref || null;
        const voltage = tags.voltage || null;
        const key     = name ? `line:${name}` : `line:${el.id}`;
        if (!seenPower.has(key)) {
          seenPower.add(key);
          osmLines.push({ id: el.id, name, voltage, lat, lng, distance_miles: dist, src: 'osm' });
        }
      }
      if (tags.aeroway === 'helipad') {
        osmHeli.push({ id: el.id, name: tags.name || null, lat, lng, distance_miles: dist, src: 'osm' });
      }
    }
  } else {
    warnings.push(`OpenStreetMap unavailable (${osm.reason.message}) — federal sources only`);
  }

  let fedLines = [];
  if (lines.status === 'fulfilled') {
    fedLines = withDistance(lines.value, centerLat, centerLng)
      .filter(p => p.distance_miles <= hazardRadius / 1609.34)
      .map(p => ({ ...p, src: 'fed' }));
  } else {
    warnings.push(`Transmission line scan unavailable (${lines.reason.message})`);
  }
  if (osm.status !== 'fulfilled') {
    warnings.push('Power lines: high-voltage transmission only — local distribution lines are NOT shown. Walk the unit.');
  }

  let fedHeli = [];
  if (heli.status === 'fulfilled') {
    fedHeli = withDistance(heli.value, centerLat, centerLng)
      .filter(h => h.distance_miles <= heliRadius / 1609.34)
      .map(h => ({ ...h, src: 'faa' }));
  } else {
    warnings.push(`Helipad scan unavailable (FAA: ${heli.reason.message})`);
  }

  // Same line / pad from both sources — keep the federal record.
  const powerlines = dedupeNear([...fedLines, ...osmLines], DUP_INFRA_MILES).map(({ src, ...p }) => p);
  const helipads   = dedupeNear([...fedHeli, ...osmHeli], DUP_INFRA_MILES).map(({ src, ...h }) => h);
  const powerlineSource = [lines.status === 'fulfilled' ? 'federal transmission lines (2014–2018)' : null,
                           osm.status === 'fulfilled' ? 'OpenStreetMap (incl. distribution lines)' : null]
                          .filter(Boolean).join(' + ') || null;
  const helipadSource   = [heli.status === 'fulfilled' ? 'FAA' : null,
                           osm.status === 'fulfilled' ? 'OpenStreetMap' : null]
                          .filter(Boolean).join(' + ') || null;

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
