// ============================================================
// aqmonitors.js — KY Division for Air Quality ambient monitor network
// Static list (KPFC 2026 Annual Network Plan map). No live API —
// station locations don't move; distance is computed client-side.
// Coordinates sourced from EPA AQS site master list (aqs_sites.csv),
// cross-checked by site name against the KPFC map, 2026-09-22.
// ============================================================

const KY_AQ_MONITORS = [
  { name: "Carrithers Middle School", lat: 38.182435, lng: -85.574361, county: "Jefferson" },
  { name: "Cannons Lane", lat: 38.22876, lng: -85.65452, county: "Jefferson" },
  { name: "Algonquin Parkway", lat: 38.23158, lng: -85.82678, county: "Jefferson" },
  { name: "Durrett Lane", lat: 38.1936, lng: -85.7119, county: "Jefferson" },
  { name: "Watson Lane", lat: 38.06091, lng: -85.89804, county: "Jefferson" },
  { name: "Northern Kentucky University", lat: 39.021881, lng: -84.47445, county: "Campbell" },
  { name: "Nature Center", lat: 38.967443, lng: -84.721363, county: "Boone" },
  { name: "Lexington Primary", lat: 38.06503, lng: -84.49761, county: "Fayette" },
  { name: "Eastern Kentucky University", lat: 37.736349, lng: -84.291774, county: "Madison" },
  { name: "Worthington", lat: 38.548136, lng: -82.731163, county: "Greenup" },
  { name: "21st and Greenup", lat: 38.47676, lng: -82.63137, county: "Boyd" },
  { name: "Ashland Primary", lat: 38.45934, lng: -82.64041, county: "Boyd" },
  { name: "Grayson Lake", lat: 38.23887, lng: -82.9881, county: "Carter" },
  { name: "Nicholasville", lat: 37.89147, lng: -84.58825, county: "Jessamine" },
  { name: "Buckner", lat: 38.4002, lng: -85.44428, county: "Oldham" },
  { name: "Shepherdsville", lat: 37.98629, lng: -85.71192, county: "Bullitt" },
  { name: "Freeman Lake", lat: 37.714513, lng: -85.878227, county: "Hardin" },
  { name: "Lewisport", lat: 37.93829, lng: -86.89719, county: "Hancock" },
  { name: "Meadow Lands", lat: 37.771671, lng: -87.055819, county: "Daviess" },
  { name: "Sebree SO2 DRR Site", lat: 37.654381, lng: -87.511427, county: "Henderson" },
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

export function initAQMonitors({ lat, lng }) {
  const el = document.getElementById('aqmonitors-body');
  if (!el) return;

  const ranked = KY_AQ_MONITORS
    .map(m => ({ ...m, distance_miles: haversine(lat, lng, m.lat, m.lng) }))
    .sort((a, b) => a.distance_miles - b.distance_miles);

  const nearest = ranked[0];

  document.dispatchEvent(new CustomEvent('aqmonitors:loaded', {
    detail: { nearestMiles: nearest.distance_miles, nearestName: nearest.name },
  }));

  el.innerHTML = `
    <p style="font-size:0.68rem;color:var(--color-text-muted);margin:10px 0 4px">
      Nearest KDAQ ambient air monitors — treat as smoke sensitive targets (KPFC Air Quality Update, Sep 2026)
    </p>
    <ul class="receptor-list">
      ${ranked.slice(0, 3).map(m => `
        <li class="receptor-item">
          <span class="receptor-badge other">AQ Monitor</span>
          <span class="receptor-name">${m.name} (${m.county} Co.)</span>
          <span class="receptor-dist">${m.distance_miles} mi</span>
        </li>`).join('')}
    </ul>
    <p style="font-size:0.62rem;color:var(--color-text-muted);margin:2px 0 0">
      Static list, 29 stations statewide, per KDAQ 2026 Annual Network Plan. Verify against current KDAQ site list before relying on for Exceptional Event documentation.
    </p>`;

  // Auto-fill BSMP checklist notes (items 1 and 2) — data only, no judgment
  const dispersionNote = document.getElementById('bsmp-note-0');
  if (dispersionNote && !dispersionNote.value.trim()) {
    dispersionNote.value = `Nearest AQ monitor: ${nearest.name} (${nearest.county} Co.) — ${nearest.distance_miles} mi`;
  }
  const monitoringNote = document.getElementById('bsmp-note-1');
  if (monitoringNote && !monitoringNote.value.trim()) {
    monitoringNote.value = `Watch: ${nearest.name} (${nearest.county} Co.) — ${nearest.distance_miles} mi. Check https://www.airnow.gov before, during, after burn.`;
  }
}
