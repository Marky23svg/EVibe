import axios from 'axios';
import { getRoute } from '@/services/ors';
import { STATIONS, TRANSFER_LINKS, Station, findNearestStation, resolveLineSegment } from '@/data/trainStations';

const OTP_URL = (process.env.EXPO_PUBLIC_OTP_URL ?? 'http://192.168.1.25:8080/otp').replace(/\/otp$/, '');

export type CommuteResult = {
  type: 'train' | 'bus' | 'road' | 'mixed';
  suggestions: CommuteSuggestion[];
  totalDistanceKm: number;
};

export type CommuteSuggestion = {
  type: 'train' | 'bus';
  line: string;
  label: string;
  steps: CommuteStep[];
  totalDuration: number;
  totalFare: number;
  totalDistanceKm?: number;
  color: string;
  lastLine?: string | null;
  _otpOrder?: number;
};

export type CommuteStep = {
  type: 'walk' | 'train' | 'bus' | 'jeep';
  label: string;
  detail: string;
  duration: number;
  fare: number;
  color: string;
  coordinates?: { latitude: number; longitude: number }[];
};

const MODE_COLOR: Record<string, string> = {
  BUS: '#40C4FF',
  JEEP: '#FF9800',
  TRAM: '#fdff00',
  RAIL: '#FF6B35',
  SUBWAY: '#a520a1',
  WALK: '#00E676',
};

const JEEP_MAX_KM = 15;

const findStationId = (name: string) => {
  const n = name.toLowerCase();
  // MRT-3
  if (n.includes('cubao mrt')) return 'mrt-4';
  if (n.includes('taft ave mrt') || n.includes('taft avenue mrt')) return 'mrt-13';
  if (n.includes('cubao') && n.includes('mrt')) return 'mrt-4';
  
  // LRT-1
  if (n.includes('roosevelt lrt')) return 'lrt1-1';
  if (n.includes('lrt balintawak')) return 'lrt1-2';
  if (n.includes('monumento lrt')) return 'lrt1-3';
  if (n.includes('5th ave lrt')) return 'lrt1-4';
  if (n.includes('r. papa lrt')) return 'lrt1-5';
  if (n.includes('abad santos lrt')) return 'lrt1-6';
  if (n.includes('blumentritt lrt')) return 'lrt1-7';
  if (n.includes('tayuman lrt')) return 'lrt1-8';
  if (n.includes('bambang lrt')) return 'lrt1-9';
  if (n.includes('doroteo jose lrt')) return 'lrt1-10';
  if (n.includes('carriedo lrt')) return 'lrt1-11';
  if (n.includes('central terminal lrt')) return 'lrt1-12';
  if (n.includes('un ave lrt')) return 'lrt1-13';
  if (n.includes('pedro gil lrt')) return 'lrt1-14';
  if (n.includes('quirino ave lrt')) return 'lrt1-15';
  if (n.includes('vito cruz lrt')) return 'lrt1-16';
  if (n.includes('gil puyat lrt')) return 'lrt1-17';
  if (n.includes('libertad lrt')) return 'lrt1-18';
  if (n.includes('edsa lrt')) return 'lrt1-19';
  if (n.includes('baclaran lrt')) return 'lrt1-20';
  // LRT-2
  if (n.includes('recto lrt')) return 'lrt2-1';
  if (n.includes('cubao lrt') || n.includes('araneta cubao')) return 'lrt2-8';
  if (n.includes('cubao') && n.includes('lrt')) return 'lrt2-8';
  if (n.includes('santolan lrt')) return 'lrt2-11';
  if (n.includes('marikina-pasig') || n.includes('marikina pasig')) return 'lrt2-12';
  if (n.includes('antipolo lrt')) return 'lrt2-13';
  return STATIONS.find(s =>
    s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase())
  )?.id ?? null;
};

const getTransferWalkMin = (fromName: string, toName: string): number | null => {
  const fromId = findStationId(fromName);
  const toId = findStationId(toName);
  if (!fromId || !toId) return null;
  return TRANSFER_LINKS.find(t => t.from === fromId && t.to === toId)?.walkMin ?? null;
};

const getDistanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const R = 6371;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const getAlternateOriginForCubao = (
  fromCoords: { latitude: number; longitude: number },
  toCoords: { latitude: number; longitude: number }
) => {
  const mrtCubao = STATIONS.find(s => s.id === 'mrt-4');
  const lrtCubao = STATIONS.find(s => s.id === 'lrt2-8');
  if (!mrtCubao || !lrtCubao) return null;

  const fromToMrt = getDistanceKm(fromCoords, mrtCubao.coordinate);
  const fromToLrt = getDistanceKm(fromCoords, lrtCubao.coordinate);
  const toToMrt = getDistanceKm(toCoords, mrtCubao.coordinate);
  const toToLrt = getDistanceKm(toCoords, lrtCubao.coordinate);

  const nearestOriginStation = findNearestStation(fromCoords);
  if (!nearestOriginStation) return null;
  const isNearMrt = nearestOriginStation.id === 'mrt-4' && fromToMrt <= 1;
  const lrtCloserForFrom = fromToLrt + 0.05 < fromToMrt;
  const lrtCloserForDest = toToLrt + 0.15 < toToMrt;
  const destEasterly = toCoords.longitude > 121.05;

  if (isNearMrt && (lrtCloserForFrom || lrtCloserForDest || destEasterly)) {
    console.log('Cubao alternate origin selected', {
      fromCoords,
      toCoords,
      fromToMrt,
      fromToLrt,
      toToMrt,
      toToLrt,
      nearestOriginStation: nearestOriginStation.id,
      lrtCloserForFrom,
      lrtCloserForDest,
      destEasterly,
      alternate: lrtCubao.coordinate,
    });
    return lrtCubao.coordinate;
  }

  console.log('Cubao alternate origin not selected', {
    fromCoords,
    toCoords,
    fromToMrt,
    fromToLrt,
    nearestOriginStation: nearestOriginStation.id,
    isNearMrt,
    lrtCloserForFrom,
    lrtCloserForDest,
    destEasterly,
  });
  return null;
};

const getWalkDurationMin = (distanceKm: number) => Math.max(1, Math.round(distanceKm * 1000 / 80));

const getNearestStationWithin = (
  coords: { latitude: number; longitude: number },
  maxKm = 0.5
): { station: Station; distanceKm: number } | null => {
  let result: { station: Station; distanceKm: number } | null = null;
  for (const station of STATIONS) {
    const distanceKm = getDistanceKm(coords, station.coordinate);
    if (distanceKm <= maxKm && (!result || distanceKm < result.distanceKm)) {
      result = { station, distanceKm };
    }
  }
  return result;
};

const isJeepney = (gtfsId: string | undefined, routeName: string, distanceM: number) =>
  distanceM / 1000 <= JEEP_MAX_KM &&
  (/PUJ/i.test(gtfsId ?? '') || /PUJ|jeep|jeepney/i.test(routeName));

const decodePolyline = (encoded: string): { latitude: number; longitude: number }[] => {
  const coords: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
};

const cleanStopName = (name: string): string =>
  name
    .replace(/,\s*(Antipolo City|Marikina City|Pasig City|Quezon City|Manila|Makati City|San Juan)[^,]*/gi, '')
    .replace(/,\s*Manila$/i, '')
    .trim();

const calcFare = (mode: string, distanceM: number): number => {
  const km = distanceM / 1000;
  if (mode === 'RAIL' || mode === 'TRAM' || mode === 'SUBWAY') return Math.round(12 + km * 1.5);
  if (mode === 'BUS') return Math.round(km * 1.5 + 13);
  return 0;
};

