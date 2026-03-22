// ============================================================
// weather.js — RAWS conditions + NWS forecast → plan sections
// ============================================================

import { WORKER_URL }   from '../config.js';
import { updateLocation } from './plan.js';

export async function initWeather({ lat, lng }) {
  setLoading('conditions-body', 'Fetching RAWS data');
  setLoading('forecast-body',   'Fetching NWS forecast');

  const [rawsResult, alertsResult, forecastResult] = await Promise.allSettled([
    get(`${WORKER_URL}/api/synoptic?lat=${lat}&lng=${lng}`),
    get(`${WORKER_URL}/api/nws/alerts?lat=${lat}&lng=${lng}`),
    get(`${WORKER_URL}/api/nws/forecast?lat=${lat}&lng=${lng}`),
  ]);

  // Pull location from NWS response and populate plan header field
  if (forecastResult.status === 'fulfilled' && forecastResult.value?.location) {
    updateLocation(forecastResult.value.location);
  }

  renderConditions(rawsResult);
  renderForecast(alertsResult, forecastResult);
}

async function get(url) {
  const res  = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setLoading(id, msg) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<p class="plan-loading">${msg}</p>`;
}

// ---- RAWS ----
function renderConditions(result) {
  const el = document.getElementById('conditions-body');
  if (!el) return;

  if (result.status === 'rejected') {
    el.innerHTML = `<p class="plan-error">${result.reason?.message || 'RAWS data unavailable.'}</p>`;
    return;
  }

  const { station, observations } = result.value;
  const latest = getLatestObs(observations);

  const obsDate  = latest.date_time ? new Date(latest.date_time) : null;
  const ageHours = obsDate ? (Date.now() - obsDate.getTime()) / 3_600_000 : null;
  const stale    = ageHours === null || ageHours > 3;
  const timeStr  = obsDate ? obsDate.toLocaleString() : 'Unknown';

  const { fuel_moisture: fm, air_temp: temp, relative_humidity: rh,
          wind_speed: ws, wind_direction: wd } = latest;

  el.innerHTML = `
    <div class="raws-name">${station.name}</div>
    <div class="raws-meta">${station.stid} &mdash; ${station.distance_miles?.toFixed(1) ?? '?'} mi from centroid &mdash; Elev: ${station.elevation_ft ?? '?'} ft</div>
    <div class="raws-timestamp ${stale ? 'stale' : 'fresh'}">
      ${stale ? '⚠ STALE &mdash; ' : ''}Last obs: ${timeStr}
    </div>
    <div class="obs-grid">
      ${cell('10-hr FM',  fm   != null ? fm.toFixed(1)   + '%'  : '—', fm   != null && fm   <  8)}
      ${cell('Temp',      temp != null ? Math.round(temp) + '°F' : '—', false)}
      ${cell('RH',        rh   != null ? Math.round(rh)  + '%'  : '—', rh   != null && rh   < 25)}
      ${cell('Wind',      ws   != null ? Math.round(ws)  + ' mph' : '—', false)}
      ${cell('Direction', wd   != null ? deg2card(wd)             : '—', false)}
    </div>
  `;
}

function cell(label, value, flagged) {
  return `<div class="obs-cell">
    <div class="obs-label">${label}</div>
    <div class="obs-value${flagged ? ' flagged' : ''}">${value}</div>
  </div>`;
}

function getLatestObs(obs) {
  const last = (key) => {
    const arr = obs[key];
    if (!Array.isArray(arr)) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] !== null && arr[i] !== undefined) return arr[i];
    }
    return null;
  };
  const times = obs.date_time || [];
  return {
    date_time:         times[times.length - 1] || null,
    fuel_moisture:     last('fuel_moisture_set_1') ?? last('fuel_moisture_set_1d'),
    air_temp:          last('air_temp_set_1'),
    relative_humidity: last('relative_humidity_set_1'),
    wind_speed:        last('wind_speed_set_1'),
    wind_direction:    last('wind_direction_set_1'),
  };
}

function deg2card(deg) {
  const d = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return d[Math.round(deg / 22.5) % 16];
}

// ---- NWS Forecast ----
function renderForecast(alertsResult, forecastResult) {
  const el = document.getElementById('forecast-body');
  if (!el) return;

  el.innerHTML = '';

  // Active alerts first
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
