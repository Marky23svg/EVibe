const { getNearbyStops } = require('../utils/nearbyStops');
const { getRouteByNumber, getRouteById } = require('../utils/routeLookup');
const { getStopsForRoute, getRoutesForStop } = require('../utils/routeStops');
const { searchRoutesByKeyword } = require('../utils/corridorSearch');
const { load, stopsById, shapeCoordsByRoute, isRouteAvailable } = require('../utils/gtfsLoader');

/** High-Fidelity Rail Overrides for inaccurate GTFS source lines */
const RAIL_OVERRIDES = {
  'ROUTE_880854': [ // MRT-3
    { lat: 14.6522, lon: 121.0323 }, { lat: 14.6500, lon: 121.0340 }, { lat: 14.6432, lon: 121.0385 },
    { lat: 14.6354, lon: 121.0432 }, { lat: 14.6236, lon: 121.0528 }, { lat: 14.6150, lon: 121.0550 },
    { lat: 14.6016, lon: 121.0578 }, { lat: 14.5950, lon: 121.0575 }, { lat: 14.5876, lon: 121.0567 },
    { lat: 14.5812, lon: 121.0534 }, { lat: 14.5734, lon: 121.0476 }, { lat: 14.5654, lon: 121.0456 },
    { lat: 14.5600, lon: 121.0400 }, { lat: 14.5543, lon: 121.0345 }, { lat: 14.5487, lon: 121.0278 },
    { lat: 14.5412, lon: 121.0198 }, { lat: 14.5385, lon: 121.0100 }, { lat: 14.5378, lon: 121.0012 }
  ],
  'ROUTE_880747': [ // LRT-1
    { lat: 14.6575, lon: 121.0220 }, { lat: 14.6576, lon: 121.0150 }, { lat: 14.6574, lon: 121.0040 },
    { lat: 14.6568, lon: 120.9900 }, { lat: 14.6561, lon: 120.9840 }, { lat: 14.6500, lon: 120.9838 },
    { lat: 14.6444, lon: 120.9835 }, { lat: 14.6360, lon: 120.9822 }, { lat: 14.6306, lon: 120.9822 },
    { lat: 14.6228, lon: 120.9825 }, { lat: 14.6168, lon: 120.9825 }, { lat: 14.6109, lon: 120.9818 },
    { lat: 14.6053, lon: 120.9818 }, { lat: 14.5991, lon: 120.9812 }, { lat: 14.5928, lon: 120.9815 },
    { lat: 14.5826, lon: 120.9845 }, { lat: 14.5763, lon: 120.9882 }, { lat: 14.5703, lon: 120.9918 },
    { lat: 14.5636, lon: 120.9948 }, { lat: 14.5543, lon: 120.9968 }, { lat: 14.5479, lon: 120.9988 },
    { lat: 14.5381, lon: 121.0008 }, { lat: 14.5339, lon: 120.9978 }
  ],
  'ROUTE_880801': [ // LRT-2
    { lat: 14.6035, lon: 120.9838 }, { lat: 14.6008, lon: 120.9935 }, { lat: 14.6015, lon: 121.0048 },
    { lat: 14.6025, lon: 121.0158 }, { lat: 14.6038, lon: 121.0268 }, { lat: 14.6050, lon: 121.0325 },
    { lat: 14.6105, lon: 121.0380 }, { lat: 14.6160, lon: 121.0490 }, { lat: 14.6205, lon: 121.0535 },
    { lat: 14.6285, lon: 121.0715 }, { lat: 14.6260, lon: 121.0780 }, { lat: 14.6235, lon: 121.0820 },
    { lat: 14.6225, lon: 121.0863 }, { lat: 14.6215, lon: 121.0950 }, { lat: 14.6195, lon: 121.1012 },
    { lat: 14.6175, lon: 121.1120 }, { lat: 14.6152, lon: 121.1223 }
  ]
};

