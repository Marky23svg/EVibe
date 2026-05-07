import axios from 'axios';

const OCM_KEY = process.env.EXPO_PUBLIC_OCM_KEY!;
const BASE = 'https://api.openchargemap.io/v3/poi';

let stationCache: { [key: string]: { data: any, timestamp: number } } = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const fetchStations = async (latitude: number, longitude: number, distance = 10) => {
  // Use 2 decimal places for cache key (~1km precision)
  const cacheKey = `${latitude.toFixed(2)}-${longitude.toFixed(2)}-${distance}`;
  const now = Date.now();

  if (stationCache[cacheKey] && (now - stationCache[cacheKey].timestamp < CACHE_DURATION)) {
    return stationCache[cacheKey].data;
  }

  const res = await axios.get(BASE, {
    params: {
      key: OCM_KEY,
      latitude,
      longitude,
      distance,
      distanceunit: 'km',
      maxresults: 15,
      compact: true,
      verbose: false,
      output: 'json',
    },
  });

  const mapped = res.data.map((s: any) => ({
    id: String(s.ID),
    name: s.AddressInfo?.Title || 'Unknown Station',
    address: s.AddressInfo?.AddressLine1 || '',
    distance: `${s.AddressInfo?.Distance?.toFixed(1) ?? '?'} km`,
    type: s.Connections?.[0]?.ConnectionType?.Title || 'Unknown',
    power: s.Connections?.[0]?.PowerKW ? `${s.Connections[0].PowerKW} kW` : 'N/A',
    cost: s.UsageCost || 'Free',
    time: s.Connections?.[0]?.PowerKW ? `${Math.round(30000 / s.Connections[0].PowerKW)} min` : 'N/A',
    connectors: s.Connections?.map((c: any) => c.ConnectionType?.Title || 'Unknown').filter(Boolean) || [],
    available: s.StatusType?.IsOperational ? 1 : 0,
    total: s.Connections?.length || 1,
    coordinate: {
      latitude: s.AddressInfo?.Latitude,
      longitude: s.AddressInfo?.Longitude,
    },
  }));

  stationCache[cacheKey] = { data: mapped, timestamp: now };
  return mapped;
};
