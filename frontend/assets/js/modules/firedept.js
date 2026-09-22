// ============================================================
// firedept.js — responding fire department → Resources section
// Kentucky only (KY 911 fire response boundaries). Elsewhere the
// field is left blank for manual entry.
// ============================================================

import { WORKER_URL } from '../config.js';
import { DIAG } from './diag.js';

export async function initFireDept({ lat, lng }) {
  const field = document.getElementById('f-fire-dept');
  if (!field) return;

  const url = `${WORKER_URL}/api/firedistrict?lat=${lat}&lng=${lng}`;
  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  } catch (err) {
    DIAG.err('Fire Dept', err.message, url);
    return;
  }

  if (!data.fire_department) {
    DIAG.ok('Fire Dept', 'No KY fire response area at this point (outside KY?)');
    return;
  }
  DIAG.ok('Fire Dept', data.fire_department);

  // Never overwrite something the user typed.
  if (!field.value.trim()) {
    field.value = `${data.fire_department} (auto — KY 911 fire response area; confirm)`;
  }
}
