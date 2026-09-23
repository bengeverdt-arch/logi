// ============================================================
// nces.js — NCES EDGE K-12 school locations (US Dept. of Education)
// National, no key. Public schools 2024-25 + private schools 2023-24
// (the newest year NCES publishes for each). Private list includes
// micro-schools and occasionally repeats a school — same name at the
// same spot is collapsed here.
// Verified 2026-09-23 at Berea KY, Bozeman MT, Gainesville FL, Bend OR.
// ============================================================

import { queryArcGIS } from './arcgis.js';

const NCES_BASE = 'https://nces.ed.gov/opengis/rest/services/K12_School_Locations';
const PUBLIC_URL  = `${NCES_BASE}/EDGE_GEOCODE_PUBLICSCH_2425/MapServer/0/query`;
const PRIVATE_URL = `${NCES_BASE}/EDGE_GEOCODE_PRIVATESCH_2324/MapServer/0/query`;

async function querySchools(url, lat, lng, radiusMeters, label) {
  const data = await queryArcGIS(url, {
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    distance: String(Math.round(radiusMeters)),
    units: 'esriSRUnit_Meter',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'NAME',
    returnGeometry: 'true',
    outSR: '4326',
  }, label);
  return (data.features || [])
    .filter(f => f.geometry)
    .map(f => ({ name: tidyName(f.attributes.NAME), type: 'school', lat: f.geometry.y, lng: f.geometry.x }));
}

// Some states submit names in all caps — make them readable.
function tidyName(name) {
  const n = (name || '').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  if (n !== n.toUpperCase()) return n;
  return n.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
}

// If one half fails the other still counts; `failed` names the missing
// half so the plan can say so. Both failing throws.
export async function getNCESSchools(lat, lng, radiusMeters) {
  const halves = await Promise.allSettled([
    querySchools(PUBLIC_URL, lat, lng, radiusMeters, 'NCES public schools'),
    querySchools(PRIVATE_URL, lat, lng, radiusMeters, 'NCES private schools'),
  ]);
  if (halves.every(h => h.status === 'rejected')) {
    throw new Error(halves.map(h => h.reason.message).join('; '));
  }
  const failed = halves.filter(h => h.status === 'rejected').map(h => h.reason.message);
  const seen = new Set();
  const schools = halves.flatMap(h => h.status === 'fulfilled' ? h.value : []).filter(s => {
    const key = `${(s.name || '').toLowerCase()}|${s.lat.toFixed(4)}|${s.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { schools, failed };
}
