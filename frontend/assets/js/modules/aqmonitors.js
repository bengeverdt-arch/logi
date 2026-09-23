// ============================================================
// aqmonitors.js — nearest ambient air monitors (smoke sensitive targets)
// National: EPA AirNow via /api/aqmonitors (hourly, real-time monitors
// only). KY add-on: static KDAQ network list (KPFC 2026 Annual Network
// Plan map) — supplies readable names for AirNow's site codes and adds
// filter-based sites AirNow doesn't carry. If AirNow is down, the KY
// list is the fallback near KY; elsewhere the plan says so.
// KY coordinates sourced from EPA AQS site master list (aqs_sites.csv),
// cross-checked by site name against the KPFC map, 2026-09-22.
// ============================================================

import { WORKER_URL } from '../config.js';
import { DIAG } from './diag.js';

const KY_AQ_MONITORS = [
  { name: "Carrithers Middle School", lat: 38.182435, lng: -85.574361, county: "Jefferson" },
  { name: "Cannons Lane", lat: 38.22876, lng: -85.65452, county: "Jefferson" },
  { name: "Algonquin Parkway", lat: 38.23158, lng: -85.82678, county: "Jefferson" },
  { name: "Durrett Lane", lat: 38.1936, lng: -85.7119, county: "Jefferson" },
  { name: "Watson Lane", lat: 38.06091, lng: -85.89804, county: "Jefferson" },
  { name: "Northern Kentucky University", lat: 39.021881, lng: -84.47445, county: "Campbell" },
  { name: "Nature Center", lat: 38.967443, lng: -84.721363, county: "Boone" },
  { name: "Lexington Primary", lat: 38.06503, lng: -84.49761, county: "Fayette" },
  { name: "Eastern Kentucky University", lat: 37.736349, lng: -84.291774, county: "Madison", pollutant: "Lead" },
  { name: "Worthington", lat: 38.548136, lng: -82.731163, county: "Greenup" },
  { name: "21st and Greenup", lat: 38.47676, lng: -82.63137, county: "Boyd", pollutant: "PM10" },
  { name: "Ashland Primary", lat: 38.45934, lng: -82.64041, county: "Boyd" },
  { name: "Grayson Lake", lat: 38.23887, lng: -82.9881, county: "Carter" },
  { name: "Nicholasville", lat: 37.89147, lng: -84.58825, county: "Jessamine" },
  { name: "Buckner", lat: 38.4002, lng: -85.44428, county: "Oldham" },
  { name: "Shepherdsville", lat: 37.98629, lng: -85.71192, county: "Bullitt" },
  { name: "Freeman Lake", lat: 37.714513, lng: -85.878227, county: "Hardin" },
  { name: "Lewisport", lat: 37.93829, lng: -86.89719, county: "Hancock" },
  { name: "Meadow Lands", lat: 37.771671, lng: -87.055819, county: "Daviess" },
  { name: "Sebree SO2 DRR Site", lat: 37.654381, lng: -87.511427, county: "Henderson", pollutant: "SO2" },
  { name: "Smithland", lat: 37.155392, lng: -88.394024, county: "Livingston" },
  { name: "Paducah Transit", lat: 37.08727, lng: -88.60801, county: "McCracken" },
  { name: "Pennyrile Forest", lat: 37.057818, lng: -87.649809, county: "Christian" },
  { name: "Franklin", lat: 36.708607, lng: -86.566284, county: "Simpson" },
  { name: "Ed Spear Park", lat: 37.04926, lng: -86.21487, county: "Warren" },
  { name: "Somerset", lat: 37.09798, lng: -84.61152, county: "Pulaski" },
  { name: "Middlesboro", lat: 36.60843, lng: -83.73694, county: "Bell" },
  { name: "Hazard", lat: 37.28329, lng: -83.20932, county: "Perry" },
  { name: "Pikeville Primary", lat: 37.4826, lng: -82.53532, county: "Pike" },
];

