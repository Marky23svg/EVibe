import axios from 'axios';

const ORS_KEY = process.env.EXPO_PUBLIC_ORS_KEY!;
const BASE = 'https://api.openrouteservice.org/v2';

const orsClient = axios.create();

let routeCache: { [key: string]: { data: any, timestamp: number } } = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export const getRoute = async (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  profile: string = 'driving-car'
) => {
  const cacheKey = `${from.latitude},${from.longitude}-${to.latitude},${to.longitude}-${profile}`;
  const now = Date.now();
  if (routeCache[cacheKey] && (now - routeCache[cacheKey].timestamp < CACHE_TTL)) {
    return routeCache[cacheKey].data;
  }
  const res = await orsClient.post(
    `${BASE}/directions/${profile}/geojson`,
    {
      coordinates: [
        [from.longitude, from.latitude],
        [to.longitude, to.latitude],
      ],
    },
    { headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' } }
  );

  const coords = res.data.features[0].geometry.coordinates;
  const summary = res.data.features[0].properties.summary;

  const result = {
    coordinates: coords.map(([lng, lat]: [number, number]) => ({ latitude: lat, longitude: lng })),
    distanceKm: (summary.distance / 1000).toFixed(1),
    durationMin: Math.round(summary.duration / 60),
  };

  routeCache[cacheKey] = { data: result, timestamp: now };
  return result;
};

export const geocode = async (address: string) => {
  const res = await orsClient.get('https://api.openrouteservice.org/geocode/search', {
    params: {
      api_key: ORS_KEY,
      text: address,
      size: 1,
      'boundary.rect.min_lon': 116.928,
      'boundary.rect.min_lat': 4.587,
      'boundary.rect.max_lon': 126.604,
      'boundary.rect.max_lat': 21.321,
    },
    headers: { 'Accept': 'application/json' },
  });
  const feature = res.data.features[0];
  if (!feature) throw new Error('Address not found');
  const [lng, lat] = feature.geometry.coordinates;
  return { latitude: lat, longitude: lng, label: feature.properties.label };
};

export const reverseGeocode = async (latitude: number, longitude: number) => {
  const res = await orsClient.get('https://api.openrouteservice.org/geocode/reverse', {
    params: {
      api_key: ORS_KEY,
      'point.lat': latitude,
      'point.lon': longitude,
      size: 1,
    },
    headers: { 'Accept': 'application/json' },
  });
  const feature = res.data.features[0];
  if (!feature) throw new Error('Location not found');
  return feature.properties.label;
};

let autoCompleteCache: { [key: string]: { data: any, timestamp: number } } = {};
const AC_TTL = 5 * 60 * 1000; // 5 minutes

export const autoComplete = async (text: string, lat?: number, lng?: number) => {
  const cacheKey = `${text}-${lat?.toFixed(3)}-${lng?.toFixed(3)}`;
  const now = Date.now();
  if (autoCompleteCache[cacheKey] && (now - autoCompleteCache[cacheKey].timestamp < AC_TTL)) {
    return autoCompleteCache[cacheKey].data;
  }

  const res = await orsClient.get('https://api.openrouteservice.org/geocode/autocomplete', {
    params: {
      api_key: ORS_KEY,
      text,
      size: 5,
      'boundary.rect.min_lon': 116.928,
      'boundary.rect.min_lat': 4.587,
      'boundary.rect.max_lon': 126.604,
      'boundary.rect.max_lat': 21.321,
      ...(lat && lng ? { 'focus.point.lat': lat, 'focus.point.lon': lng } : { 'focus.point.lat': 12.8797, 'focus.point.lon': 121.7740 }),
    },
    headers: { 'Accept': 'application/json' },
  });
  const PH_BOUNDS = { minLat: 4.587, maxLat: 21.321, minLon: 116.928, maxLon: 126.604 };
  const isInPH = (lat: number, lon: number) =>
    lat >= PH_BOUNDS.minLat && lat <= PH_BOUNDS.maxLat &&
    lon >= PH_BOUNDS.minLon && lon <= PH_BOUNDS.maxLon;

  const results = res.data.features
    .map((f: any) => ({
      label: f.properties.label,
      latitude: f.geometry.coordinates[1],
      longitude: f.geometry.coordinates[0],
    }))
    .filter((f: any) => isInPH(f.latitude, f.longitude));

  autoCompleteCache[cacheKey] = { data: results, timestamp: now };
  return results;
};
