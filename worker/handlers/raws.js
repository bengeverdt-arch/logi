// ============================================================
// raws.js — nearest RAWS current conditions (replaces Synoptic)
// Source: NIFC "Public View — Interagency Remote Automatic Weather
// Stations (RAWS)", NIFC_Authoritative on ArcGIS Online. National,
// no key, latest observation per station (updates through the day).
// Values arrive as display strings ("65 deg. F", "19.9 (unk)",
// "NO DATA") and are parsed to numbers here. Latest ob only — no
// history; MesoWest/NOAA links are passed through for that.
// Verified 2026-09-23 at Lexington KY, Bozeman MT, Gainesville FL,
// Bend OR — all returned obs < 2 h old.
// ============================================================

import { jsonResponse } from '../cors.js';
import { queryArcGIS } from './arcgis.js';

const RAWS_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/PublicView_RAWS/FeatureServer/1/query';

const RADIUS_MILES = 75;
// An ob older than this isn't "current conditions" — skip the station.
const MAX_AGE_HOURS = 6;

function haversine(lat1, lng1, lat2, lng2) {
  const R    = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
             * Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

// "65 deg. F" → 65, "19.9 (unk)" → 19.9, "NO DATA" / null → null
function num(v) {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export async function handleRAWS(request, env, url) {
  const lat = parseFloat(url.searchParams.get('lat'));
  const lng = parseFloat(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: 'Missing lat or lng.' }, 400);
  }

  let data;
  try {
    data = await queryArcGIS(RAWS_URL, {
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      distance: String(RADIUS_MILES),
      units: 'esriSRUnit_StatuteMile',
      spatialRel: 'esriSpatialRelIntersects',
      where: "Status = 'A'",
      outFields: 'StationName,WXID,NWSID,ObservedDate,Elevation,Agency,State,WindSpeedMPH,WindDirDegrees,WindSpeedPeak,AirTempStandPlace,RelativeHumidity,FuelMoisture,MesoWestURL',
      returnGeometry: 'true',
      outSR: '4326',
    }, 'NIFC RAWS');
  } catch (err) {
    return jsonResponse({ error: err.message }, 502);
  }

  const now = Date.now();
  const stations = (data.features || [])
    .filter(f => f.geometry && f.attributes.ObservedDate)
    .map(f => {
      const a = f.attributes;
      return {
        station: {
          // NWSID is the station ID FEMS and NWS fire weather use (e.g. 150703)
          stid:           a.NWSID || a.WXID || null,
          name:           a.StationName,
          lat:            f.geometry.y,
          lng:            f.geometry.x,
          elevation_ft:   num(a.Elevation),
          distance_miles: haversine(lat, lng, f.geometry.y, f.geometry.x),
          agency:         a.Agency || null,
          history_url:    a.MesoWestURL || null,
        },
        latest: {
          date_time:         new Date(a.ObservedDate).toISOString(),
          fuel_moisture:     num(a.FuelMoisture),
          air_temp:          num(a.AirTempStandPlace),
          relative_humidity: num(a.RelativeHumidity),
          wind_speed:        num(a.WindSpeedMPH),
          wind_gust:         num(a.WindSpeedPeak),
          wind_direction:    num(a.WindDirDegrees),
        },
        age_hours: (now - a.ObservedDate) / 3_600_000,
      };
    })
    .filter(s => s.age_hours <= MAX_AGE_HOURS)
    .sort((a, b) => a.station.distance_miles - b.station.distance_miles);

  if (!stations.length) {
    return jsonResponse({ error: `No RAWS station reporting within ${RADIUS_MILES} mi in the last ${MAX_AGE_HOURS} h.` }, 404);
  }

  // Weather from the nearest reporting station. Not every RAWS has a
  // working fuel stick — if the nearest doesn't, take 10-hr FM from the
  // nearest one that does and say which station it came from.
  const nearest = stations[0];
  const fmStation = stations.find(s => s.latest.fuel_moisture != null) || null;
  const latest = { ...nearest.latest };
  let fuel_moisture_station = null;
  if (latest.fuel_moisture == null && fmStation) {
    latest.fuel_moisture = fmStation.latest.fuel_moisture;
    fuel_moisture_station = {
      name: fmStation.station.name,
      distance_miles: fmStation.station.distance_miles,
      date_time: fmStation.latest.date_time,
    };
  }

  return jsonResponse({
    station: nearest.station,
    latest,
    fuel_moisture_station,
    source: 'NIFC Interagency RAWS (public view)',
  });
}
