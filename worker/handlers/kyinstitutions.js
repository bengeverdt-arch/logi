// ============================================================
// kyinstitutions.js — KY state "Institutions" FeatureServer
// Schools + hospitals, one source, no key. KENTUCKY ONLY — returns
// nothing elsewhere (verified MT/FL/OR 2026-09-22). Supplements OSM's
// rural school/hospital gaps in KY; OSM still covers every state.
// Note: FEATTYPE='Hospital/Polyclinic' is user-submitted and includes
// some mistagged non-hospital facilities (e.g. vet clinics) — surfaced
// as-is with a disclaimer, same posture as the OSM receptor data.
// ============================================================

const KY_INSTITUTIONS_URL =
  'https://watermaps.ky.gov/arcgis/rest/services/WebMapServices/Institutions/FeatureServer/0/query';

const FETCH_TIMEOUT_MS = 10000;

const VET_NAME = /animal|veterinar|\bvet\b|\bpets?\b|equine/i;

function envelope(lat, lng, radiusMeters) {
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));
  return `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;
}

export async function getKYInstitutions(lat, lng, radiusMeters) {
  const params = new URLSearchParams({
    geometry: envelope(parseFloat(lat), parseFloat(lng), radiusMeters),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    where: "FEATTYPE='School' OR FEATTYPE='Hospital/Polyclinic'",
    outFields: 'NAME,FEATTYPE',
    returnGeometry: 'true',
    f: 'json',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${KY_INSTITUTIONS_URL}?${params}`, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`KY Institutions HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`KY Institutions API error: ${data.error.message || 'unknown'}`);

  return (data.features || [])
    .map(f => {
      const g = f.geometry;
      if (!g) return null;
      const type = f.attributes.FEATTYPE === 'School' ? 'school' : 'medical';
      // The frontend auto-fills the plan's nearest-hospital field from the
      // first 'medical' hit — an animal clinic there is worse than blank.
      if (type === 'medical' && VET_NAME.test(f.attributes.NAME || '')) return null;
      return { name: f.attributes.NAME || null, type, lat: g.y, lng: g.x, hospital: type === 'medical' };
    })
    .filter(Boolean);
}
