// ============================================================
// weather.js — RAWS fuel moisture + NWS spot forecast display
// Implemented in v0.3.0 (RAWS) and v0.4.0 (NWS)
// ============================================================

export function initWeather(centroid) {
  // TODO v0.3.0:
  // - Find nearest RAWS station to centroid via Worker /api/synoptic
  // - Display 10-hr and 100-hr dead fuel moisture, temp, RH, wind
  // - Show observation timestamp — flag if > 3 hours old
  // TODO v0.4.0:
  // - Request NWS spot forecast for centroid via Worker /api/nws
  // - Display forecast period, wind, RH, mixing height, transport winds
  // - Show raw forecast text
  console.log('[weather] module loaded — not yet implemented');
}
