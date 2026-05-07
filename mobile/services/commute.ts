import { getRoute } from '@/services/ors';
import { STATIONS, TRANSFER_LINKS, Station, findNearestStation, resolveLineSegment, LINE_COLORS } from '@/data/trainStations';
import { RAIL_SHAPES } from '@/data/transitShapes';

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
  WALK: '#00E676',
};

/** 1. Build the Graph from STATIONS and TRANSFER_LINKS */
type Edge = { to: string; weight: number; fare: number; type: 'train' | 'transfer' };
const GRAPH: Record<string, Edge[]> = {};

STATIONS.forEach((s, i) => {
  if (!GRAPH[s.id]) GRAPH[s.id] = [];
  
  // Connect to next station on same line
  const next = STATIONS[i + 1];
  if (next && next.line === s.line) {
    // 3 mins per station, ₱2 incremental fare
    GRAPH[s.id].push({ to: next.id, weight: 3, fare: 2, type: 'train' }); 
    if (!GRAPH[next.id]) GRAPH[next.id] = [];
    GRAPH[next.id].push({ to: s.id, weight: 3, fare: 2, type: 'train' });
  }
});

TRANSFER_LINKS.forEach(link => {
  if (!GRAPH[link.from]) GRAPH[link.from] = [];
  // Heavily penalize transfers (₱20) to favor long, single-line rail segments
  GRAPH[link.from].push({ to: link.to, weight: link.walkMin, fare: 20, type: 'transfer' });
});

