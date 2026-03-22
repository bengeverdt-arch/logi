// ============================================================
// map.js — Leaflet map with ESRI World Imagery + topo toggle
// Leaflet, Leaflet.draw, Turf loaded as globals via CDN
// ============================================================

let map, drawnItems, receptorLayer;
let _onUnitDrawn;

const IMAGERY_LAYER = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Imagery &copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics', maxZoom: 19 }
);

const TOPO_OVERLAY = L.tileLayer(
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'USGS Topo', maxZoom: 16, opacity: 0.55 }
);

export function initMap({ onUnitDrawn }) {
  _onUnitDrawn = onUnitDrawn;

  map = L.map('map', { preferCanvas: false }).setView([37.5, -85.0], 8);

  IMAGERY_LAYER.addTo(map);

  drawnItems    = new L.FeatureGroup().addTo(map);
  receptorLayer = new L.LayerGroup().addTo(map);

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

export function getReceptorLayer() { return receptorLayer; }

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

let topoActive = false;

function buildLayerToggle() {
  const div = L.DomUtil.create('div', '');
  div.id = 'layer-toggle';
  div.innerHTML = `
    <button class="layer-btn active" id="btn-imagery">Imagery</button>
    <button class="layer-btn" id="btn-topo">+ Topo</button>
  `;
  document.getElementById('map').appendChild(div);

  L.DomEvent.disableClickPropagation(div);

  document.getElementById('btn-topo').addEventListener('click', () => {
    topoActive = !topoActive;
    if (topoActive) {
      TOPO_OVERLAY.addTo(map);
      document.getElementById('btn-topo').classList.add('active');
    } else {
      map.removeLayer(TOPO_OVERLAY);
      document.getElementById('btn-topo').classList.remove('active');
    }
  });
}
