// ============================================================
// gonogo.js — Prescription Go/No-Go
// Compares live RAWS conditions against user-entered prescription
// window. No API calls — pure DOM + weather module state.
// ============================================================

import { getLatestRaws } from './weather.js';

const RX_FIELDS = [
  'rx-wind-min', 'rx-wind-max', 'rx-wind-dir',
  'rx-rh-min',   'rx-rh-max',
  'rx-temp-min',  'rx-temp-max',
  'rx-fm10-min',  'rx-fm10-max',
  'rx-fm100-min', 'rx-fm100-max',
  'rx-mixing-min', 'rx-transport-min',
];

export function initGoNoGo() {
  document.addEventListener('raws:loaded', runGoNoGo);

  // Re-run whenever any prescription field changes
  RX_FIELDS.forEach(id => {
    document.getElementById(id)?.addEventListener('input', runGoNoGo);
  });
}

export function runGoNoGo() {
  const el = document.getElementById('gonogo-body');
  if (!el) return;

  const raws = getLatestRaws();
  const rx   = readPrescription();

  const ws   = raws?.wind_speed;
  const wd   = raws?.wind_direction;
  const rh   = raws?.relative_humidity;
  const temp = raws?.air_temp;
  const fm10 = raws?.fuel_moisture;

  const checks = [
    {
      label:  'Wind Speed',
      live:   ws   != null ? `${Math.round(ws)} mph`      : null,
      rx:     formatRange(rx.windMin, rx.windMax, ' mph'),
      status: checkRange(ws, rx.windMin, rx.windMax),
    },
    {
      label:  'Rel. Humidity',
      live:   rh   != null ? `${Math.round(rh)}%`         : null,
      rx:     formatRange(rx.rhMin, rx.rhMax, '%'),
      status: checkRange(rh, rx.rhMin, rx.rhMax),
    },
    {
      label:  'Temperature',
      live:   temp != null ? `${Math.round(temp)}\u00B0F`  : null,
      rx:     formatRange(rx.tempMin, rx.tempMax, '\u00B0F'),
      status: checkRange(temp, rx.tempMin, rx.tempMax),
    },
    {
      label:  '10-hr FM',
      live:   fm10 != null ? `${fm10.toFixed(1)}%`        : null,
      rx:     formatRange(rx.fm10Min, rx.fm10Max, '%'),
      status: checkRange(fm10, rx.fm10Min, rx.fm10Max),
    },
    // Wind direction: no numeric comparison — show for manual check
    {
      label:  'Wind Direction',
      live:   wd != null ? `${deg2card(wd)} (${Math.round(wd)}\u00B0)` : null,
      rx:     rx.windDir,
      status: 'manual',
    },
    // Parameters with no live RAWS data — show only if prescription set
    {
      label:  '100-hr FM',
      live:   null,
      rx:     formatRange(rx.fm100Min, rx.fm100Max, '%'),
      status: 'nodata',
      hide:   rx.fm100Min == null && rx.fm100Max == null,
    },
    {
      label:  'Mixing Height',
      live:   null,
      rx:     rx.mixingMin != null ? `\u2265 ${rx.mixingMin} ft AGL` : null,
      status: 'nodata',
      hide:   rx.mixingMin == null,
    },
    {
      label:  'Transport Wind',
      live:   null,
      rx:     rx.transportMin != null ? `\u2265 ${rx.transportMin} mph` : null,
      status: 'nodata',
      hide:   rx.transportMin == null,
    },
  ];

  const automated = checks.filter(c => c.status === 'go' || c.status === 'nogo');
  const nogos     = automated.filter(c => c.status === 'nogo');

  let overall, overallClass;
  if (!raws) {
    overall      = 'Awaiting live conditions — draw a burn unit first';
    overallClass = 'overall-na';
  } else if (automated.length === 0) {
    overall      = 'Set prescription values above to enable Go / No-Go';
    overallClass = 'overall-na';
  } else if (nogos.length > 0) {
    overall      = `NO-GO \u2014 ${nogos.length} parameter${nogos.length > 1 ? 's' : ''} out of prescription`;
    overallClass = 'overall-nogo';
  } else {
    overall      = 'GO \u2014 All checked parameters within prescription';
    overallClass = 'overall-go';
  }

  const visible = checks.filter(c => !c.hide);

  el.innerHTML = `
    <div class="gonogo-overall ${overallClass}">${overall}</div>
    <table class="gonogo-table">
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Live (RAWS)</th>
          <th>Prescription</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${visible.map(c => `
          <tr>
            <td class="gonogo-param">${c.label}</td>
            <td class="gonogo-live">${c.live ?? '<span class="gonogo-na">\u2014</span>'}</td>
            <td class="gonogo-rx">${c.rx   ?? '<span class="gonogo-na">not set</span>'}</td>
            <td>${badge(c.status)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// ---- Helpers ----

function readPrescription() {
  return {
    windMin:      num('rx-wind-min'),
    windMax:      num('rx-wind-max'),
    windDir:      txt('rx-wind-dir'),
    rhMin:        num('rx-rh-min'),
    rhMax:        num('rx-rh-max'),
    tempMin:      num('rx-temp-min'),
    tempMax:      num('rx-temp-max'),
    fm10Min:      num('rx-fm10-min'),
    fm10Max:      num('rx-fm10-max'),
    fm100Min:     num('rx-fm100-min'),
    fm100Max:     num('rx-fm100-max'),
    mixingMin:    num('rx-mixing-min'),
    transportMin: num('rx-transport-min'),
  };
}

function num(id) {
  const v = document.getElementById(id)?.value.trim();
  if (!v) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function txt(id) {
  const v = document.getElementById(id)?.value.trim();
  return v || null;
}

function checkRange(value, min, max) {
  if (value == null)              return 'na';
  if (min == null && max == null) return 'na';
  const ok = (min == null || value >= min) && (max == null || value <= max);
  return ok ? 'go' : 'nogo';
}

function formatRange(min, max, unit) {
  if (min == null && max == null) return null;
  if (min == null) return `\u2264 ${max}${unit}`;
  if (max == null) return `\u2265 ${min}${unit}`;
  return `${min}\u2013${max}${unit}`;
}

function badge(status) {
  const map = {
    go:     '<span class="gonogo-badge go">GO</span>',
    nogo:   '<span class="gonogo-badge nogo">NO-GO</span>',
    manual: '<span class="gonogo-badge manual">MANUAL</span>',
    nodata: '<span class="gonogo-badge nodata">NO DATA</span>',
    na:     '<span class="gonogo-badge na">\u2014</span>',
  };
  return map[status] ?? map.na;
}

function deg2card(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}
