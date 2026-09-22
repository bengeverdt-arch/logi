// ============================================================
// hydro3dhp.js — USGS 3D Hydrography Program (3DHP) FeatureServer
// Streams/rivers/canals + lakes/ponds within radius, no key.
// 3DHP replaced the NHD (retired 2023-10-01, unmaintained; its query
// endpoint hung for hours on 2026-09-22). Where elevation-derived
// hydrography isn't collected yet, USGS backfills 3DHP from NHD.
// Layer 50 = Flowline  (featuretype 1 River, 2 Canal, 5 Waterbody Connector)
// Layer 60 = Waterbody (featuretype 1 River, 2 Canal, 3 Lake — incl. farm ponds)
// No hydrants or tanks here — those still come from OSM.
// ============================================================

const HYDRO_BASE =
  'https://3dhp.nationalmap.gov/arcgis/rest/services/usgs_3dhp_all/FeatureServer';

const FETCH_TIMEOUT_MS = 12000;

const FT_RIVER     = 1;
const FT_CANAL     = 2;
const FT_LAKE      = 3;
const FT_WB_CONNECTOR = 5; // flowline through a waterbody — named river/creek segments

function envelope(lat, lng, radiusMeters) {
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));
  return `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;
}

async function queryLayer(layer, where, lat, lng, radiusMeters) {
  const params = new URLSearchParams({
    geometry: envelope(lat, lng, radiusMeters),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    where,
    outFields: 'gnisidlabel,featuretype',
    returnGeometry: 'true',
    maxAllowableOffset: '0.0002', // ~20m generalization — shrinks payload, plenty for ranking
    resultRecordCount: '1000',
    f: 'json',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${HYDRO_BASE}/${layer}/query?${params}`, { signal: controller.signal });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? '3DHP timed out' : `3DHP fetch failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`3DHP HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`3DHP API error: ${data.error.message || 'unknown'}`);
  return data.features || [];
}

// Closest vertex of a polyline (paths) or polygon (rings) to the centroid.
function nearestVertex(geom, lat, lng) {
  const parts = geom?.paths || geom?.rings;
  const kx = Math.cos(lat * Math.PI / 180);
  let best = null;
  let bestD = Infinity;
  for (const part of parts || []) {
    for (const [x, y] of part) {
      const d = ((x - lng) * kx) ** 2 + (y - lat) ** 2;
      if (d < bestD) { bestD = d; best = { lat: y, lng: x }; }
    }
  }
  return best;
}

function classifyFlowline(ftype, name) {
  if (ftype === FT_CANAL) return /ditch/i.test(name || '') ? 'ditch' : 'canal';
  return /river/i.test(name || '') ? 'river' : 'stream';
}

function classifyWaterbody(ftype, name) {
  if (ftype === FT_CANAL) return 'canal';
  if (ftype === FT_RIVER) return 'river';
  // 3DHP has no reservoir type — lakes and ponds are both "Lake".
  if (/reservoir/i.test(name || '')) return 'reservoir';
  return /lake/i.test(name || '') ? 'lake' : 'pond';
}

export async function get3DHPWater(lat, lng, radiusMeters) {
  lat = parseFloat(lat);
  lng = parseFloat(lng);

  // Unnamed flowlines are skipped — within 3 mi there can be hundreds of
  // unnamed reaches, and they aren't usable as a named draft point.
  // Drainageways (ephemeral swales) and pure connectors are excluded.
  // Unnamed waterbodies are kept: those are the farm ponds.
  const [flow, body] = await Promise.allSettled([
    queryLayer(50, `featuretype IN (${FT_RIVER},${FT_CANAL},${FT_WB_CONNECTOR}) AND gnisidlabel IS NOT NULL`, lat, lng, radiusMeters),
    queryLayer(60, `featuretype IN (${FT_RIVER},${FT_CANAL},${FT_LAKE})`, lat, lng, radiusMeters),
  ]);
  if (flow.status === 'rejected' && body.status === 'rejected') throw flow.reason;

  const out = [];
  for (const f of (flow.status === 'fulfilled' ? flow.value : [])) {
    const pt = nearestVertex(f.geometry, lat, lng);
    if (!pt) continue;
    const name = f.attributes?.gnisidlabel || null;
    out.push({ name, type: classifyFlowline(f.attributes?.featuretype, name), ...pt });
  }
  for (const f of (body.status === 'fulfilled' ? body.value : [])) {
    const pt = nearestVertex(f.geometry, lat, lng);
    if (!pt) continue;
    const name = f.attributes?.gnisidlabel || null;
    out.push({ name, type: classifyWaterbody(f.attributes?.featuretype, name), ...pt });
  }

  const partial = [flow, body].some(r => r.status === 'rejected');
  return { features: out, partial };
}
