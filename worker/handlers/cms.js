// ============================================================
// cms.js — CMS Nursing Home Provider Information (data.cms.gov)
// Official list of Medicare/Medicaid-certified nursing homes, with
// geocoded lat/lng. Does NOT include assisted living — OSM covers some
// of those, which is why both run together.
// Verified 2026-09-22: all 5 Madison Co KY facilities, correct locations.
// Its lat/lng columns are stored as text, so range filters don't work —
// fetch whole state(s) (KY = 267 rows, ~3s) and filter here. State lists
// are cached at the edge for a day.
// ============================================================

import { envelope, queryArcGIS } from './arcgis.js';

const CMS_URL = 'https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0';
const STATES_URL =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query';

const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_S = 86400;
const PAGE = 1500;

// A burn near a state line can have receptors on both sides.
async function statesInRange(lat, lng, radiusMeters) {
  const data = await queryArcGIS(STATES_URL, {
    geometry: envelope(lat, lng, radiusMeters),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'STUSAB',
    returnGeometry: 'false',
  }, 'TIGERweb states');
  return (data.features || []).map(f => f.attributes.STUSAB).filter(Boolean);
}

async function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`CMS HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'CMS timed out' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

async function stateFacilities(state) {
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`https://logi-cache.invalid/cms/${state}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit.json();
  }

  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const qs = new URLSearchParams({
      'conditions[0][property]': 'state',
      'conditions[0][value]': state,
      'properties[]': 'provider_name',
      limit: String(PAGE),
      offset: String(offset),
      schema: 'false',
    });
    qs.append('properties[]', 'latitude');
    qs.append('properties[]', 'longitude');
    const data = await fetchJSON(`${CMS_URL}?${qs}`);
    rows.push(...(data.results || []));
    if (!data.results || data.results.length < PAGE) break;
  }

  const facilities = rows
    .map(r => ({ name: r.provider_name || null, lat: parseFloat(r.latitude), lng: parseFloat(r.longitude) }))
    .filter(f => Number.isFinite(f.lat) && Number.isFinite(f.lng));

  if (cache) {
    await cache.put(cacheKey, new Response(JSON.stringify(facilities), {
      headers: { 'Cache-Control': `max-age=${CACHE_TTL_S}` },
    }));
  }
  return facilities;
}

export async function getCMSNursingHomes(lat, lng, radiusMeters) {
  lat = parseFloat(lat);
  lng = parseFloat(lng);

  const states = await statesInRange(lat, lng, radiusMeters);
  const lists = await Promise.all(states.map(stateFacilities));

  // Bounding-box prefilter; the caller trims to the true radius.
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));
  return lists.flat()
    .filter(f => Math.abs(f.lat - lat) <= dLat && Math.abs(f.lng - lng) <= dLng)
    .map(f => ({ ...f, type: 'care_facility' }));
}