// GET /api/gtfs/nearby?lat=14.5&lon=120.9&radius=500
exports.nearby = (req, res) => {
  try {
    const { lat, lon, radius = 500 } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
    const stops = getNearbyStops(parseFloat(lat), parseFloat(lon), parseFloat(radius));
    res.json({ count: stops.length, stops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/gtfs/route?number=MRT-3
exports.routeByNumber = (req, res) => {
  try {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: 'number required' });
    const route = getRouteByNumber(number);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    
    // Apply High-Fidelity Shape Override if available
    if (RAIL_OVERRIDES[route.id]) {
      route.shapeCoords = RAIL_OVERRIDES[route.id].map(p => ({ latitude: p.lat, longitude: p.lon }));
    } else {
      route.shapeCoords = (shapeCoordsByRoute.get(route.id) || []).map(p => ({ latitude: p.lat, longitude: p.lon }));
    }
    
    res.json(route);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/gtfs/route/:id/stops
exports.routeStops = (req, res) => {
  try {
    const stops = getStopsForRoute(req.params.id);
    res.json({ routeId: req.params.id, count: stops.length, stops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/gtfs/stop/:id/routes
exports.stopRoutes = (req, res) => {
  try {
    const routes = getRoutesForStop(req.params.id);
    res.json({ stopId: req.params.id, count: routes.length, routes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/gtfs/search?q=EDSA
exports.search = (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'q required' });
    const routes = searchRoutesByKeyword(q);
    res.json({ count: routes.length, routes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// GET /api/gtfs/commute?fromLat=&fromLon=&toLat=&toLon=
exports.commute = (req, res) => {
  try {
    const { fromLat, fromLon, toLat, toLon } = req.query;
    if (!fromLat || !fromLon || !toLat || !toLon)
      return res.status(400).json({ error: 'fromLat, fromLon, toLat, toLon required' });

    load();

    const fLat = parseFloat(fromLat);
    const fLon = parseFloat(fromLon);
    const tLat = parseFloat(toLat);
    const tLon = parseFloat(toLon);

    const directDistanceKm = (haversine(fLat, fLon, tLat, tLon) / 1000).toFixed(2);

    // Expand radius based on distance between points
    const distKm = parseFloat(directDistanceKm);
    const fromRadius = Math.min(1500, Math.max(800, distKm * 80));
    const toRadius = Math.min(2000, Math.max(1000, distKm * 100));

    const fromStops = getNearbyStops(fLat, fLon, fromRadius);
    const toStops = getNearbyStops(tLat, tLon, toRadius);

    if (fromStops.length === 0 || toStops.length === 0) {
      return res.json({ suggestions: [], fromStops, toStops, directDistanceKm });
    }

    const suggestions = [];
    const seenRoutes = new Set();

    // Prioritize train stops first
    const sortedFromStops = [
      ...fromStops.filter(s => s.routes.some(r => r.type === 2)),
      ...fromStops.filter(s => s.routes.every(r => r.type !== 2)),
    ];

    for (const fromStop of sortedFromStops.slice(0, 30)) {
      for (const fromRoute of fromStop.routes) {
        if (seenRoutes.has(fromRoute.id)) continue;

        const routeStops = getStopsForRoute(fromRoute.id);
        const fromIdx = routeStops.findIndex(s => s.id === fromStop.id);
        if (fromIdx === -1) continue;

        const isTrain = fromRoute.type === 2;
        if (isTrain && !isRouteAvailable(fromRoute.id)) continue;

        // Find the closest stop on this route to the destination
        let bestStop = null;
        let bestDist = Infinity;
        let bestIdx = -1;

        for (let i = fromIdx + 1; i < routeStops.length; i++) {
          const stop = routeStops[i];
          const dist = haversine(tLat, tLon, stop.lat, stop.lon);
          if (dist < bestDist) {
            bestDist = dist;
            bestStop = stop;
            bestIdx = i;
          }
        }

        // Accept if closest stop on route is within walkable distance of destination
        const walkThreshold = isTrain ? 1500 : 1200;
        if (!bestStop || bestDist > walkThreshold) continue;

        seenRoutes.add(fromRoute.id);
        const stopCount = bestIdx - fromIdx;
        const walkFromStop = bestDist;
        const walkToStop = fromStop.distanceMeters;

        // Get shape coords between from and to stop
        let shapeCoords = [];
        const override = RAIL_OVERRIDES[fromRoute.id];
        if (override) {
          // If it's a rail line, use our high-fidelity path
          const nearest = (coord) => override.reduce((best, pt, i) => {
            const d = Math.pow(pt.lat - coord.lat, 2) + Math.pow(pt.lon - coord.lon, 2);
            return d < best.d ? { d, i } : best;
          }, { d: Infinity, i: 0 }).i;
          const startIdx = nearest({ lat: fromStop.lat, lon: fromStop.lon });
          const endIdx = nearest({ lat: bestStop.lat, lon: bestStop.lon });
          const slice = startIdx < endIdx
            ? override.slice(startIdx, endIdx + 1)
            : override.slice(endIdx, startIdx + 1);
          shapeCoords = slice.map(p => ({ latitude: p.lat, longitude: p.lon }));
        } else {
          const allShapeCoords = shapeCoordsByRoute.get(fromRoute.id) || [];
          if (allShapeCoords.length > 0) {
            const nearest = (coord) => allShapeCoords.reduce((best, pt, i) => {
              const d = Math.pow(pt.lat - coord.lat, 2) + Math.pow(pt.lon - coord.lon, 2);
              return d < best.d ? { d, i } : best;
            }, { d: Infinity, i: 0 }).i;
            const startIdx = nearest({ lat: fromStop.lat, lon: fromStop.lon });
            const endIdx = nearest({ lat: bestStop.lat, lon: bestStop.lon });
            const slice = startIdx < endIdx
              ? allShapeCoords.slice(startIdx, endIdx + 1)
              : allShapeCoords.slice(endIdx, startIdx + 1);
            shapeCoords = slice.map(p => ({ latitude: p.lat, longitude: p.lon }));
          } else {
            // Fallback: draw line through all stops between from and to
            shapeCoords = routeStops.slice(fromIdx, bestIdx + 1).map(s => ({ latitude: s.lat, longitude: s.lon }));
          }
        }

        suggestions.push({
          type: isTrain ? 'train' : 'bus',
          routeId: fromRoute.id,
          routeName: fromRoute.shortName || fromRoute.longName,
          routeLongName: fromRoute.longName,
          color: isTrain
            ? (fromRoute.longName.includes('LRT 1') || fromRoute.longName.includes('Roosevelt') ? 'fdff00'
              : fromRoute.longName.includes('LRT 2') || fromRoute.longName.includes('Santolan') ? 'a520a1'
              : 'FF6B35')
            : (fromRoute.color || '40C4FF'),
          fromStop: { id: fromStop.id, name: fromStop.name, lat: fromStop.lat, lon: fromStop.lon, distanceMeters: walkToStop },
          toStop: { id: bestStop.id, name: bestStop.name, lat: bestStop.lat, lon: bestStop.lon, distanceMeters: Math.round(walkFromStop) },
          stopCount,
          walkToStop: walkToStop / 1000,
          walkFromStop: walkFromStop / 1000,
          shapeCoords: shapeCoords.map(p => ({ latitude: p.lat, longitude: p.lon })),
          estimatedDuration: stopCount * (isTrain ? 3 : 5) + Math.round(walkToStop / 80) + Math.round(walkFromStop / 80),
          estimatedFare: isTrain
            ? 12 + Math.round(stopCount * 1.5)
            : Math.round(stopCount * 0.5 + 13),
        });

        if (suggestions.length >= 6) break;
      }
      if (suggestions.length >= 6) break;
    }

    // Sort by estimated duration
    suggestions.sort((a, b) => a.estimatedDuration - b.estimatedDuration);

    res.json({
      fromStops: fromStops.slice(0, 5),
      toStops: toStops.slice(0, 5),
      suggestions,
      directDistanceKm,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
