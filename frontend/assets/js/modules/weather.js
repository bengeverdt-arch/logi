// ============================================================
// weather.js — RAWS conditions (NIFC) + NWS forecast → plan sections
// ============================================================

import { WORKER_URL }    from '../config.js';
import { updateLocation } from './plan.js';
import { DIAG }           from './diag.js';

let _latestRaws = null;
export function getLatestRaws() { return _latestRaws; }

export async function initWeather({ lat, lng }) {
  setLoading('conditions-body', 'Fetching RAWS data');
  setLoading('forecast-body',   'Fetching NWS forecast');

  const [rawsResult, alertsResult, forecastResult, elevResult, ventResult] = await Promise.allSettled([
    diagFetch(`${WORKER_URL}/api/raws?lat=${lat}&lng=${lng}`, 'RAWS'),
    diagFetch(`${WORKER_URL}/api/nws/alerts?lat=${lat}&lng=${lng}`, 'NWS-ALERTS'),
    diagFetch(`${WORKER_URL}/api/nws/forecast?lat=${lat}&lng=${lng}`, 'NWS-FCST'),
    diagFetch(`${WORKER_URL}/api/elevation?lat=${lat}&lng=${lng}`, 'ELEV'),
    diagFetch(`${WORKER_URL}/api/nws/ventilation?lat=${lat}&lng=${lng}`, 'NWS-VENT'),
  ]);

  if (forecastResult.status === 'fulfilled' && forecastResult.value?.location) {
    updateLocation(forecastResult.value.location);
  }

  if (rawsResult.status === 'fulfilled') {
    _latestRaws = rawsResult.value.latest ?? null;
    document.dispatchEvent(new Event('raws:loaded'));
  } else {
    _latestRaws = null;
  }

  const centroidElevFt = elevResult.status === 'fulfilled' ? (elevResult.value.elevation_ft ?? null) : null;

  renderConditions(rawsResult, centroidElevFt);
  renderForecast(alertsResult, forecastResult);
  renderVentilation(ventResult);
}

async function diagFetch(url, src) {
  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
    if (!res.ok || data.error) {
      DIAG.err(src, data.error || `HTTP ${res.status}`, url);
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    DIAG.ok(src, 'OK', JSON.stringify(data).substring(0, 200));
    return data;
  } catch (err) {
    if (!data) DIAG.err(src, err.message, url);
    throw err;
  }
}

