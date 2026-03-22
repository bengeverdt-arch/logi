// ============================================================
// receptors.js — sensitive receptor identification and map display
// Leaflet is loaded as a global via CDN
// ============================================================

import { WORKER_URL } from '../config.js';

const TYPE_LABEL = {
  school:      'School',
  medical:     'Medical',
  care_facility: 'Care Facility',
  residential: 'Residential',
  road:        'Road',
  other:       'Other',
};

// Colors for map markers (matching badge colors in receptors.css)
const TYPE_COLOR = {
  school:        '#ef9a9a',
  medical:       '#ef9a9a',
  care_facility: '#ffcc80',
  residential:   '#fff176',
  road:          '#888888',
  other:         '#888888',
};

export async function initReceptors({ lat, lng }, receptorLayer) {
  const body = document.querySelector('#receptors-panel .panel-body');
  body.innerHTML = '<p class="panel-loading">Scanning for sensitive receptors</p>';
  receptorLayer.clearLayers();

  let data;
  try {
    const res = await fetch(`${WORKER_URL}/api/osm/receptors?lat=${lat}&lng=${lng}`);
    data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  } catch (err) {
    body.innerHTML = `<p class="panel-error">Receptor scan failed: ${err.message}</p>`;
    return;
  }

  const { receptors, query_radius_m } = data;
  const radiusMi = (query_radius_m / 1609.34).toFixed(1);

  body.innerHTML = '';

  // Disclaimer — always shown
  const disc = document.createElement('p');
  disc.className = 'receptors-disclaimer';
  disc.textContent =
    'Receptor data sourced from OpenStreetMap. Field verification recommended. ' +
    'Do not rely solely on this tool for smoke management planning.';
  body.appendChild(disc);

  if (!receptors.length) {
    const p = document.createElement('p');
    p.className = 'receptors-none';
    p.textContent = `No sensitive receptors found within ${radiusMi} mile radius.`;
    body.appendChild(p);
    return;
  }

  const count = document.createElement('p');
  count.className = 'receptors-count';
  count.textContent = `${receptors.length} features within ${radiusMi} mi — sorted by distance`;
  body.appendChild(count);

  const ul = document.createElement('ul');
  ul.className = 'receptor-list';

  receptors.forEach(r => {
    // Map marker for point features (skip area/linear features)
    if (r.type !== 'road' && r.type !== 'residential') {
      const color  = TYPE_COLOR[r.type] || '#888';
      const letter = (TYPE_LABEL[r.type] || 'O')[0];
      const icon   = L.divIcon({
        html: `<div style="background:${color};color:#111;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;font-family:monospace;">${letter}</div>`,
        iconSize:   [22, 22],
        iconAnchor: [11, 11],
        className:  '',
      });
      L.marker([r.lat, r.lng], { icon })
        .bindPopup(`<strong>${r.name || 'Unnamed'}</strong><br>${TYPE_LABEL[r.type] || r.type}`)
        .addTo(receptorLayer);
    }

    // List item
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

  body.appendChild(ul);
}
