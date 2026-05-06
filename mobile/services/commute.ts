import axios from 'axios';
import { getRoute } from '@/services/ors';
import { STATIONS, TRANSFER_LINKS } from '@/data/trainStations';

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

const findStationId = (name: string) =>
  STATIONS.find(s =>
    s.name.toLowerCase().includes(name.toLowerCase()) ||
    name.toLowerCase().includes(s.name.toLowerCase())
  )?.id ?? null;

const getTransferWalkMin = (fromName: string, toName: string): number | null => {
  const fromId = findStationId(fromName);
  const toId = findStationId(toName);
  if (!fromId || !toId) return null;
  return TRANSFER_LINKS.find(t => t.from === fromId && t.to === toId)?.walkMin ?? null;
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

// Score a suggestion: lower = better
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

    const makeQuery = (maxWalk: number, minTransfer: number, arriveBy = false) => `{
      plan(
        from: { lat: ${from.latitude}, lon: ${from.longitude} }
        to: { lat: ${to.latitude}, lon: ${to.longitude} }
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

    const responses = await Promise.all([
      axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(2000, 60) },   { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }),
      axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(5000, 60) },   { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }),
      axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(8000, 60) },   { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }),
      axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(1200, 0) },    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }),
      axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(3000, 90, true) }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }),
      axios.post(`${OTP_URL}/otp/gtfs/v1`, { query: makeQuery(10000, 60) },  { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }),
    ]);

    const itineraries = responses.flatMap(r => r.data?.data?.plan?.itineraries ?? []);
    if (!itineraries.length) return getRoadFallback(from, to);

    const suggestions: CommuteSuggestion[] = itineraries.map((itin: any) => {
      let totalDuration = Math.round(itin.duration / 60);
      let totalFare = 0;
      const totalDistanceKm = parseFloat(
        (itin.legs.reduce((s: number, l: any) => s + l.distance, 0) / 1000).toFixed(2)
      );

      const steps: CommuteStep[] = [];

      itin.legs.forEach((leg: any, i: number) => {
        const isWalk = leg.mode === 'WALK';
        const isTrain = leg.mode === 'RAIL' || leg.mode === 'TRAM' || leg.mode === 'SUBWAY';
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

        steps.push({
          type: isWalk ? 'walk' : isTrain ? 'train' : jeep ? 'jeep' : 'bus',
          label: isWalk
            ? `Walk to ${cleanStopName(leg.to.name)}`
            : isTrain
            ? `${leg.route?.shortName || leg.route?.longName} · ${cleanStopName(leg.from.name)} → ${cleanStopName(leg.to.name)}`
            : (leg.route?.longName || leg.route?.shortName || (jeep ? 'Jeepney' : leg.mode)),
          detail: `${distKm} km · ${durMin} min${fare > 0 ? ` · ₱${fare}` : ''}`,
          duration: durMin,
          fare,
          color,
          coordinates,
        } as CommuteStep);
      });

      // Build line label
      const transitLegs = itin.legs.filter((l: any) => l.mode !== 'WALK');
      const transitLeg = transitLegs[0];
      const isTrainRoute = transitLeg?.mode === 'RAIL' || transitLeg?.mode === 'TRAM' || transitLeg?.mode === 'SUBWAY';
      const routeColor = MODE_COLOR[transitLeg?.mode ?? 'BUS'] ?? '#40C4FF';

      const lastTrainLeg = [...transitLegs].reverse().find((l: any) =>
        l.mode === 'RAIL' || l.mode === 'TRAM' || l.mode === 'SUBWAY'
      );

      const line = transitLeg?.route?.shortName || transitLeg?.route?.longName?.split(' - ')[0] || transitLeg?.mode || 'BUS';
      const label = transitLegs.map((l: any) => l.route?.longName || l.route?.shortName || l.mode).join(' → ') || 'Transit';
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

      // Remove routes with bus/jeep after last train
      if (hasTrain) {
        const lastTrainIdx = s.steps.map((st, i) => st.type === 'train' ? i : -1).filter(i => i >= 0).pop()!;
        const afterTrain = s.steps.slice(lastTrainIdx + 1);
        if (afterTrain.some(st => st.type === 'bus' || st.type === 'jeep')) return false;
      }

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

    // Deduplicate by label
    const seen = new Set<string>();
    const unique = filtered.filter(s => {
      if (seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    });

    // Sort by score
    unique.sort((a, b) => scoreSuggestion(a, to) - scoreSuggestion(b, to));

    const result = unique.slice(0, 5);

    // If all routes were filtered, relax filters and try again with raw suggestions
    if (!result.length) {
      const relaxed = suggestions
        .filter(s => {
          const allLabels = s.steps.map(st => st.label.toUpperCase()).join(' ');
          return !allLabels.includes('DASMARINAS') && !allLabels.includes('BACOOR') && !allLabels.includes('NAVOTAS');
        })
        .sort((a, b) => scoreSuggestion(a, to) - scoreSuggestion(b, to))
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
          detail: `${road.distanceKm} km · ~${road.durationMin} min · ₱${fare}`,
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
