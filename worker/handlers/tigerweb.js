// ============================================================
// tigerweb.js — Census TIGERweb Transportation MapServer
// Primary + secondary roads within radius, no key. Replaces OSM
// highway tags, which have gaps in rural KY coverage.
// Layer 2 = Primary Roads (MTFCC S1100, interstates/limited access)
// Layer 6 = Secondary Roads full-res (MTFCC S1200, US/state routes)
// Same class of road the old OSM query used (motorway→secondary) —
// layer 8 "Local Roads" is every residential street, too noisy for
// smoke-sensitive road targets.
// ============================================================

const TIGERWEB_BASE =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer';
const ROAD_LAYERS = [2, 6];

const FETCH_TIMEOUT_MS = 10000;

function envelope(lat, lng, radiusMeters) {
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));
  return `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;
}

async function queryLayer(layer, lat, lng, radiusMeters) {
  const params = new URLSearchParams({
    geometry: envelope(lat, lng, radiusMeters),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'NAME',
    returnGeometry: 'true',
    resultRecordCount: '100',
    f: 'json',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${TIGERWEB_BASE}/${layer}/query?${params}`, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`TIGERweb HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`TIGERweb API error: ${data.error.message || 'unknown'}`);
  return data.features || [];
}

// Cheap planar distance² — only used to pick the closest vertex, not reported.
function nearestVertex(paths, lat, lng) {
  const kx = Math.cos(lat * Math.PI / 180);
  let best = null;
  let bestD = Infinity;
  for (const path of paths || []) {
    for (const [x, y] of path) {
      const d = ((x - lng) * kx) ** 2 + (y - lat) ** 2;
      if (d < bestD) { bestD = d; best = { lat: y, lng: x }; }
    }
  }
  return best;
}

export async function getTIGERRoads(lat, lng, radiusMeters) {
  lat = parseFloat(lat);
  lng = parseFloat(lng);

  const results = await Promise.allSettled(
    ROAD_LAYERS.map(l => queryLayer(l, lat, lng, radiusMeters))
  );
  if (results.every(r => r.status === 'rejected')) throw results[0].reason;

  // A road is split into many segments — keep the closest vertex per name
  // so distance reflects where the road actually passes nearest the unit.
  const byName = new Map();
  const kx = Math.cos(lat * Math.PI / 180);
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const f of r.value) {
      const name = f.attributes?.NAME;
      if (!name) continue;
      const pt = nearestVertex(f.geometry?.paths, lat, lng);
      if (!pt) continue;
      const d = ((pt.lng - lng) * kx) ** 2 + (pt.lat - lat) ** 2;
      const prev = byName.get(name);
      if (!prev || d < prev.d) byName.set(name, { d, pt });
    }
  }

  return [...byName].map(([name, { pt }]) => ({ name, type: 'road', lat: pt.lat, lng: pt.lng }));
}
