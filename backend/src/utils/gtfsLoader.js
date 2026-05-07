const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const GTFS_DIR = path.join(__dirname, '../../gtfs');

let loaded = false;
const routesByNumber = new Map();
const routesById = new Map();
const stopsById = new Map();
const stopsByRoute = new Map();
const routesByStop = new Map();
const tripsByRoute = new Map();
const stopTimesByTrip = new Map();
const shapesByTrip = new Map();
const shapeCoordsByRoute = new Map();
const activeServiceIds = new Set();
const activeRouteIds = new Set();

const loadCSV = (filename) => {
  const content = fs.readFileSync(path.join(GTFS_DIR, filename), 'utf8');
  return parse(content, { columns: true, skip_empty_lines: true, relax_quotes: true });
};

const load = () => {
  if (loaded) return;
  console.log('Loading GTFS data...');

  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  const calendarDatesPath = path.join(GTFS_DIR, 'calendar_dates.txt');
  const calendarExceptions = new Map();
  if (fs.existsSync(calendarDatesPath)) {
    loadCSV('calendar_dates.txt').forEach(entry => {
      if (!calendarExceptions.has(entry.service_id)) calendarExceptions.set(entry.service_id, new Map());
      calendarExceptions.get(entry.service_id).set(entry.date, parseInt(entry.exception_type, 10));
    });
  }

  loadCSV('calendar.txt').forEach(c => {
    const serviceId = c.service_id;
    const startDate = c.start_date;
    const endDate = c.end_date;
    const weekday = weekdayKeys[today.getDay()];
    const isInRange = startDate <= todayStr && todayStr <= endDate;
    const isWeeklyService = parseInt(c[weekday], 10) === 1;
    const exceptionMap = calendarExceptions.get(serviceId);

    if (exceptionMap && exceptionMap.has(todayStr)) {
      const exceptionType = exceptionMap.get(todayStr);
      if (exceptionType === 1) activeServiceIds.add(serviceId);
      else if (exceptionType === 2) activeServiceIds.delete(serviceId);
    } else if (isInRange && isWeeklyService) {
      activeServiceIds.add(serviceId);
    }
  });

  // Load routes
  loadCSV('routes.txt').forEach(r => {
    const route = {
      id: r.route_id,
      shortName: r.route_short_name || '',
      longName: r.route_long_name || '',
      type: parseInt(r.route_type) || 3,
      color: r.route_color || '40C4FF',
    };
    routesById.set(r.route_id, route);
    if (r.route_short_name) routesByNumber.set(r.route_short_name.trim(), route);
  });

  // Load stops
  loadCSV('stops.txt').forEach(s => {
    stopsById.set(s.stop_id, {
      id: s.stop_id,
      name: s.stop_name || '',
      lat: parseFloat(s.stop_lat),
      lon: parseFloat(s.stop_lon),
    });
  });

  // Load trips
  loadCSV('trips.txt').forEach(t => {
    if (!tripsByRoute.has(t.route_id)) tripsByRoute.set(t.route_id, []);
    tripsByRoute.get(t.route_id).push({ tripId: t.trip_id, shapeId: t.shape_id, serviceId: t.service_id });
  });

  // Load shapes
  const rawShapes = new Map();
  loadCSV('shapes.txt').forEach(s => {
    if (!rawShapes.has(s.shape_id)) rawShapes.set(s.shape_id, []);
    rawShapes.get(s.shape_id).push({ lat: parseFloat(s.shape_pt_lat), lon: parseFloat(s.shape_pt_lon), seq: parseInt(s.shape_pt_sequence) });
  });
  rawShapes.forEach((pts, shapeId) => {
    pts.sort((a, b) => a.seq - b.seq);
    shapesByTrip.set(shapeId, pts.map(p => ({ lat: p.lat, lon: p.lon })));
  });

  // Load stop_times and build indexes
  const tripStopMap = new Map();
  loadCSV('stop_times.txt').forEach(st => {
    if (!tripStopMap.has(st.trip_id)) tripStopMap.set(st.trip_id, []);
    tripStopMap.get(st.trip_id).push({ stopId: st.stop_id, seq: parseInt(st.stop_sequence) });
    stopTimesByTrip.set(st.trip_id, tripStopMap.get(st.trip_id));
  });

  // Sort stop times by sequence
  tripStopMap.forEach((stops, tripId) => {
    stops.sort((a, b) => a.seq - b.seq);
  });

  // Build stopsByRoute, routesByStop and shapeCoordsByRoute
  routesById.forEach((route, routeId) => {
    const trips = tripsByRoute.get(routeId) || [];
    if (trips.length === 0) return;

    const activeTrips = trips.filter(t => activeServiceIds.has(t.serviceId));
    if (activeTrips.length > 0) activeRouteIds.add(routeId);

    const firstTrip = activeTrips.length > 0 ? activeTrips[0] : trips[0];

    // Store shape coords for this route
    if (firstTrip.shapeId && shapesByTrip.has(firstTrip.shapeId)) {
      shapeCoordsByRoute.set(routeId, shapesByTrip.get(firstTrip.shapeId));
    }

    const tripStops = tripStopMap.get(firstTrip.tripId) || [];
    const stops = tripStops.map(ts => stopsById.get(ts.stopId)).filter(Boolean);

    stopsByRoute.set(routeId, stops);

    stops.forEach(stop => {
      if (!routesByStop.has(stop.id)) routesByStop.set(stop.id, []);
      routesByStop.get(stop.id).push(route);
    });
  });

  loaded = true;
  console.log(`GTFS loaded: ${routesById.size} routes, ${stopsById.size} stops`);
};

const isRouteAvailable = (routeId) => activeRouteIds.has(routeId);

module.exports = {
  load,
  routesByNumber,
  routesById,
  stopsById,
  stopsByRoute,
  routesByStop,
  tripsByRoute,
  stopTimesByTrip,
  shapeCoordsByRoute,
  isRouteAvailable,
};
