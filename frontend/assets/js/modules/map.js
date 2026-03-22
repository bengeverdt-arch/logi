// ============================================================
// map.js — Leaflet map, burn unit drawing, acreage + centroid
// Leaflet, Leaflet.draw, and Turf loaded as globals via CDN
// ============================================================

let map, drawnItems, receptorLayer;
let _onUnitDrawn;

export function initMap({ onUnitDrawn }) {
  _onUnitDrawn = onUnitDrawn;

  map = L.map('map', { preferCanvas: false }).setView([37.5, -85.0], 8);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  drawnItems  = new L.FeatureGroup().addTo(map);
  receptorLayer = new L.LayerGroup().addTo(map);

  const drawControl = new L.Control.Draw({
    edit: {
      featureGroup: drawnItems,
      remove: true,
    },
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: {
          color:       '#d4500a',
          weight:      2,
          fillColor:   '#d4500a',
          fillOpacity: 0.12,
        },
      },
      polyline:     false,
      rectangle:    false,
      circle:       false,
      circlemarker: false,
      marker:       false,
    },
  });

  map.addControl(drawControl);

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
    _onUnitDrawn(null);
  });
}

export function getReceptorLayer() {
  return receptorLayer;
}

function processUnit(layer) {
  const geojson  = layer.toGeoJSON();
  const centroid = turf.centroid(geojson);
  const [lng, lat] = centroid.geometry.coordinates;
  const acres    = (turf.area(geojson) / 4046.856).toFixed(1);

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
    <div class="unit-stat">
      <span class="unit-label">Acres</span>
      <span class="unit-value">${acres}</span>
    </div>
    <div class="unit-stat">
      <span class="unit-label">Centroid Lat</span>
      <span class="unit-value">${parseFloat(lat).toFixed(5)}</span>
    </div>
    <div class="unit-stat">
      <span class="unit-label">Centroid Lng</span>
      <span class="unit-value">${parseFloat(lng).toFixed(5)}</span>
    </div>
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