const normalizeRouteText = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const scoreSuggestion = (s: CommuteSuggestion, to: { latitude: number; longitude: number }): number => {
  const hasTrain = s.steps.some(st => st.type === 'train');
  const hasJeep = s.steps.some(st => st.type === 'jeep');
  const hasBus = s.steps.some(st => st.type === 'bus');

  let score = 0;

  // Priority 1: Train routes are best
  if (hasTrain) score -= 10000;

  // Priority 2: Among train routes, prefer more train legs (LRT+MRT combos)
  const trainCount = s.steps.filter(st => st.type === 'train').length;
  score -= trainCount * 500;

  // Priority 3: Prefer routes ending closer to destination
  const lastTrainStep = [...s.steps].reverse().find(st => st.type === 'train');
  if (lastTrainStep) {
    // Prefer Marikina-Pasig over Santolan if destination is east
    if (lastTrainStep.label.includes('Marikina-Pasig') || lastTrainStep.label.includes('Marikina Pasig')) {
      const distToStation = Math.hypot(to.latitude - 14.6219, to.longitude - 121.0948);
      score -= (1 - distToStation) * 2000;
    }
    if (lastTrainStep.label.includes('Santolan') && !lastTrainStep.label.includes('Marikina')) {
      const distToStation = Math.hypot(to.latitude - 14.6223, to.longitude - 121.0860);
      score -= (1 - distToStation) * 1000;
    }
  }

  // Priority 4: Jeep over bus for non-train routes
  if (!hasTrain && hasJeep) score -= 3000;
  if (!hasTrain && hasBus) score -= 500;

  // Prefer routes that use Cubao LRT when available
  if (s.steps.some(st => /CUBAO LRT/i.test(st.label))) score -= 400;

  // Priority 5: Shorter duration
  score += s.totalDuration;

  return score;
};

