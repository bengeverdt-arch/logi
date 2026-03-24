// ============================================================
// infrastructure.js — power lines (hazards) + helipads
// Power lines → Safety section auto-list
// Helipads → Resources section + map markers
// Leaflet loaded as global via CDN
// ============================================================

import { WORKER_URL } from '../config.js';
import { DIAG } from './diag.js';

export async function initInfrastructure({ lat, lng }, infraLayer) {
  infraLayer.clearLayers();

  const url = `${WORKER_URL}/api/osm/infrastructure?lat=${lat}&lng=${lng}`;
  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
    if (!res.ok || data.error) {
      DIAG.err('OSM Infra', data.error || `HTTP ${res.status}`, url);
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    DIAG.ok('OSM Infra', `${data.powerlines?.length ?? 0} power lines, ${data.helipads?.length ?? 0} helipads`);
  } catch (err) {
    if (!data) DIAG.err('OSM Infra', err.message, url);
    // Fail silently — these are supplemental, not blocking
    const plEl = document.getElementById('f-powerlines');
    if (plEl) plEl.innerHTML = '';
    const hpEl = document.getElementById('f-helipads');
    if (hpEl) hpEl.innerHTML = '<p class="plan-pending">Infrastructure scan failed. Identify helipads manually.</p>';
    return;
  }

  renderPowerLines(data.powerlines || [], data.hazard_radius_m, data.powerlines_total ?? data.powerlines?.length ?? 0);
  renderHelipads(data.helipads || [], data.heli_radius_m, infraLayer);
}

function renderPowerLines(powerlines, radiusM, total) {
  const el = document.getElementById('f-powerlines');
  if (!el) return;

  if (!powerlines.length) {
    el.innerHTML = '';
    return;
  }

  const radiusMi = (radiusM / 1609.34).toFixed(1);

  let html = `<div class="infra-auto-block">
    <p class="infra-auto-label">Power lines within ${radiusMi} mi (auto &mdash; OpenStreetMap)</p>
    <ul class="receptor-list">`;

  powerlines.forEach(p => {
    const label   = p.name || (p.voltage ? `${parseInt(p.voltage).toLocaleString()}V line` : 'Unnamed line');
    const voltage = p.voltage ? ` &mdash; ${parseInt(p.voltage).toLocaleString()}V` : '';
    html += `<li class="receptor-item">
      <span class="receptor-badge" style="color:#ffb74d;border:1px solid #ffb74d">PWR</span>
      <span class="receptor-name">${label}${voltage && !p.name ? '' : voltage}</span>
      <span class="receptor-dist">${p.distance_miles} mi</span>
    </li>`;
  });

  const truncNote = total > powerlines.length
    ? `<p style="font-size:0.63rem;color:var(--color-text-muted);margin:3px 0 0;font-style:italic">+${total - powerlines.length} more segments not shown.</p>`
    : '';

  html += `</ul>
    ${truncNote}
    <p style="font-size:0.63rem;color:var(--color-text-muted);margin:4px 0 0">
      Verify in field. OSM power line coverage varies.
    </p>
  </div>`;

  el.innerHTML = html;
}

function renderHelipads(helipads, radiusM, infraLayer) {
  const el = document.getElementById('f-helipads');
  if (!el) return;

  if (!helipads.length) {
    el.innerHTML = `<p style="font-size:0.78rem;color:var(--color-text-muted);font-style:italic;margin:0">
      No mapped helipads within 10 mi. Identify improvised LZ manually.
    </p>`;
    return;
  }

  const radiusMi = (radiusM / 1609.34).toFixed(0);
  let html = `<p style="font-size:0.68rem;color:var(--color-text-muted);margin:0 0 4px">
    ${helipads.length} helipad${helipads.length > 1 ? 's' : ''} within ${radiusMi} mi (auto &mdash; OpenStreetMap)
  </p>
  <ul class="receptor-list">`;

  helipads.forEach(h => {
    const name = h.name || 'Unnamed helipad';

    L.marker([h.lat, h.lng], {
      icon: L.divIcon({
        html: `<div style="background:#ce93d8;color:#111;width:22px;height:22px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;font-family:monospace">H</div>`,
        iconSize: [22, 22], iconAnchor: [11, 11], className: '',
      }),
    }).bindPopup(`<strong>${name}</strong><br>Helipad &mdash; ${h.distance_miles} mi`).addTo(infraLayer);

    html += `<li class="receptor-item">
      <span class="receptor-badge" style="color:#ce93d8;border:1px solid #ce93d8">HELI</span>
      <span class="receptor-name">${name}</span>
      <span class="receptor-dist">${h.distance_miles} mi</span>
    </li>`;
  });

  html += `</ul>
    <p style="font-size:0.63rem;color:var(--color-text-muted);margin:4px 0 0">
      Verify LZ dimensions and surface suitability before use.
    </p>`;

  el.innerHTML = html;
}
