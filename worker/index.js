import { jsonResponse, corsPreflightResponse } from './cors.js';
import { handleSynoptic }    from './handlers/synoptic.js';
import { handleNWS }         from './handlers/nws.js';
import { handleOSM }         from './handlers/osm.js';
import { handleLandStatus }  from './handlers/landstatus.js';

export default {
  async fetch(request, env) {
    const url      = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return corsPreflightResponse();
    }

    try {
      if (pathname.startsWith('/api/synoptic'))    return handleSynoptic(request, env, url);
      if (pathname.startsWith('/api/nws'))         return handleNWS(request, env, url);
      if (pathname.startsWith('/api/osm'))         return handleOSM(request, env, url);
      if (pathname.startsWith('/api/landstatus'))  return handleLandStatus(request, env, url);

      return jsonResponse({ error: 'Not found.' }, 404);

    } catch (err) {
      console.error(err);
      return jsonResponse({ error: 'Internal server error.' }, 500);
    }
  },
};
