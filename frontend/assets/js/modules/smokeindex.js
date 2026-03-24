// ============================================================
// smokeindex.js — Ventilation Index check for smoke receptor clearance
// Renders to #smoke-vi-body. Updates when receptors load or rx fields change.
// VI = mixing height (ft AGL) × transport wind (mph)
// Thresholds from NWCG Smoke Management Guide (PMS 420-2) practice.
// ============================================================

let _nearestMiles = undefined; // undefined = not yet loaded
let _nearestName  = null;

// Required VI (ft·mph) by distance to nearest sensitive receptor
function requiredVI(distMi) {
  if (distMi === null) return 50000;  // no receptors — NWCG baseline
  if (distMi <= 0.5)   return 125000;
  if (distMi <= 1.0)   return 100000;
  if (distMi <= 2.0)   return 75000;
  return 50000;
}

function tierLabel(distMi) {
  if (distMi === null) return 'no sensitive receptors within scan radius';
  if (distMi <= 0.5)   return 'receptor ≤ 0.5 mi';
  if (distMi <= 1.0)   return 'receptor ≤ 1 mi';
  if (distMi <= 2.0)   return 'receptor ≤ 2 mi';
  return 'receptor > 2 mi';
}

export function initSmokeIndex() {
  document.addEventListener('receptors:loaded', (e) => {
    _nearestMiles = e.detail.nearestMiles;
    _nearestName  = e.detail.nearestName;
    render();
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'rx-mixing-min' || e.target.id === 'rx-transport-min') {
      render();
    }
  });
}

function render() {
  const el = document.getElementById('smoke-vi-body');
  if (!el) return;

  // Don't render until receptors have been queried
  if (_nearestMiles === undefined) return;

  const mixVal       = parseFloat(document.getElementById('rx-mixing-min')?.value);
  const transportVal = parseFloat(document.getElementById('rx-transport-min')?.value);

  const reqVI  = requiredVI(_nearestMiles);
  const reqStr = reqVI.toLocaleString();
  const tier   = tierLabel(_nearestMiles);

  const receptorLabel = _nearestName
    ? `${_nearestName} (${_nearestMiles} mi)`
    : _nearestMiles !== null
      ? `unnamed receptor (${_nearestMiles} mi)`
      : 'None within scan radius';

  let viRow;
  if (!isNaN(mixVal) && !isNaN(transportVal) && mixVal > 0 && transportVal > 0) {
    const calcVI  = Math.round(mixVal * transportVal);
    const calcStr = calcVI.toLocaleString();
    const pass    = calcVI >= reqVI;
    const badge   = pass
      ? '<span class="gonogo-badge go">GO</span>'
      : '<span class="gonogo-badge nogo">NO-GO</span>';
    viRow = `<tr>
      <td class="gonogo-param">Prescription VI</td>
      <td class="gonogo-live">${calcStr} ft·mph</td>
      <td>${badge}</td>
    </tr>`;
  } else {
    viRow = `<tr>
      <td class="gonogo-param">Prescription VI</td>
      <td class="gonogo-rx" colspan="2" style="font-style:italic">Enter mixing height &amp; transport wind in Prescription Window</td>
    </tr>`;
  }

  el.innerHTML = `
    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--color-border)">
      <p style="font-size:0.68rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted);margin:0 0 6px">Smoke Ventilation Index</p>
      <table class="gonogo-table">
        <tr>
          <td class="gonogo-param">Nearest Receptor</td>
          <td class="gonogo-live" colspan="2">${receptorLabel}</td>
        </tr>
        <tr>
          <td class="gonogo-param">Required VI</td>
          <td class="gonogo-live">≥ ${reqStr} ft·mph</td>
          <td class="gonogo-rx">${tier}</td>
        </tr>
        ${viRow}
      </table>
      <p style="font-size:0.62rem;color:var(--color-text-muted);margin:5px 0 0">
        VI = mixing height (ft) &times; transport wind (mph). Guidance per NWCG PMS 420-2.
        Does not account for wind direction — verify downwind exposure in field.
      </p>
    </div>`;
}