/** 2. Dijkstra Algorithm */
const findShortestPath = (startId: string, endId: string, weightKey: 'duration' | 'fare' = 'duration') => {
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const nodes = new Set<string>();

  Object.keys(GRAPH).forEach(id => {
    distances[id] = Infinity;
    previous[id] = null;
    nodes.add(id);
  });

  distances[startId] = 0;

  while (nodes.size > 0) {
    let u = Array.from(nodes).reduce((minNode, node) =>
      distances[node] < distances[minNode] ? node : minNode
    );

    if (distances[u] === Infinity || u === endId) break;
    nodes.delete(u);

    GRAPH[u].forEach(edge => {
      const weight = weightKey === 'duration' ? edge.weight : edge.fare || 0; // Default 0 cost for transfer walk
      const alt = distances[u] + weight;
      if (alt < distances[edge.to]) {
        distances[edge.to] = alt;
        previous[edge.to] = u;
      }
    });
  }

  const path: string[] = [];
  let curr: string | null = endId;
  while (curr) {
    path.unshift(curr);
    curr = previous[curr];
  }
  return path[0] === startId ? path : [];
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

const getWalkMin = (distKm: number) => Math.max(1, Math.round(distKm * 15)); // 15 mins per km

export const getCommuteRoute = async (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<CommuteResult> => {
  try {
    const startStation = findNearestStation(from);
    const endStation = findNearestStation(to);

    if (!startStation || !endStation) return getRoadFallback(from, to);

    const buildSuggestion = async (pathIds: string[], typeLabel: string): Promise<CommuteSuggestion | null> => {
      if (pathIds.length < 2 && startStation.id !== endStation.id) return null;
      
      const pathStations = pathIds.map(id => STATIONS.find(s => s.id === id)!);
      const steps: CommuteStep[] = [];
      
      const createFlexSteps = async (fromCoords: any, toCoords: any, targetName: string, isStart: boolean): Promise<CommuteStep[]> => {
        const dist = getDistanceKm(fromCoords, toCoords);
        const walkMin = getWalkMin(dist);
        if (dist < 0.1) return [];
        if (dist > 1.0) {
          const walkToJeepMin = 2;
          const jeepMin = Math.max(5, Math.round((dist - 0.1) * 10)); 
          const jeepDist = dist - 0.1;
          const jeepFare = Math.round(13 + Math.max(0, jeepDist - 4) * 1.80);

          let jeepCoords: {latitude: number, longitude: number}[] = [fromCoords, toCoords];
          try {
            const roadPath = await getRoute(fromCoords, toCoords, 'driving-car');
            if (roadPath && roadPath.coordinates.length > 0) {
              // FAIL-SAFE CUT: Find the index where it gets closest to the target
              let bestIdx = 0;
              let bestDistSq = Infinity;
              
              // Skip the first 15% to avoid cutting at origin
              const offset = Math.floor(roadPath.coordinates.length * 0.15);
              
              for (let i = offset; i < roadPath.coordinates.length; i++) {
                const p = roadPath.coordinates[i];
                // Simple squared distance for comparison (lat/lon units)
                const d2 = Math.pow(p.latitude - toCoords.latitude, 2) + Math.pow(p.longitude - toCoords.longitude, 2);
                if (d2 < bestDistSq) {
                  bestDistSq = d2;
                  bestIdx = i;
                }
                // If we get extremely close (approx 50m), break immediately
                if (d2 < 0.00000025) { 
                  bestIdx = i;
                  break;
                }
              }
              jeepCoords = roadPath.coordinates.slice(0, bestIdx + 1);
              // Force terminal point to target
              if (jeepCoords.length > 0) {
                jeepCoords[jeepCoords.length - 1] = toCoords;
              }
            }
          } catch (e) {}

          return [
            {
              type: 'walk',
              label: `Walk to main road`,
              detail: `~0.05 km · Hail any Jeepney along route`,
              duration: walkToJeepMin,
              fare: 0,
              color: MODE_COLOR.WALK,
              coordinates: [fromCoords, fromCoords]
            },
            {
              type: 'jeep',
              label: isStart ? `Jeepney to ${targetName}` : `Jeepney toward destination`,
              detail: `${jeepDist.toFixed(2)} km · ~${jeepMin} min · ₱${jeepFare}`,
              duration: jeepMin,
              fare: jeepFare,
              color: MODE_COLOR.JEEP,
              coordinates: jeepCoords
            },
            {
              type: 'walk',
              label: `Hop off near ${targetName}`,
              detail: `Para! Stop when near target`,
              duration: 1,
              fare: 0,
              color: MODE_COLOR.WALK,
              coordinates: [toCoords, toCoords]
            }
          ];
        }

        let walkCoords: {latitude: number, longitude: number}[] = [fromCoords, toCoords];
        try {
          const walkPath = await getRoute(fromCoords, toCoords, 'foot-walking');
          if (walkPath && walkPath.coordinates.length > 0) {
            walkCoords = walkPath.coordinates;
            // Snap precisely
            walkCoords[0] = fromCoords;
            walkCoords[walkCoords.length - 1] = toCoords;
          }
        } catch (e) {}

        return [{
          type: 'walk',
          label: isStart ? `Walk to ${targetName}` : `Walk to destination`,
          detail: `${dist.toFixed(2)} km · ~${walkMin} min`,
          duration: walkMin,
          fare: 0,
          color: MODE_COLOR.WALK,
          coordinates: walkCoords
        }];
      };

      const firstSteps = await createFlexSteps(from, startStation.coordinate, startStation.name, true);
      steps.push(...firstSteps);

      let currentLine: string | null = null;
      let segmentStart: Station | null = null;
      let totalFare = firstSteps.reduce((s, st) => s + st.fare, 0);
      let totalDuration = firstSteps.reduce((s, st) => s + st.duration, 0);
      let totalDist = getDistanceKm(from, startStation.coordinate);

      for (let i = 0; i < pathStations.length; i++) {
        const s = pathStations[i];
        const next = pathStations[i + 1];

        if (!segmentStart) {
          segmentStart = s;
          currentLine = s.line;
        }

        const isTransfer = next && GRAPH[s.id].find(e => e.to === next.id)?.type === 'transfer';
        const lineChange = next && next.line !== s.line && !isTransfer;
        const isEnd = !next;

        if (isTransfer || lineChange || isEnd) {
          const segmentCount = Math.abs(s.order - segmentStart.order);
          const fare = segmentStart.fare_base + (segmentCount * 2);
          const dur = segmentCount * 3;
          
          // Refined Rail Preference: 
          // 1. Keep train segment if it's > 1 stop.
          // 2. ALSO keep it if it's 1 stop but the distance is > 500m (since a Jeep might be stuck in traffic).
          const segDist = getDistanceKm(segmentStart.coordinate, s.coordinate);
          
          if (segmentCount > 1 || (segmentCount === 1 && segDist > 0.5)) {
            totalFare += fare;
            totalDuration += dur;
            
            // Build high-fidelity polyline for segment from RAIL_SHAPES
            let segmentCoords: {latitude: number, longitude: number}[] = [];
            const linePoints = RAIL_SHAPES[s.line];
            if (linePoints) {
              const startIdx = linePoints.findIndex(p => 
                Math.abs(p.latitude - segmentStart!.coordinate.latitude) < 0.0001 && 
                Math.abs(p.longitude - segmentStart!.coordinate.longitude) < 0.0001
              );
              const endIdx = linePoints.findIndex(p => 
                Math.abs(p.latitude - s.coordinate.latitude) < 0.0001 && 
                Math.abs(p.longitude - s.coordinate.longitude) < 0.0001
              );
              
              if (startIdx !== -1 && endIdx !== -1) {
                segmentCoords = startIdx < endIdx 
                  ? linePoints.slice(startIdx, endIdx + 1) 
                  : linePoints.slice(endIdx, startIdx + 1).reverse();
              }
            }

            // Fallback to stations if shape slice fails
            if (segmentCoords.length === 0) {
              const segmentStops = STATIONS.filter(st => 
                st.line === segmentStart!.line && 
                st.order >= Math.min(segmentStart!.order, s.order) && 
                st.order <= Math.max(segmentStart!.order, s.order)
              ).sort((a, b) => segmentStart!.order < s.order ? a.order - b.order : b.order - a.order);
              segmentCoords = segmentStops.map(st => st.coordinate);
            }
            
            steps.push({
              type: 'train',
              label: `${s.line} · ${segmentStart.name} → ${s.name}`,
              detail: `${segmentCount} stops · ${dur} min · ₱${fare}`,
              duration: dur,
              fare: fare,
              color: LINE_COLORS[s.line] || '#FF6B35',
              coordinates: segmentCoords
            });
          } else if (segmentCount === 1) {
             // If only 1 stop AND very short distance (<500m), then walking is truly better
             const walkSteps = await createFlexSteps(segmentStart.coordinate, s.coordinate, s.name, false);
             steps.push(...walkSteps);
             totalFare += walkSteps.reduce((sum, st) => sum + st.fare, 0);
             totalDuration += walkSteps.reduce((sum, st) => sum + st.duration, 0);
          }

          if (isTransfer) {
            const link = TRANSFER_LINKS.find(l => l.from === s.id && l.to === next.id)!;
            if (link.walkMin > 0) {
              let transferCoords: {latitude: number, longitude: number}[] = [s.coordinate, next.coordinate];
              try {
                const walkPath = await getRoute(s.coordinate, next.coordinate, 'foot-walking');
                if (walkPath && walkPath.coordinates.length > 0) {
                  transferCoords = walkPath.coordinates;
                  // Snap precisely
                  transferCoords[0] = s.coordinate;
                  transferCoords[transferCoords.length - 1] = next.coordinate;
                }
              } catch (e) {}

              steps.push({
                type: 'walk',
                label: `Transfer to ${next.line}`,
                detail: `Walk from ${s.name} to ${next.name} · ${link.walkMin} min`,
                duration: link.walkMin,
                fare: 0,
                color: MODE_COLOR.WALK,
                coordinates: transferCoords
              });
              totalDuration += link.walkMin;
            }
            segmentStart = null;
          } else if (lineChange) {
            segmentStart = next;
          }
        }
      }

      const lastSteps = await createFlexSteps(endStation.coordinate, to, '', false);
      steps.push(...lastSteps);
      
      totalDuration += lastSteps.reduce((s, st) => s + st.duration, 0);
      totalFare += lastSteps.reduce((s, st) => s + st.fare, 0);
      totalDist += getDistanceKm(endStation.coordinate, to);

      const firstStation = pathStations[0];
      return {
        type: 'train',
        line: `${typeLabel}: ${firstStation.line}`,
        label: pathStations.map(s => s.line).filter((v, i, a) => a.indexOf(v) === i).join(' → '),
        steps,
        totalDuration,
        totalFare,
        totalDistanceKm: totalDist,
        color: LINE_COLORS[firstStation.line]
      };
    };

    const fastPathIds = findShortestPath(startStation.id, endStation.id, 'duration');
    const cheapPathIds = findShortestPath(startStation.id, endStation.id, 'fare');

    const suggestions: CommuteSuggestion[] = [];
    const fastSuggestion = await buildSuggestion(fastPathIds, 'Fastest');
    if (fastSuggestion) suggestions.push(fastSuggestion);

    // Only add cheap suggestion if it's different or significantly cheaper
    if (JSON.stringify(cheapPathIds) !== JSON.stringify(fastPathIds)) {
      const cheapSuggestion = await buildSuggestion(cheapPathIds, 'Cheapest');
      if (cheapSuggestion) suggestions.push(cheapSuggestion);
    }

    if (suggestions.length === 0) return getRoadFallback(from, to);

    return {
      type: 'train',
      suggestions,
      totalDistanceKm: suggestions[0].totalDistanceKm || 0
    };

  } catch (err) {
    console.error('Commute routing error:', err);
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
    // Real-world fallback: ₱15 base (Bus/Modern Jeep) + ₱2.20 per km
    const fare = Math.round(15 + dist * 2.20);
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