function haversine(lat1, lng1, lat2, lng2) {
  const R    = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
             * Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

const MAX_RELEVANT_MILES = 100;
const SHOWN = 3;
// AirNow and KDAQ geocode the same site slightly differently (FIVCO vs
// Ashland Primary 0.35 mi, HAZ2 vs Hazard 0.60 mi) — treat anything this
// close as one. 21st & Greenup (1.2 mi from FIVCO) is a separate site.
const SAME_SITE_MILES = 0.75;

async function fetchAirNow(lat, lng) {
  const url = `${WORKER_URL}/api/aqmonitors?lat=${lat}&lng=${lng}`;
  try {
    const res  = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    DIAG.ok('AQ Monitors', `${data.monitors.length} EPA AirNow monitors within ${data.radius_miles} mi`);
    return { monitors: data.monitors, error: null };
  } catch (err) {
    DIAG.err('AQ Monitors', err.message, url);
    return { monitors: null, error: err.message };
  }
}

// KY entries rename the matching AirNow site (NICHVILL → Nicholasville)
// and keep its live readings; KY sites with no AirNow match are added.
function mergeKY(epa, ky) {
  const merged = epa.map(m => ({ ...m }));
  for (const k of ky) {
    const match = merged.find(m =>
      haversine(m.lat, m.lng, k.lat, k.lng) < SAME_SITE_MILES);
    if (match) {
      match.name = k.name;
      match.county = k.county;
    } else {
      merged.push({ ...k });
    }
  }
  return merged.sort((a, b) => a.distance_miles - b.distance_miles);
}

function label(m) {
  return m.county ? `${m.name} (${m.county} Co.)` : m.name;
}

function readings(m) {
  const parts = [];
  if (m.pm25_aqi  != null) parts.push(`PM2.5 AQI ${m.pm25_aqi}`);
  if (m.ozone_aqi != null) parts.push(`O3 AQI ${m.ozone_aqi}`);
  if (!parts.length) return '';
  const time = m.observed ? ` @ ${m.observed.replace(/:00 GMT/, ' GMT').slice(11)}` : '';
  return `current: ${parts.join(' · ')}${time}`;
}

function note(text) {
  return `<p style="font-size:0.62rem;color:var(--color-text-muted);margin:2px 0 0">${text}</p>`;
}

function publish(nearest) {
  document.dispatchEvent(new CustomEvent('aqmonitors:loaded', {
    detail: nearest
      ? { nearestMiles: nearest.distance_miles, nearestName: label(nearest) }
      : { nearestMiles: null, nearestName: null },
  }));
}

export async function initAQMonitors({ lat, lng }) {
  const el = document.getElementById('aqmonitors-body');
  if (!el) return;
  el.innerHTML = '<p class="plan-loading">Loading air monitors</p>';

  const kyNear = KY_AQ_MONITORS
    .map(m => ({ ...m, distance_miles: haversine(lat, lng, m.lat, m.lng) }))
    .filter(m => m.distance_miles <= MAX_RELEVANT_MILES);

  const epa = await fetchAirNow(lat, lng);
  const ranked = mergeKY(epa.monitors || [], kyNear);
  const nearest = ranked[0] || null;
  publish(nearest);

  const notes = [];
  if (epa.error) {
    notes.push(`<strong>EPA AirNow monitor list unavailable</strong> (${epa.error}).` +
      (kyNear.length ? ' Showing KY list only.' : ''));
  }
  if (kyNear.length) {
    notes.push('KY sites per KDAQ 2026 Annual Network Plan (KPFC Air Quality Update, Sep 2026). ' +
      'Verify against current KDAQ site list before relying on for Exceptional Event documentation.');
  }

  if (!nearest) {
    // Down ≠ none: don't let an outage read as "no monitors nearby".
    el.innerHTML = `<p style="font-size:0.68rem;color:var(--color-text-muted);margin:10px 0 4px">
      ${epa.error ? 'Could not check for air monitors.' : `No air monitors found within ${MAX_RELEVANT_MILES} mi.`}
      Check <a href="https://www.airnow.gov" target="_blank" rel="noopener">airnow.gov</a> for local monitors.
    </p>${notes.map(note).join('')}`;
    return;
  }

  el.innerHTML = `
    <p style="font-size:0.68rem;color:var(--color-text-muted);margin:10px 0 4px">
      Nearest ambient air monitors &mdash; treat as smoke sensitive targets
    </p>
    <ul class="receptor-list">
      ${ranked.slice(0, SHOWN).map(m => `
        <li class="receptor-item">
          <span class="receptor-badge other">AQ Monitor${m.temporary ? ' &middot; Temporary' : ''}${m.pollutant ? ` &middot; ${m.pollutant}` : ''}</span>
          <span class="receptor-name">${label(m)}${readings(m) ? `<br><span style="font-size:0.62rem;color:var(--color-text-muted)">${readings(m)}</span>` : ''}</span>
          <span class="receptor-dist">${m.distance_miles} mi</span>
        </li>`).join('')}
    </ul>
    ${note(epa.error
      ? 'Source: KDAQ network list (no live readings).'
      : 'Source: EPA AirNow (latest hour, real-time monitors)' + (kyNear.length ? ' + KDAQ network list.' : '.') +
        ' AQI values are the current hourly reading, not a forecast.')}
    ${notes.map(note).join('')}`;

  // Auto-fill BSMP checklist notes (items 1 and 2) — data only, no judgment
  const dispersionNote = document.getElementById('bsmp-note-0');
  if (dispersionNote && !dispersionNote.value.trim()) {
    dispersionNote.value = `Nearest AQ monitor: ${label(nearest)} — ${nearest.distance_miles} mi`;
  }
  const monitoringNote = document.getElementById('bsmp-note-1');
  if (monitoringNote && !monitoringNote.value.trim()) {
    monitoringNote.value = `Watch: ${label(nearest)} — ${nearest.distance_miles} mi. Check https://www.airnow.gov before, during, after burn.`;
  }
}
