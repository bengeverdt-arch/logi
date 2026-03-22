// ============================================================
// app.js — bootstrapper, wires modules together
// ============================================================

import { initMap, getReceptorLayer } from './modules/map.js';
import { initWeather }               from './modules/weather.js';
import { initReceptors }             from './modules/receptors.js';

document.addEventListener('DOMContentLoaded', () => {
  initMap({
    onUnitDrawn: (unit) => {
      if (!unit) {
        resetPanel('weather-panel',   'Draw a burn unit to load weather data.');
        resetPanel('receptors-panel', 'Draw a burn unit to identify receptors.');
        return;
      }
      initWeather(unit);
      initReceptors(unit, getReceptorLayer());
    },
  });
});

function resetPanel(id, msg) {
  const body = document.querySelector(`#${id} .panel-body`);
  if (body) body.innerHTML = `<p class="panel-empty">${msg}</p>`;
}
