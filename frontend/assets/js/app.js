// ============================================================
// app.js — bootstrapper and module loader
// Initializes modules once the DOM is ready.
// ============================================================

import { initMap }       from './modules/map.js';
import { initWeather }   from './modules/weather.js';
import { initReceptors } from './modules/receptors.js';

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  // Weather and receptors are initialized after a burn unit is drawn.
  // map.js will call initWeather(centroid) and initReceptors(boundary)
  // once the user completes a polygon.
});
