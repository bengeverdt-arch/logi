// ============================================================
// app.js — bootstrapper
// ============================================================

import { initPlan, updateUnitFields } from './modules/plan.js';
import { initMap, getReceptorLayer, getWaterLayer } from './modules/map.js';
import { initWeather }                from './modules/weather.js';
import { initReceptors }              from './modules/receptors.js';
import { initWaterSources }           from './modules/watersources.js';
import { initLandStatus }             from './modules/landstatus.js';
import { initDiag }                   from './modules/diag.js';

document.addEventListener('DOMContentLoaded', () => {
  initPlan();
  initDiag();

  initMap({
    onUnitDrawn: (unit) => {
      if (!unit) {
        // Unit deleted — reset data sections
        ['landstatus-body', 'conditions-body', 'forecast-body', 'receptors-body'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = '<p class="plan-pending">Draw a burn unit to load.</p>';
        });
        const fWater = document.getElementById('f-water');
        if (fWater) fWater.innerHTML = '<p class="plan-pending">Draw a burn unit to load.</p>';
        document.getElementById('f-acres')?.classList.add('pending');
        document.getElementById('f-coords')?.classList.add('pending');
        document.getElementById('f-location')?.classList.add('pending');
        getReceptorLayer().clearLayers();
        getWaterLayer().clearLayers();
        return;
      }
      updateUnitFields(unit);
      initLandStatus(unit);
      initWeather(unit);
      initReceptors(unit, getReceptorLayer());
      initWaterSources(unit, getWaterLayer());
    },
  });
});
