// ============================================================
// watersources.js — water source scan → Resources section + map markers
// Leaflet loaded as global via CDN
// ============================================================

import { WORKER_URL } from '../config.js';
import { DIAG } from './diag.js';

const TYPE_LABEL = {
  pond:      'Pond',
  lake:      'Lake',
  reservoir: 'Reservoir',
  river:     'River',
  stream:    'Stream',
  canal:     'Canal',
  ditch:     'Ditch',
  tank:      'Tank',
  hydrant:   'Hydrant',
  water:     'Water',
};

const TYPE_COLOR = {
  pond:      '#4fc3f7',
  lake:      '#29b6f6',
  reservoir: '#0288d1',
  river:     '#4dd0e1',
  stream:    '#80deea',
  canal:     '#80deea',
  ditch:     '#b0bec5',
  tank:      '#a5d6a7',
  hydrant:   '#ffb74d',
  water:     '#4fc3f7',
};

export async function initWaterSources({ lat, lng }, waterLayer) {
  const el = document.getElementById('f-water');
  if (el) el.innerHTML = '<p class="plan-loading">Scanning for water sources</p>';
  waterLayer.clearLayers();

  const url = `${WORKER_URL}/api/osm/watersources?lat=${lat}&lng=${lng}`;
  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
    if (!res.ok || data.error) {
      DIAG.err('OSM Water', data.error || `HTTP ${res.status}`, url);
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    DIAG.ok('OSM Water', `${data.sources?.length ?? 0} sources found`);
  } catch (err) {
    if (!data) DIAG.err('OSM Water', err.message, url);
    if (el) el.innerHTML = `<p class="plan-error">Water source scan failed: ${err.message}</p>`;
    return;
  }

  const { sources, query_radius_m } = data;
  const radiusMi = (query_radius_m / 1609.34).toFixed(1);

  el.innerHTML = '';

  if (!sources.length) {
    el.innerHTML = `<p class="plan-ok" style="margin:0">No water sources found within ${radiusMi} mi radius. Verify locally.</p>`;
    return;
  }

  el.insertAdjacentHTML('beforeend', `
    <p style="font-size:0.68rem;color:var(--color-text-muted);margin:0 0 6px">
      ${sources.length} sources within ${radiusMi} mi &mdash; sorted by distance
    </p>`);

  const ul = document.createElement('ul');
  ul.className = 'receptor-list';

  sources.forEach(s => {
    const color  = TYPE_COLOR[s.type] || '#4fc3f7';
    const letter = (TYPE_LABEL[s.type] || 'W')[0];

    L.marker([s.lat, s.lng], {
      icon: L.divIcon({
        html: `<div style="background:${color};color:#111;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;font-family:monospace">${letter}</div>`,
        iconSize: [20, 20], iconAnchor: [10, 10], className: '',
      }),
    }).bindPopup(`<strong>${s.name || 'Unnamed'}</strong><br>${TYPE_LABEL[s.type] || s.type}`).addTo(waterLayer);

    const li = document.createElement('li');
    li.className = 'receptor-item';
    li.innerHTML = `
      <span class="receptor-badge" style="background:${color};color:#111">${TYPE_LABEL[s.type] || s.type}</span>
      <span class="receptor-name${s.name ? '' : ' unnamed'}">${s.name || 'unnamed'}</span>
      <span class="receptor-dist">${s.distance_miles} mi</span>
    `;
    ul.appendChild(li);
  });

  el.appendChild(ul);

  el.insertAdjacentHTML('beforeend', `
    <p style="font-size:0.65rem;color:var(--color-text-muted);margin-top:6px;margin-bottom:0">
      Source: OpenStreetMap. Verify access, capacity, and ownership before ignition.
    </p>`);
}
