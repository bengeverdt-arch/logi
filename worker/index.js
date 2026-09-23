import { jsonResponse, corsPreflightResponse } from './cors.js';
import { handleNWS }         from './handlers/nws.js';
import { handleOSM }         from './handlers/osm.js';
import { handleLandStatus }  from './handlers/landstatus.js';
import { handleGeocode }     from './handlers/geocode.js';
import { handleElevation }   from './handlers/elevation.js';
import { handleFireDistrict } from './handlers/firedistrict.js';
import { handleState }       from './handlers/state.js';
import { handleAirNow }      from './handlers/airnow.js';
import { handleRAWS }        from './handlers/raws.js';
import { handleHospitals }   from './handlers/hospitals.js';

export default {
  async fetch(request, env) {
    const url      = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return corsPreflightResponse();
    }

    try {
      if (pathname.startsWith('/api/raws'))        return handleRAWS(request, env, url);
      if (pathname.startsWith('/api/hospitals'))   return handleHospitals(request, env, url);
      if (pathname.startsWith('/api/nws'))         return handleNWS(request, env, url);
      if (pathname.startsWith('/api/osm'))         return handleOSM(request, env, url);
      if (pathname.startsWith('/api/landstatus'))  return handleLandStatus(request, env, url);
      if (pathname.startsWith('/api/geocode'))     return handleGeocode(request, env, url);
      if (pathname.startsWith('/api/elevation'))   return handleElevation(request, env, url);
      if (pathname.startsWith('/api/firedistrict')) return handleFireDistrict(request, env, url);
      if (pathname.startsWith('/api/state'))       return handleState(request, env, url);
      if (pathname.startsWith('/api/aqmonitors'))  return handleAirNow(request, env, url);

      return jsonResponse({ error: 'Not found.' }, 404);

    } catch (err) {
      console.error(err);
      return jsonResponse({ error: 'Internal server error.' }, 500);
    }
  },
};
