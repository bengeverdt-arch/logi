// ============================================================
// map.js — Leaflet map with ESRI World Imagery + overlays + search
// Leaflet, Leaflet.draw, Turf loaded as globals via CDN
// ============================================================

import { WORKER_URL } from '../config.js';
import { DIAG } from './diag.js';

let map, drawnItems, receptorLayer, waterLayer, infraLayer;
let _onUnitDrawn;

const IMAGERY_LAYER = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Imagery &copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics', maxZoom: 19 }
);

// Roads, city names, and boundaries — designed to overlay on World Imagery
const LABELS_OVERLAY = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Labels &copy; Esri', maxZoom: 19, pane: 'shadowPane' }
);

const TOPO_LAYER = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Topo &copy; Esri, USGS, NOAA', maxZoom: 19 }
);

export function initMap({ onUnitDrawn }) {
  _onUnitDrawn = onUnitDrawn;

  map = L.map('map', { preferCanvas: false }).setView([37.5, -85.0], 8);

  IMAGERY_LAYER.addTo(map);

  drawnItems    = new L.FeatureGroup().addTo(map);
  receptorLayer = new L.LayerGroup().addTo(map);
  waterLayer    = new L.LayerGroup().addTo(map);
  infraLayer    = new L.LayerGroup().addTo(map);

  const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems, remove: true },
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: {
          color: '#ff6600', weight: 2.5,
          fillColor: '#ff6600', fillOpacity: 0.15,
        },
      },
      polyline: false, rectangle: false,
      circle: false, circlemarker: false, marker: false,
    },
  });

  map.addControl(drawControl);
  buildLayerToggle();
  buildSearch();

  map.on(L.Draw.Event.CREATED, (e) => {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    processUnit(e.layer);
  });

  map.on(L.Draw.Event.EDITED, (e) => {
    e.layers.eachLayer(layer => processUnit(layer));
  });

  map.on(L.Draw.Event.DELETED, () => {
    hideUnitBar();
    receptorLayer.clearLayers();
    waterLayer.clearLayers();
    infraLayer.clearLayers();
    _onUnitDrawn(null);
  });
}

export function getReceptorLayer() { return receptorLayer; }
export function getWaterLayer()    { return waterLayer; }
export function getInfraLayer()    { return infraLayer; }

function processUnit(layer) {
  const geojson        = layer.toGeoJSON();
  const centroid       = turf.centroid(geojson);
  const [lng, lat]     = centroid.geometry.coordinates;
  const acres          = (turf.area(geojson) / 4046.856).toFixed(1);

  showUnitBar({ lat, lng, acres });
  hideMapHint();

  _onUnitDrawn({
    lat:    parseFloat(lat.toFixed(6)),
    lng:    parseFloat(lng.toFixed(6)),
    acres,
    geojson,
  });
}

function showUnitBar({ lat, lng, acres }) {
  const bar = document.getElementById('unit-bar');
  bar.innerHTML = `
    <div class="unit-stat"><span class="unit-label">Acres</span><span class="unit-value">${acres}</span></div>
    <div class="unit-stat"><span class="unit-label">Lat</span><span class="unit-value">${parseFloat(lat).toFixed(5)}</span></div>
    <div class="unit-stat"><span class="unit-label">Lng</span><span class="unit-value">${parseFloat(lng).toFixed(5)}</span></div>
  `;
  bar.classList.add('active');
}

function hideUnitBar() {
  const bar = document.getElementById('unit-bar');
  bar.innerHTML = '';
  bar.classList.remove('active');
}

function hideMapHint() {
  document.getElementById('map-hint')?.classList.add('hidden');
}

let topoActive   = false;
let labelsActive = false;

function buildLayerToggle() {
  const div = L.DomUtil.create('div', '');
  div.id = 'layer-toggle';
  div.innerHTML = `
    <button class="layer-btn active" id="btn-imagery">Imagery</button>
    <button class="layer-btn" id="btn-labels">+ Labels</button>
    <button class="layer-btn" id="btn-topo">Topo</button>
  `;
  document.getElementById('map').appendChild(div);

  L.DomEvent.disableClickPropagation(div);

  document.getElementById('btn-labels').addEventListener('click', () => {
    labelsActive = !labelsActive;
    if (labelsActive) {
      LABELS_OVERLAY.addTo(map);
      document.getElementById('btn-labels').classList.add('active');
    } else {
      map.removeLayer(LABELS_OVERLAY);
      document.getElementById('btn-labels').classList.remove('active');
    }
  });

  document.getElementById('btn-topo').addEventListener('click', () => {
    topoActive = !topoActive;
    if (topoActive) {
      map.removeLayer(IMAGERY_LAYER);
      if (labelsActive) map.removeLayer(LABELS_OVERLAY);
      TOPO_LAYER.addTo(map);
      if (labelsActive) LABELS_OVERLAY.addTo(map);
      document.getElementById('btn-topo').classList.add('active');
      document.getElementById('btn-imagery').classList.remove('active');
      DIAG.info('MAP', 'Base layer: Topo');
    } else {
      map.removeLayer(TOPO_LAYER);
      IMAGERY_LAYER.addTo(map);
      if (labelsActive) LABELS_OVERLAY.addTo(map);
      document.getElementById('btn-topo').classList.remove('active');
      document.getElementById('btn-imagery').classList.add('active');
      DIAG.info('MAP', 'Base layer: Imagery');
    }
  });
}

function buildSearch() {
  const input  = document.getElementById('search-input');
  const btn    = document.getElementById('search-btn');
  const status = document.getElementById('search-status');
  if (!input || !btn) return;

  async function doSearch() {
    const q = input.value.trim();
    if (!q) return;

    // Accept raw lat,lng input — skip geocoder
    const coordMatch = q.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      map.setView([lat, lng], 13);
      status.textContent = '';
      return;
    }

    btn.textContent    = '...';
    btn.disabled       = true;
    status.textContent = '';

    try {
      const res  = await fetch(`${WORKER_URL}/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      map.setView([data.lat, data.lng], 13);
      status.textContent = '';
    } catch (err) {
      status.textContent = err.message || 'Not found.';
    } finally {
      btn.textContent  = 'GO';
      btn.disabled     = false;
    }
  }

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
}
