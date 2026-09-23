// ============================================================
// hospitals.js — nearest hospitals (25 mi) → Safety section
// Lists the closest hospitals with ER status from CMS and fills the
// Nearest Hospital field with the closest CMS-confirmed ER. A hospital
// CMS can't be matched to is shown "ER not confirmed" — never assumed.
// ============================================================

import { WORKER_URL } from '../config.js';
import { DIAG } from './diag.js';

function erTag(er) {
  if (er === true)  return '<span class="receptor-badge medical">ER</span>';
  if (er === false) return '<span class="receptor-badge other">No ER</span>';
  return '<span class="receptor-badge other">ER not confirmed</span>';
}

export async function initHospitals({ lat, lng }) {
  const el = document.getElementById('f-hospitals');
  if (!el) return;
  el.innerHTML = '<p class="plan-loading">Finding hospitals</p>';

  const url = `${WORKER_URL}/api/hospitals?lat=${lat}&lng=${lng}`;
  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  } catch (err) {
    DIAG.err('Hospitals', err.message, url);
    el.innerHTML = `<p class="plan-error">Hospital lookup failed (${err.message}). Enter nearest ER manually.</p>`;
    return;
  }
  DIAG.ok('Hospitals', `${data.hospitals.length} within ${data.radius_miles} mi; nearest ER: ${data.nearest_er?.name ?? 'none confirmed'}`);

  const warn = (data.warnings || []).map(w => `<p class="plan-error" style="margin:4px 0">&#9888; ${w}</p>`).join('');
  if (!data.hospitals.length) {
    el.innerHTML = `${warn}<p class="plan-pending">No hospitals within ${data.radius_miles} mi. Identify nearest ER and air ambulance manually.</p>`;
    return;
  }

  el.innerHTML = `${warn}
    <ul class="receptor-list" style="margin-top:4px">
      ${data.hospitals.map(h => `
        <li class="receptor-item">
          ${erTag(h.er)}
          <span class="receptor-name">${h.name}<br><span style="font-size:0.62rem;color:var(--color-text-muted)">${h.address}${h.phone ? ` &middot; ${h.phone}` : ''}</span></span>
          <span class="receptor-dist">${h.distance_miles} mi</span>
        </li>`).join('')}
    </ul>
    <p style="font-size:0.62rem;color:var(--color-text-muted);margin:2px 0 0">
      Straight-line distance. Locations: USGS National Structures Dataset. ER status: CMS Hospital General Information.
      Confirm ER availability and drive route before the burn.
    </p>`;

  // Never overwrite something the user typed.
  const field = document.getElementById('f-nearest-hospital');
  const er = data.nearest_er;
  if (field && er && !field.value.trim()) {
    field.value = `${er.name}, ${er.address}${er.phone ? `, ${er.phone}` : ''} — ${er.distance_miles} mi (auto — ER per CMS; confirm)`;
  }
}
