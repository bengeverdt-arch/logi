// ============================================================
// watersources.js — water source scan → Resources section + map markers
// Grouped by type with collapse for large groups.
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

// Display order — natural bodies first, infrastructure last
const TYPE_ORDER = ['reservoir','pond','lake','river','stream','tank','canal','ditch','hydrant','water'];

// Groups with more than this many items get a "show all" toggle
const COLLAPSE_THRESHOLD = 4;

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

  // Group by type
  const grouped = {};
  sources.forEach(s => {
    if (!grouped[s.type]) grouped[s.type] = [];
    grouped[s.type].push(s);
  });

  el.insertAdjacentHTML('beforeend', `
    <p style="font-size:0.68rem;color:var(--color-text-muted);margin:0 0 8px">
      ${sources.length} sources within ${radiusMi} mi &mdash; sorted by distance
    </p>`);

  const orderedTypes = [
    ...TYPE_ORDER.filter(t => grouped[t]),
    ...Object.keys(grouped).filter(t => !TYPE_ORDER.includes(t)),
  ];

  orderedTypes.forEach(type => {
    const items  = grouped[type];
    const color  = TYPE_COLOR[type] || '#4fc3f7';
    const label  = TYPE_LABEL[type] || type;
    const letter = label[0];

    // Add map markers for ALL items (named and unnamed)
    items.forEach(s => {
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          html: `<div style="background:${color};color:#111;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;font-family:monospace">${letter}</div>`,
          iconSize: [20, 20], iconAnchor: [10, 10], className: '',
        }),
      }).bindPopup(`<strong>${s.name || 'Unnamed'}</strong><br>${label}`).addTo(waterLayer);
    });

    // List: named items only
    const named   = items.filter(s => s.name);
    const unnamed = items.filter(s => !s.name);
    const overflow = named.length > COLLAPSE_THRESHOLD;

    const groupDiv = document.createElement('div');
    groupDiv.className = 'water-group';

    // Group header
    const header = document.createElement('div');
    header.className = 'water-group-header';
    header.innerHTML = `
      <span class="receptor-badge" style="background:${color};color:#111;border:none">${label}</span>
      <span class="water-group-count">${items.length}</span>
      ${overflow ? `<button class="water-show-more" type="button">show all</button>` : ''}
    `;
    groupDiv.appendChild(header);

    // Named item list
    if (named.length) {
      const ul = document.createElement('ul');
      ul.className = 'receptor-list';

      named.forEach((s, i) => {
        const li = document.createElement('li');
        li.className = 'receptor-item';
        if (overflow && i >= COLLAPSE_THRESHOLD) li.classList.add('water-hidden');
        li.innerHTML = `
          <span class="receptor-name">${s.name}</span>
          <span class="receptor-dist">${s.distance_miles} mi</span>
        `;
        ul.appendChild(li);
      });

      groupDiv.appendChild(ul);

      // Wire show-all toggle
      if (overflow) {
        const btn    = header.querySelector('.water-show-more');
        const hiddenItems = ul.querySelectorAll('.water-hidden');
        btn.dataset.expanded = 'false';
        btn.addEventListener('click', () => {
          const willExpand = btn.dataset.expanded !== 'true';
          hiddenItems.forEach(li => li.classList.toggle('water-hidden', !willExpand));
          btn.dataset.expanded = willExpand ? 'true' : 'false';
          btn.textContent = willExpand ? 'show fewer' : 'show all';
        });
      }
    }

    // Unnamed count note (map only)
    if (unnamed.length) {
      const note = document.createElement('p');
      note.style.cssText = 'font-size:0.63rem;color:var(--color-text-muted);margin:2px 0 0;font-style:italic';
      note.textContent = `+${unnamed.length} unnamed — shown on map`;
      groupDiv.appendChild(note);
    }

    el.appendChild(groupDiv);
  });

  el.insertAdjacentHTML('beforeend', `
    <p style="font-size:0.65rem;color:var(--color-text-muted);margin-top:8px;margin-bottom:0">
      Source: OpenStreetMap. Verify access, capacity, and ownership before ignition.
    </p>`);
}
