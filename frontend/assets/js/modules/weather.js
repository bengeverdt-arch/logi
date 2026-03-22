// ============================================================
// weather.js — RAWS fuel moisture (Synoptic) + NWS forecast
// ============================================================

import { WORKER_URL } from '../config.js';

export async function initWeather({ lat, lng }) {
  const body = document.querySelector('#weather-panel .panel-body');
  body.innerHTML = '<p class="panel-loading">Fetching weather data</p>';

  const [rawsResult, alertsResult, forecastResult] = await Promise.allSettled([
    get(`${WORKER_URL}/api/synoptic?lat=${lat}&lng=${lng}`),
    get(`${WORKER_URL}/api/nws/alerts?lat=${lat}&lng=${lng}`),
    get(`${WORKER_URL}/api/nws/forecast?lat=${lat}&lng=${lng}`),
  ]);

  body.innerHTML = '';

  renderAlerts(body, alertsResult);
  renderRAWS(body, rawsResult);
  renderForecast(body, forecastResult);
}

async function get(url) {
  const res  = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---- Alerts ----
function renderAlerts(container, result) {
  if (result.status !== 'fulfilled') return;
  const alerts = (result.value.alerts || []).filter(a =>
    /red flag|fire weather/i.test(a.event || '')
  );
  alerts.forEach(a => {
    const div = document.createElement('div');
    div.className = 'alert-banner';
    div.innerHTML = `
      <div class="alert-event">⚠ ${a.event}</div>
      <div class="alert-headline">${a.headline || ''}</div>
    `;
    container.appendChild(div);
  });
}

// ---- RAWS ----
function renderRAWS(container, result) {
  const block = document.createElement('div');
  block.className = 'raws-block';

  if (result.status === 'rejected') {
    const msg = result.reason?.message || 'RAWS data unavailable.';
    block.innerHTML = `<p class="panel-error">${msg}</p>`;
    container.appendChild(block);
    return;
  }

  const { station, observations } = result.value;
  const latest = getLatestObs(observations);

  const obsDate  = latest.date_time ? new Date(latest.date_time) : null;
  const ageHours = obsDate ? (Date.now() - obsDate.getTime()) / 3_600_000 : null;
  const stale    = ageHours === null || ageHours > 3;
  const timeStr  = obsDate
    ? obsDate.toLocaleString()
    : 'Unknown';

  const fm   = latest.fuel_moisture;
  const temp = latest.air_temp;
  const rh   = latest.relative_humidity;
  const ws   = latest.wind_speed;
  const wd   = latest.wind_direction;

  block.innerHTML = `
    <div class="raws-name">${station.name}</div>
    <div class="raws-meta">${station.stid} &mdash; ${station.distance_miles?.toFixed(1) ?? '?'} mi from centroid &mdash; Elev: ${station.elevation_ft ?? '?'} ft</div>
    <div class="raws-timestamp ${stale ? 'stale' : 'fresh'}">
      ${stale ? '⚠ STALE &mdash; ' : ''}Last obs: ${timeStr}
    </div>
    <div class="obs-grid">
      ${cell('10-hr FM',  fm   != null ? fm.toFixed(1)   + '%' : '—', fm   != null && fm   < 8)}
      ${cell('Temp',      temp != null ? Math.round(temp) + '°F' : '—', false)}
      ${cell('RH',        rh   != null ? Math.round(rh)  + '%' : '—', rh   != null && rh   < 25)}
      ${cell('Wind',      ws   != null ? Math.round(ws)  + ' mph' : '—', false)}
      ${cell('Dir',       wd   != null ? deg2card(wd) : '—', false)}
    </div>
  `;
  container.appendChild(block);
}

function cell(label, value, flagged) {
  return `
    <div class="obs-cell">
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
    date_time:          times[times.length - 1] || null,
    fuel_moisture:      last('fuel_moisture_set_1') ?? last('fuel_moisture_set_1d'),
    air_temp:           last('air_temp_set_1'),
    relative_humidity:  last('relative_humidity_set_1'),
    wind_speed:         last('wind_speed_set_1'),
    wind_direction:     last('wind_direction_set_1'),
  };
}

function deg2card(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ---- NWS Forecast ----
function renderForecast(container, result) {
  const header = document.createElement('div');
  header.className = 'forecast-section-header';
  header.textContent = 'NWS Forecast';
  container.appendChild(header);

  if (result.status === 'rejected') {
    const p = document.createElement('p');
    p.className = 'panel-error';
    p.textContent = result.reason?.message || 'Forecast unavailable.';
    container.appendChild(p);
    return;
  }

  const periods = result.value.periods || [];
  if (!periods.length) {
    const p = document.createElement('p');
    p.className = 'panel-empty';
    p.textContent = 'No forecast data returned.';
    container.appendChild(p);
    return;
  }

  periods.slice(0, 5).forEach(p => {
    const div = document.createElement('div');
    div.className = 'forecast-period';
    div.innerHTML = `
      <div class="forecast-period-name">${p.name}</div>
      <div class="forecast-period-line">${p.temperature}°${p.temperature_unit} &mdash; Wind: ${p.wind_speed} ${p.wind_direction}</div>
      <div class="forecast-period-detail">${p.short_forecast}</div>
    `;
    container.appendChild(div);
  });
}
