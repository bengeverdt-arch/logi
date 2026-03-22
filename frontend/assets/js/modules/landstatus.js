// ============================================================
// landstatus.js — Federal land status → plan section
// ============================================================

import { WORKER_URL } from '../config.js';
import { DIAG }       from './diag.js';

export async function initLandStatus({ lat, lng }) {
  const el = document.getElementById('landstatus-body');
  if (!el) return;

  el.innerHTML = '<p class="plan-loading">Fetching land status</p>';

  let data;
  try {
    const res = await fetch(`${WORKER_URL}/api/landstatus?lat=${lat}&lng=${lng}`);
    data = await res.json();
    if (!res.ok || data.error) {
      DIAG.err('LANDSTATUS', data.error || `HTTP ${res.status}`);
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    DIAG.ok('LANDSTATUS', 'OK', JSON.stringify(data));
  } catch (err) {
    el.innerHTML = `<p class="plan-error">${err.message || 'Land status unavailable.'}</p>`;
    return;
  }

  if (!data.federal) {
    el.innerHTML = `
      <div class="landstatus-row">
        <span class="landstatus-value">No federal designation found</span>
        <span class="landstatus-note">Verify ownership with county PVA or state GIS</span>
      </div>`;
    return;
  }

  const { agency, unit_name } = data.federal;
  el.innerHTML = `
    <div class="landstatus-row">
      <span class="landstatus-badge">${agency}</span>
      <span class="landstatus-value">${unit_name}</span>
    </div>`;
}