function setLoading(id, msg) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<p class="plan-loading">${msg}</p>`;
}

// ---- RAWS ----
function renderConditions(result, centroidElevFt) {
  const el = document.getElementById('conditions-body');
  if (!el) return;

  if (result.status === 'rejected') {
    el.innerHTML = `<p class="plan-error">${result.reason?.message || 'RAWS data unavailable.'}</p>`;
    return;
  }

  const { station, latest, fuel_moisture_station: fmSta } = result.value;

  const obsDate  = latest.date_time ? new Date(latest.date_time) : null;
  const ageHours = obsDate ? (Date.now() - obsDate.getTime()) / 3_600_000 : null;
  const stale    = ageHours === null || ageHours > 3;
  const timeStr  = obsDate ? obsDate.toLocaleString() : 'Unknown';

  const { fuel_moisture: fm, air_temp: temp, relative_humidity: rh,
          wind_speed: ws, wind_direction: wd } = latest;

  const stationElev = station.elevation_ft ?? null;
  let elevDisplay = stationElev != null ? `${stationElev.toLocaleString()} ft` : '?';
  if (stationElev != null && centroidElevFt != null) {
    const delta = Math.round(stationElev - centroidElevFt);
    elevDisplay += ` (${delta >= 0 ? '+' : ''}${delta} ft vs unit)`;
  }

  el.innerHTML = `
    <div class="raws-name">${station.name}</div>
    <div class="raws-meta">${station.stid ? `Station ID ${station.stid} &mdash; ` : ''} ${station.distance_miles?.toFixed(1) ?? '?'} mi from centroid &mdash; Elev: ${elevDisplay}</div>
    <div class="raws-timestamp ${stale ? 'stale' : 'fresh'}">
      ${stale ? '⚠ STALE &mdash; ' : ''}Last obs: ${timeStr}
    </div>
    <div class="obs-grid">
      ${cell('10-hr FM',  fm   != null ? fm.toFixed(1)   + '%'  : '—', fm   != null && fm   <  8)}
      ${cell('Temp',      temp != null ? Math.round(temp) + '°F' : '—', false)}
      ${cell('RH',        rh   != null ? Math.round(rh)  + '%'  : '—', rh   != null && rh   < 25)}
      ${cell('Wind',      ws   != null ? Math.round(ws)  + ' mph' : '—', false)}
      ${cell('Gust',      latest.wind_gust != null ? Math.round(latest.wind_gust) + ' mph' : '—', false)}
      ${cell('Direction', wd   != null ? deg2card(wd)             : '—', false)}
    </div>
    ${fmSta ? `<p class="raws-meta">10-hr FM from ${fmSta.name} (${fmSta.distance_miles.toFixed(1)} mi) &mdash; ${station.name} has no fuel stick reading.</p>` : ''}
    <p class="raws-meta">Source: NIFC Interagency RAWS (latest ob only)${station.history_url
      ? ` &mdash; <a href="${station.history_url}" target="_blank" rel="noopener">station history</a>` : ''}.
      Take on-site readings before ignition.</p>
  `;
}

function cell(label, value, flagged) {
  return `<div class="obs-cell">
    <div class="obs-label">${label}</div>
    <div class="obs-value${flagged ? ' flagged' : ''}">${value}</div>
  </div>`;
}

function deg2card(deg) {
  const d = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return d[Math.round(deg / 22.5) % 16];
}

// ---- Smoke / Ventilation Index ----
// Forecast VI is displayed by smokeindex.js next to the VI the nearest
// receptor needs. This only hands the numbers over (null = unavailable).
function renderVentilation(result) {
  const v = result.status === 'fulfilled' ? result.value : null;
  document.dispatchEvent(new CustomEvent('vent:loaded', {
    detail: v ? {
      mixing_height_ft:   v.mixing_height_ft,
      transport_wind_mph: v.transport_wind_mph,
      ventilation_index:  v.ventilation_index,
    } : {},
  }));
}

// ---- NWS Forecast ----
function renderForecast(alertsResult, forecastResult) {
  const el = document.getElementById('forecast-body');
  if (!el) return;

  el.innerHTML = '';

  if (alertsResult.status === 'fulfilled') {
    const redFlag = (alertsResult.value.alerts || [])
      .filter(a => /red flag|fire weather/i.test(a.event || ''));
    redFlag.forEach(a => {
      el.insertAdjacentHTML('beforeend', `
        <div class="alert-banner">
          <div class="alert-event">⚠ ${a.event}</div>
          <div class="alert-headline">${a.headline || ''}</div>
        </div>`);
    });
  }

  if (forecastResult.status === 'rejected') {
    el.insertAdjacentHTML('beforeend',
      `<p class="plan-error">${forecastResult.reason?.message || 'Forecast unavailable.'}</p>`);
    return;
  }

  const periods = forecastResult.value.periods || [];
  if (!periods.length) {
    el.insertAdjacentHTML('beforeend', '<p class="plan-pending">No forecast periods returned.</p>');
    return;
  }

  periods.slice(0, 5).forEach(p => {
    el.insertAdjacentHTML('beforeend', `
      <div class="forecast-period">
        <div class="forecast-period-name">${p.name}</div>
        <div class="forecast-period-line">${p.temperature}°${p.temperature_unit} &mdash; Wind: ${p.wind_speed} ${p.wind_direction}</div>
        <div class="forecast-period-detail">${p.short_forecast}</div>
      </div>`);
  });
}
