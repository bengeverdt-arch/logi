// ============================================================
// hospitals.js — nearest hospitals within 25 mi, with ER status
// Locations: USGS National Structures Dataset, Hospitals/Medical
// Centers layer (Esri_US_Federal_Data, national, loads through 2026-05).
// ER status: CMS Hospital General Information (data.cms.gov, official,
// `emergency_services` Yes/No). CMS has no coordinates, so the two are
// joined on street number + ZIP, or street number + street + city —
// verified 2026-09-23 in KY/OR/MT/FL. Unmatched hospitals are returned with
// er: null ("not confirmed"), never guessed.
// ============================================================

import { jsonResponse } from '../cors.js';
import { queryArcGIS } from './arcgis.js';
import { statesInRange } from './cms.js';

const USGS_URL =
  'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Structures_Medical_Emergency_Response_v1/FeatureServer/0/query';
const CMS_HOSP_URL = 'https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0';

const RADIUS_MILES = 25;
const MAX_RETURNED = 5;
const CACHE_TTL_S = 86400;
const PAGE = 500;
const FETCH_TIMEOUT_MS = 15000;

function haversine(lat1, lng1, lat2, lng2) {
  const R    = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
             * Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

const DIRECTIONS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'NORTH', 'SOUTH', 'EAST', 'WEST',
  'NORTHEAST', 'NORTHWEST', 'SOUTHEAST', 'SOUTHWEST']);

// Two ways to match the same building across CMS and USGS:
//   "1350|40511"             street number + ZIP5
//   "1600|ARCHER|GAINESVILLE" street number + street name + city
// The second catches ZIP disagreements (UF Shands: CMS 32610, USGS 32603).
function joinKeys(address, zip, city) {
  const words = String(address || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const num = /^\d+$/.test(words[0] || '') ? words[0] : null;
  if (!num) return [];
  const keys = [];
  const z5 = String(zip || '').slice(0, 5);
  if (z5.length === 5) keys.push(`${num}|${z5}`);
  const street = words.slice(1).find(w => !DIRECTIONS.has(w));
  const c = String(city || '').toUpperCase().trim();
  if (street && c) keys.push(`${num}|${street}|${c}`);
  return keys;
}

async function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`CMS hospitals HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'CMS hospitals timed out' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

// { "1350|40511": { er: false, type: "Psychiatric", phone } } for one state,
// cached at the edge for a day.
async function cmsStateIndex(state) {
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`https://logi-cache.invalid/cms-hospitals-v2/${state}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit.json();
  }

  const index = {};
  for (let offset = 0; ; offset += PAGE) {
    const qs = new URLSearchParams({
      'conditions[0][property]': 'state',
      'conditions[0][value]': state,
      limit: String(PAGE),
      offset: String(offset),
      schema: 'false',
    });
    for (const p of ['address', 'zip_code', 'citytown', 'emergency_services', 'hospital_type', 'telephone_number']) {
      qs.append('properties[]', p);
    }
    const data = await fetchJSON(`${CMS_HOSP_URL}?${qs}`);
    for (const r of data.results || []) {
      const rec = {
        er: r.emergency_services === 'Yes' ? true : r.emergency_services === 'No' ? false : null,
        type: r.hospital_type || null,
        phone: r.telephone_number || null,
      };
      for (const k of joinKeys(r.address, r.zip_code, r.citytown)) {
        if (!index[k]) index[k] = rec;
      }
    }
    if (!data.results || data.results.length < PAGE) break;
  }

  if (cache) {
    await cache.put(cacheKey, new Response(JSON.stringify(index), {
      headers: { 'Cache-Control': `max-age=${CACHE_TTL_S}` },
    }));
  }
  return index;
}

export async function handleHospitals(request, env, url) {
  const lat = parseFloat(url.searchParams.get('lat'));
  const lng = parseFloat(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: 'Missing lat or lng.' }, 400);
  }

  // Locations are required; ER status is an enrichment — if CMS fails,
  // hospitals still come back, all marked "not confirmed", with a warning.
  const [usgs, cms] = await Promise.allSettled([
    queryArcGIS(USGS_URL, {
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      distance: String(RADIUS_MILES),
      units: 'esriSRUnit_StatuteMile',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'NAME,ADDRESS,CITY,STATE,ZIPCODE',
      returnGeometry: 'true',
      outSR: '4326',
    }, 'USGS hospitals'),
    statesInRange(lat, lng, RADIUS_MILES * 1609.34)
      .then(states => Promise.all(states.map(cmsStateIndex)))
      .then(indexes => Object.assign({}, ...indexes)),
  ]);

  if (usgs.status === 'rejected') {
    return jsonResponse({ error: usgs.reason.message }, 502);
  }
  const warnings = [];
  const cmsIndex = cms.status === 'fulfilled' ? cms.value : {};
  if (cms.status === 'rejected') {
    warnings.push(`ER status unavailable (CMS: ${cms.reason.message}) — confirm by phone`);
  }

  const hospitals = (usgs.value.features || [])
    .filter(f => f.geometry)
    .map(f => {
      const a = f.attributes;
      const c = joinKeys(a.ADDRESS, a.ZIPCODE, a.CITY).map(k => cmsIndex[k]).find(Boolean) || null;
      return {
        name: a.NAME,
        address: [a.ADDRESS, a.CITY, a.STATE].filter(Boolean).join(', '),
        phone: c?.phone ?? null,
        er: c ? c.er : null,          // true / false per CMS; null = not confirmed
        cms_type: c?.type ?? null,
        lat: f.geometry.y,
        lng: f.geometry.x,
        distance_miles: haversine(lat, lng, f.geometry.y, f.geometry.x),
      };
    })
    .sort((a, b) => a.distance_miles - b.distance_miles);

  return jsonResponse({
    hospitals: hospitals.slice(0, MAX_RETURNED),
    nearest_er: hospitals.find(h => h.er === true) || null,
    radius_miles: RADIUS_MILES,
    source: 'USGS National Structures Dataset (locations) + CMS Hospital General Information (ER status)',
    warnings,
  });
}
