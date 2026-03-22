// ============================================================
// receptors.js — receptor scan → plan section + map markers
// Leaflet loaded as global via CDN
// ============================================================

import { WORKER_URL } from '../config.js';
import { diagSet } from './diag.js';

const TYPE_LABEL = {
  school: 'School', medical: 'Medical', care_facility: 'Care Facility',
  residential: 'Residential', road: 'Road', other: 'Other',
};

const TYPE_COLOR = {
  school: '#ef9a9a', medical: '#ef9a9a', care_facility: '#ffcc80',
  residential: '#fff176', road: '#888888', other: '#888888',
};

export async function initReceptors({ lat, lng }, receptorLayer) {
  const el = document.getElementById('receptors-body');
  if (el) el.innerHTML = '<p class="plan-loading">Scanning for receptors</p>';
  receptorLayer.clearLayers();

  const url = `${WORKER_URL}/api/osm/receptors?lat=${lat}&lng=${lng}`;
  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
    diagSet('osm_receptors', { url, status: res.status, data });
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  } catch (err) {
    diagSet('osm_receptors', { url, error: err.message, data: data ?? null });
    if (el) el.innerHTML = `<p class="plan-error">Receptor scan failed: ${err.message}</p>`;
    return;
  }

  const { receptors, query_radius_m } = data;
  const radiusMi = (query_radius_m / 1609.34).toFixed(1);

  el.innerHTML = '';

  el.insertAdjacentHTML('beforeend', `
    <p class="receptors-disclaimer">
      Receptor data sourced from OpenStreetMap. Field verification recommended.
      Do not rely solely on this tool for smoke management planning.
    </p>`);

  if (!receptors.length) {
    el.insertAdjacentHTML('beforeend',
      `<p class="plan-ok">No sensitive receptors found within ${radiusMi} mile radius.</p>`);
    return;
  }

  el.insertAdjacentHTML('beforeend',
    `<p style="font-size:0.68rem;color:var(--color-text-muted);margin-bottom:8px">
      ${receptors.length} features within ${radiusMi} mi &mdash; sorted by distance
    </p>`);

  const ul = document.createElement('ul');
  ul.className = 'receptor-list';

  receptors.forEach(r => {
    if (r.type !== 'road' && r.type !== 'residential') {
      const color  = TYPE_COLOR[r.type] || '#888';
      const letter = (TYPE_LABEL[r.type] || 'O')[0];
      L.divIcon && L.marker([r.lat, r.lng], {
        icon: L.divIcon({
          html: `<div style="background:${color};color:#111;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;font-family:monospace">${letter}</div>`,
          iconSize: [20, 20], iconAnchor: [10, 10], className: '',
        }),
      }).bindPopup(`<strong>${r.name || 'Unnamed'}</strong><br>${TYPE_LABEL[r.type]}`).addTo(receptorLayer);
    }

    const badgeClass = r.type === 'care_facility' ? 'care' : r.type;
    const li = document.createElement('li');
    li.className = 'receptor-item';
    li.innerHTML = `
      <span class="receptor-badge ${badgeClass}">${TYPE_LABEL[r.type] || r.type}</span>
      <span class="receptor-name${r.name ? '' : ' unnamed'}">${r.name || 'unnamed'}</span>
      <span class="receptor-dist">${r.distance_miles} mi</span>
    `;
    ul.appendChild(li);
  });

  el.appendChild(ul);

  // Smoke management notes field
  el.insertAdjacentHTML('beforeend', `
    <div style="margin-top:12px;display:grid;grid-template-columns:140px 1fr;align-items:start;gap:6px">
      <span class="field-label" style="padding-top:4px">Smoke Mgmt Notes</span>
      <textarea class="field-textarea" placeholder="Downwind communities, smoke dispersal notes, airshed considerations..."></textarea>
    </div>`);
}
