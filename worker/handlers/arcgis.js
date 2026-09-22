// ============================================================
// arcgis.js — shared helpers for ArcGIS REST FeatureServer/MapServer
// queries (FEMA, FAA, transmission lines, TIGERweb states).
// ============================================================

const DEFAULT_TIMEOUT_MS = 12000;

export function envelope(lat, lng, radiusMeters) {
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));
  return `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;
}

// `label` names the source in error messages, which surface in the plan's warnings.
export async function queryArcGIS(url, params, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const qs = new URLSearchParams({ f: 'json', ...params });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${url}?${qs}`, { signal: controller.signal });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? `${label} timed out` : `${label} fetch failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`${label} API error: ${data.error.message || 'unknown'}`);
  return data;
}

// Closest vertex of a polyline (paths) or polygon (rings) to a point.
export function nearestVertex(geom, lat, lng) {
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
