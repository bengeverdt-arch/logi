// ============================================================
// app.js — bootstrapper
// ============================================================

import { initPlan, updateUnitFields, showStateAddOns } from './modules/plan.js';
import { initMap, getReceptorLayer, getWaterLayer, getInfraLayer } from './modules/map.js';
import { initWeather }                from './modules/weather.js';
import { initReceptors }              from './modules/receptors.js';
import { initAQMonitors }             from './modules/aqmonitors.js';
import { initWaterSources }           from './modules/watersources.js';
import { initInfrastructure }         from './modules/infrastructure.js';
import { initFireDept }               from './modules/firedept.js';
import { initUnitState }              from './modules/unitstate.js';
import { initHospitals }              from './modules/hospitals.js';
import { initGoNoGo, runGoNoGo }      from './modules/gonogo.js';
import { initLandStatus }             from './modules/landstatus.js';
import { initSmokeIndex }             from './modules/smokeindex.js';
import { initDiag }                   from './modules/diag.js';
import { initLoading, startRun, track } from './modules/loading.js';

document.addEventListener('DOMContentLoaded', () => {
  initPlan();
  initGoNoGo();
  initSmokeIndex();
  initDiag();
  initLoading();

  initMap({
    onUnitDrawn: (unit) => {
      startRun();
      if (!unit) {
        // Unit deleted — reset data sections
        ['landstatus-body', 'conditions-body', 'forecast-body', 'receptors-body', 'aqmonitors-body'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = '<p class="plan-pending">Draw a burn unit to load.</p>';
        });
        const smokeVi = document.getElementById('smoke-vi-body');
        if (smokeVi) smokeVi.innerHTML = '';
        showStateAddOns(null);
        runGoNoGo();
        const fWater = document.getElementById('f-water');
        if (fWater) fWater.innerHTML = '<p class="plan-pending">Draw a burn unit to load.</p>';
        const fHelipads = document.getElementById('f-helipads');
        if (fHelipads) fHelipads.innerHTML = '<p class="plan-pending">Draw a burn unit to load.</p>';
        const fHospitals = document.getElementById('f-hospitals');
        if (fHospitals) fHospitals.innerHTML = '';
        const fPowerlines = document.getElementById('f-powerlines');
        if (fPowerlines) fPowerlines.innerHTML = '';
        document.getElementById('f-acres')?.classList.add('pending');
        document.getElementById('f-coords')?.classList.add('pending');
        document.getElementById('f-location')?.classList.add('pending');
        getReceptorLayer().clearLayers();
        getWaterLayer().clearLayers();
        getInfraLayer().clearLayers();
        return;
      }
      updateUnitFields(unit);
      track('Land status',                   initLandStatus(unit));
      track('Weather, RAWS & forecast',      initWeather(unit));
      track('Sensitive receptors',           initReceptors(unit, getReceptorLayer()));
      track('Air quality monitors',          initAQMonitors(unit));
      track('Water sources',                 initWaterSources(unit, getWaterLayer()));
      track('Power lines & helipads',        initInfrastructure(unit, getInfraLayer()));
      track('Fire department',               initFireDept(unit));
      track('State',                         initUnitState(unit));
      track('Hospitals',                     initHospitals(unit));
    },
  });
});
