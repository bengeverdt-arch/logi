// ============================================================
// unitstate.js — which US state the unit is in (Census TIGERweb)
// Drives state-specific add-ons in the plan, e.g. KY / KPFC notes on
// the BSMP checklist. If the lookup fails, add-ons stay hidden and
// the national (EPA) content still shows.
// ============================================================

import { WORKER_URL } from '../config.js';
import { DIAG } from './diag.js';
import { showStateAddOns } from './plan.js';

export async function initUnitState({ lat, lng }) {
  showStateAddOns(null);

  const url = `${WORKER_URL}/api/state?lat=${lat}&lng=${lng}`;
  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  } catch (err) {
    DIAG.err('State', `${err.message} — state-specific notes hidden`, url);
    return;
  }

  DIAG.ok('State', data.state_name || 'Not in a US state');
  showStateAddOns(data.state);
}