export const getCommuteRoute = async (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<CommuteResult> => {
  try {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];

    const alternateOrigin = getAlternateOriginForCubao(from, to);
    const origins = [from];
    if (
      alternateOrigin &&
      (alternateOrigin.latitude !== from.latitude || alternateOrigin.longitude !== from.longitude)
    ) {
      console.log('Using alternate Cubao origin for OTP query', { from, alternateOrigin, to });
      origins.push(alternateOrigin);
    } else {
      console.log('No alternate Cubao origin used', { from, to, alternateOrigin });
    }

    const alternateDestination = getNearestStationWithin(to, 2.5);
    const destinations: Array<{
      coords: { latitude: number; longitude: number };
      station: Station | null;
    }> = [{ coords: to, station: null }];

    if (alternateDestination && alternateDestination.distanceKm > 0.05) {
      destinations.push({ coords: alternateDestination.station.coordinate, station: alternateDestination.station });
      console.log('Using alternate destination station for OTP query', {
        originalTo: to,
        station: alternateDestination.station.name,
        distanceKm: alternateDestination.distanceKm,
      });
    }

    const makeQuery = (
      origin: { latitude: number; longitude: number },
      destination: { latitude: number; longitude: number },
      maxWalk: number,
      minTransfer: number,
      arriveBy = false
    ) => `{
      plan(
        from: { lat: ${origin.latitude}, lon: ${origin.longitude} }
        to: { lat: ${destination.latitude}, lon: ${destination.longitude} }
        date: "${date}"
        time: "${time}"
        arriveBy: ${arriveBy}
        numItineraries: 10
        maxTransfers: 4
        transferPenalty: 0
        minTransferTime: ${minTransfer}
        maxWalkDistance: ${maxWalk}
        transportModes: [
          {mode: WALK}
          {mode: RAIL}
          {mode: TRAM}
          {mode: SUBWAY}
          {mode: BUS}
        ]
      ) {
        itineraries {
          duration
          legs {
            mode duration distance
            from { name lat lon }
            to { name lat lon }
            route { gtfsId shortName longName }
            legGeometry { points }
          }
        }
      }
    }`;

    const requestEntries = origins.flatMap(origin =>
      destinations.flatMap(destination => [
        { origin, destination, promise: axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(origin, destination.coords, 2000, 60) },   { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }) },
        { origin, destination, promise: axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(origin, destination.coords, 5000, 60) },   { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }) },
        { origin, destination, promise: axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(origin, destination.coords, 8000, 60) },   { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }) },
        { origin, destination, promise: axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(origin, destination.coords, 1200, 0) },    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }) },
        { origin, destination, promise: axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(origin, destination.coords, 3000, 90, true) }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }) },
        { origin, destination, promise: axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(origin, destination.coords, 10000, 60) },  { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }) },
      ])
    );

    const responses = await Promise.all(requestEntries.map(entry => entry.promise));

    let globalItinIndex = 0;
    const itineraries = requestEntries.flatMap((entry, idx) =>
      (responses[idx].data?.data?.plan?.itineraries ?? []).map((itin: any) => {
        const order = globalItinIndex++;
        return { origin: entry.origin, destination: entry.destination, itin, order };
      })
    );
    if (!itineraries.length) return getRoadFallback(from, to);

    const suggestions: CommuteSuggestion[] = itineraries.map(({ origin: itineraryOrigin, destination, itin, order }: any) => {
      let totalDuration = Math.round(itin.duration / 60);
      let totalFare = 0;
      let totalDistanceKm = parseFloat(
        (itin.legs.reduce((s: number, l: any) => s + l.distance, 0) / 1000).toFixed(2)
      );

      const steps: CommuteStep[] = [];

      const originRelocation = itineraryOrigin.latitude !== from.latitude || itineraryOrigin.longitude !== from.longitude;
      if (originRelocation) {
        const walkDistanceKm = getDistanceKm(from, itineraryOrigin);
        const walkDuration = getWalkDurationMin(walkDistanceKm);
        totalDuration += walkDuration;
        totalDistanceKm += walkDistanceKm;
        steps.push({
          type: 'walk',
          label: 'Walk to Cubao LRT',
          detail: `~${walkDuration} min walk`,
          duration: walkDuration,
          fare: 0,
          color: MODE_COLOR.WALK,
          coordinates: [from, itineraryOrigin],
        });
      }

      // Find last train leg index to simplify post-train segments
      const lastTrainLegIndex = itin.legs.map((l: any, idx: number) =>
        (l.mode === 'RAIL' || l.mode === 'TRAM' || l.mode === 'SUBWAY') ? idx : -1
      ).filter((i: number) => i !== -1).pop() ?? -1;
      const finalTrainLeg = lastTrainLegIndex >= 0 ? itin.legs[lastTrainLegIndex] : null;
      const lastTrainToDestKm = finalTrainLeg
        ? getDistanceKm({ latitude: finalTrainLeg.to.lat, longitude: finalTrainLeg.to.lon }, to)
        : Infinity;
      const simplifyPostTrain = lastTrainLegIndex >= 0 && lastTrainToDestKm < 2.0;

      itin.legs.forEach((leg: any, i: number) => {
        const isWalk = leg.mode === 'WALK';
        const isTrain = leg.mode === 'RAIL' || leg.mode === 'TRAM' || leg.mode === 'SUBWAY';

        // Only simplify post-train transit when last train station is close to destination
        const isAfterLastTrain = simplifyPostTrain && lastTrainLegIndex >= 0 && i > lastTrainLegIndex;
        if (isAfterLastTrain && !isWalk && !isTrain) {
          return;
        }

        // Skip transfer walks after last train leg (also replaced by final walk)
        if (isAfterLastTrain && isWalk && i < itin.legs.length - 1) {
          return;
        }

        const routeName = leg.route?.longName || leg.route?.shortName || '';
        const jeep = !isWalk && !isTrain && isJeepney(leg.route?.gtfsId, routeName, leg.distance);
        const color = jeep ? MODE_COLOR.JEEP : (MODE_COLOR[leg.mode] ?? '#40C4FF');
        const distKm = (leg.distance / 1000).toFixed(2).replace(/\.?0+$/, '');
        const durMin = Math.round(leg.duration / 60);
        const fare = calcFare(leg.mode, leg.distance);
        totalFare += fare;
        const coordinates = leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [];

        // Inject transfer walk between consecutive train legs
        const prevLeg = itin.legs[i - 1];
        if (i > 0 && isTrain && (prevLeg?.mode === 'RAIL' || prevLeg?.mode === 'TRAM' || prevLeg?.mode === 'SUBWAY')) {
          const walkMin = getTransferWalkMin(prevLeg.to.name, leg.from.name);
          if (walkMin !== null && walkMin > 0) {
            steps.push({
              type: 'walk',
              label: `Transfer: walk from ${cleanStopName(prevLeg.to.name)} to ${cleanStopName(leg.from.name)}`,
              detail: `~${walkMin} min walk`,
              duration: walkMin,
              fare: 0,
              color: MODE_COLOR.WALK,
              coordinates: [],
            });
            totalDuration += walkMin;
          }
        }

        // Resolve line segment for proper MRT/LRT1/LRT2 recognition
        const lineSeg = isTrain ? resolveLineSegment(leg.route?.shortName, leg.route?.longName) : null;
        const displayLine = lineSeg?.shortName || leg.route?.shortName || leg.route?.longName || (jeep ? 'Jeepney' : leg.mode);
        const displayColor = lineSeg?.color || color;

        steps.push({
          type: isWalk ? 'walk' : isTrain ? 'train' : jeep ? 'jeep' : 'bus',
          label: isWalk
            ? `Walk to ${cleanStopName(leg.to.name)}`
            : isTrain
            ? `${displayLine} · ${cleanStopName(leg.from.name)} → ${cleanStopName(leg.to.name)}`
            : (leg.route?.longName || leg.route?.shortName || (jeep ? 'Jeepney' : leg.mode)),
          detail: `${distKm} km · ${durMin} min${fare > 0 ? ` · ₱${fare}` : ''}`,
          duration: durMin,
          fare,
          color: displayColor,
          coordinates,
        } as CommuteStep);
      });

      if (simplifyPostTrain && finalTrainLeg) {
        // Walk from actual last train station to destination
        const finalWalkKm = getDistanceKm({ latitude: finalTrainLeg.to.lat, longitude: finalTrainLeg.to.lon }, to);
        if (finalWalkKm > 0.05) {
          const walkDuration = getWalkDurationMin(finalWalkKm);
          totalDuration += walkDuration;
          totalDistanceKm += finalWalkKm;
          steps.push({
            type: 'walk',
            label: `Walk to destination`,
            detail: `~${walkDuration} min walk`,
            duration: walkDuration,
            fare: 0,
            color: MODE_COLOR.WALK,
            coordinates: [{ latitude: finalTrainLeg.to.lat, longitude: finalTrainLeg.to.lon }, to],
          });
        }
      } else if (destination?.station) {
        // Walk from alternate destination station to actual destination
        const endpointStation = destination.station;
        const finalWalkKm = getDistanceKm(endpointStation.coordinate, to);
        if (finalWalkKm > 0.05) {
          const walkDuration = getWalkDurationMin(finalWalkKm);
          totalDuration += walkDuration;
          totalDistanceKm += finalWalkKm;
          steps.push({
            type: 'walk',
            label: `Walk to destination`,
            detail: `~${walkDuration} min walk`,
            duration: walkDuration,
            fare: 0,
            color: MODE_COLOR.WALK,
            coordinates: [endpointStation.coordinate, to],
          });
        }
      }

      // Build line label using centralized segment recognition
      const transitLegs = itin.legs.filter((l: any) => l.mode !== 'WALK');
      const transitLeg = transitLegs[0];
      const isTrainRoute = transitLeg?.mode === 'RAIL' || transitLeg?.mode === 'TRAM' || transitLeg?.mode === 'SUBWAY';

      // Resolve first transit line segment for color and naming
      const firstLineSeg = resolveLineSegment(transitLeg?.route?.shortName, transitLeg?.route?.longName);
      const routeColor = firstLineSeg?.color || (MODE_COLOR[transitLeg?.mode ?? 'BUS'] ?? '#40C4FF');

      const lastTrainLeg = [...transitLegs].reverse().find((l: any) =>
        l.mode === 'RAIL' || l.mode === 'TRAM' || l.mode === 'SUBWAY'
      );
      const lastLineSeg = lastTrainLeg ? resolveLineSegment(lastTrainLeg.route?.shortName, lastTrainLeg.route?.longName) : null;

      // Build centralized segment-aware line label
      const line = firstLineSeg?.shortName || transitLeg?.route?.shortName || transitLeg?.route?.longName?.split(' - ')[0] || transitLeg?.mode || 'BUS';
      const label = transitLegs.map((l: any) => {
        const seg = resolveLineSegment(l.route?.shortName, l.route?.longName);
        return seg?.name || l.route?.longName || l.route?.shortName || l.mode;
      }).join(' → ') || 'Transit';
      const lastTrainDest = lastTrainLeg ? cleanStopName(lastTrainLeg.to.name).toUpperCase() : '';

      return {
        type: isTrainRoute ? 'train' : 'bus',
        line,
        label,
        steps,
        totalDuration,
        totalFare,
        totalDistanceKm,
        color: routeColor,
        lastTrainDest,
        lastLine: lastLineSeg?.shortName || null,
        _otpOrder: order,
      } as CommuteSuggestion;
    });

    // Filter
    const filtered = suggestions.filter(s => {
      const hasBus = s.steps.some(st => st.type === 'bus');
      const hasJeep = s.steps.some(st => st.type === 'jeep');
      const hasTrain = s.steps.some(st => st.type === 'train');
      const lastDest = (s as any).lastTrainDest || '';

      // Remove routes with both bus and jeep
      if (hasBus && hasJeep) return false;

      // Remove routes going to Cainta
      if (lastDest.includes('CAINTA')) return false;

      // Remove routes going wrong direction (Cavite, Bacoor, Dasmarinas, Navotas)
      const allLabels = s.steps.map(st => st.label.toUpperCase()).join(' ');
      if (
        allLabels.includes('DASMARINAS') ||
        allLabels.includes('BACOOR') ||
        allLabels.includes('NAVOTAS')
      ) return false;

      return true;
    });

    const getRouteSignature = (suggestion: CommuteSuggestion) => {
      const transitSteps = suggestion.steps.filter(step => step.type !== 'walk');
      if (!transitSteps.length) {
        return normalizeRouteText(`${suggestion.line}|${suggestion.totalDuration}|${suggestion.totalFare}`);
      }
      return transitSteps
        .map(step => `${step.type}:${normalizeRouteText(step.label)}:${normalizeRouteText(step.detail)}`)
        .join('|');
    };

    const seen = new Set<string>();
    const unique = filtered.filter(s => {
      const key = getRouteSignature(s);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by score, then preserve OTP's original order as tiebreaker
    unique.sort((a, b) => {
      const scoreDiff = scoreSuggestion(a, to) - scoreSuggestion(b, to);
      if (scoreDiff !== 0) return scoreDiff;
      return (a._otpOrder ?? 0) - (b._otpOrder ?? 0);
    });

    const result = unique.slice(0, 5);

    // If all routes were filtered, relax filters and try again with raw suggestions
    if (!result.length) {
      const relaxed = suggestions
        .filter(s => {
          const allLabels = s.steps.map(st => st.label.toUpperCase()).join(' ');
          return !allLabels.includes('DASMARINAS') && !allLabels.includes('BACOOR') && !allLabels.includes('NAVOTAS');
        })
        .sort((a, b) => {
          const diff = scoreSuggestion(a, to) - scoreSuggestion(b, to);
          return diff !== 0 ? diff : (a._otpOrder ?? 0) - (b._otpOrder ?? 0);
        })
        .slice(0, 3);
      if (relaxed.length) return {
        type: relaxed.length > 1 ? 'mixed' : relaxed[0]?.type || 'road',
        suggestions: relaxed,
        totalDistanceKm: relaxed[0]?.totalDistanceKm ?? 0,
      };
      return getRoadFallback(from, to);
    }

    return {
      type: result.length > 1 ? 'mixed' : result[0]?.type || 'road',
      suggestions: result,
      totalDistanceKm: result[0]?.totalDistanceKm ?? 0,
    };

  } catch (err: any) {
    console.log('OTP error:', err?.response?.data || err?.message || err);
    return getRoadFallback(from, to);
  }
};

const getRoadFallback = async (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<CommuteResult> => {
  try {
    const road = await getRoute(from, to, 'driving-car');
    const dist = parseFloat(road.distanceKm);
    const fare = Math.round(dist * 1.5 + 13);
    return {
      type: 'road',
      suggestions: [{
        type: 'bus',
        line: 'BUS',
        label: 'Bus/Jeepney',
        steps: [{
          type: 'bus',
          label: 'Take bus/jeepney along route',
          detail: `${road.distanceKm} km Â· ~${road.durationMin} min Â· â‚±${fare}`,
          duration: road.durationMin,
          fare,
          color: '#40C4FF',
          coordinates: road.coordinates,
        }],
        totalDuration: road.durationMin,
        totalFare: fare,
        color: '#40C4FF',
      }],
      totalDistanceKm: dist,
    };
  } catch {
    return { type: 'road', suggestions: [], totalDistanceKm: 0 };
  }
};

