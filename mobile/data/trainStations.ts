export type Station = {
  id: string;
  name: string;
  line: 'MRT-3' | 'LRT-1' | 'LRT-2';
  order: number;
  coordinate: { latitude: number; longitude: number };
  fare_base: number;
};

export const STATIONS: Station[] = [
  // MRT-3 (North to South)
  { id: 'mrt-1', name: 'North Avenue', line: 'MRT-3', order: 1, coordinate: { latitude: 14.6522, longitude: 121.0323 }, fare_base: 13 },
  { id: 'mrt-2', name: 'Quezon Avenue', line: 'MRT-3', order: 2, coordinate: { latitude: 14.6432, longitude: 121.0385 }, fare_base: 13 },
  { id: 'mrt-3', name: 'GMA Kamuning', line: 'MRT-3', order: 3, coordinate: { latitude: 14.6354, longitude: 121.0432 }, fare_base: 13 },
  { id: 'mrt-4', name: 'Araneta Cubao', line: 'MRT-3', order: 4, coordinate: { latitude: 14.6236, longitude: 121.0528 }, fare_base: 13 },
  { id: 'mrt-5', name: 'Santolan-Annapolis', line: 'MRT-3', order: 5, coordinate: { latitude: 14.6016, longitude: 121.0578 }, fare_base: 13 },
  { id: 'mrt-6', name: 'Ortigas', line: 'MRT-3', order: 6, coordinate: { latitude: 14.5876, longitude: 121.0567 }, fare_base: 13 },
  { id: 'mrt-7', name: 'Shaw Boulevard', line: 'MRT-3', order: 7, coordinate: { latitude: 14.5812, longitude: 121.0534 }, fare_base: 13 },
  { id: 'mrt-8', name: 'Boni', line: 'MRT-3', order: 8, coordinate: { latitude: 14.5734, longitude: 121.0476 }, fare_base: 13 },
  { id: 'mrt-9', name: 'Guadalupe', line: 'MRT-3', order: 9, coordinate: { latitude: 14.5654, longitude: 121.0456 }, fare_base: 13 },
  { id: 'mrt-10', name: 'Buendia', line: 'MRT-3', order: 10, coordinate: { latitude: 14.5543, longitude: 121.0345 }, fare_base: 13 },
  { id: 'mrt-11', name: 'Ayala', line: 'MRT-3', order: 11, coordinate: { latitude: 14.5487, longitude: 121.0278 }, fare_base: 13 },
  { id: 'mrt-12', name: 'Magallanes', line: 'MRT-3', order: 12, coordinate: { latitude: 14.5412, longitude: 121.0198 }, fare_base: 13 },
  { id: 'mrt-13', name: 'Taft Avenue', line: 'MRT-3', order: 13, coordinate: { latitude: 14.5378, longitude: 121.0012 }, fare_base: 13 },

  // LRT-1 (North to South)
  { id: 'lrt1-1', name: 'Fernando Poe Jr.', line: 'LRT-1', order: 1, coordinate: { latitude: 14.6565, longitude: 120.9832 }, fare_base: 12 },
  { id: 'lrt1-2', name: 'Balintawak', line: 'LRT-1', order: 2, coordinate: { latitude: 14.6543, longitude: 120.9834 }, fare_base: 12 },
  { id: 'lrt1-3', name: 'Monumento', line: 'LRT-1', order: 3, coordinate: { latitude: 14.6543, longitude: 120.9834 }, fare_base: 12 },
  { id: 'lrt1-4', name: '5th Avenue', line: 'LRT-1', order: 4, coordinate: { latitude: 14.6432, longitude: 120.9823 }, fare_base: 12 },
  { id: 'lrt1-5', name: 'R. Papa', line: 'LRT-1', order: 5, coordinate: { latitude: 14.6354, longitude: 120.9812 }, fare_base: 12 },
  { id: 'lrt1-6', name: 'Abad Santos', line: 'LRT-1', order: 6, coordinate: { latitude: 14.6276, longitude: 120.9801 }, fare_base: 12 },
  { id: 'lrt1-7', name: 'Blumentritt', line: 'LRT-1', order: 7, coordinate: { latitude: 14.6198, longitude: 120.9790 }, fare_base: 12 },
  { id: 'lrt1-8', name: 'Tayuman', line: 'LRT-1', order: 8, coordinate: { latitude: 14.6120, longitude: 120.9779 }, fare_base: 12 },
  { id: 'lrt1-9', name: 'Bambang', line: 'LRT-1', order: 9, coordinate: { latitude: 14.6042, longitude: 120.9768 }, fare_base: 12 },
  { id: 'lrt1-10', name: 'Doroteo Jose', line: 'LRT-1', order: 10, coordinate: { latitude: 14.5987, longitude: 120.9812 }, fare_base: 12 },
  { id: 'lrt1-11', name: 'Carriedo', line: 'LRT-1', order: 11, coordinate: { latitude: 14.5932, longitude: 120.9834 }, fare_base: 12 },
  { id: 'lrt1-12', name: 'Central Terminal', line: 'LRT-1', order: 12, coordinate: { latitude: 14.5876, longitude: 120.9823 }, fare_base: 12 },
  { id: 'lrt1-13', name: 'United Nations', line: 'LRT-1', order: 13, coordinate: { latitude: 14.5798, longitude: 120.9812 }, fare_base: 12 },
  { id: 'lrt1-14', name: 'Pedro Gil', line: 'LRT-1', order: 14, coordinate: { latitude: 14.5720, longitude: 120.9801 }, fare_base: 12 },
  { id: 'lrt1-15', name: 'Quirino', line: 'LRT-1', order: 15, coordinate: { latitude: 14.5642, longitude: 120.9790 }, fare_base: 12 },
  { id: 'lrt1-16', name: 'Vito Cruz', line: 'LRT-1', order: 16, coordinate: { latitude: 14.5564, longitude: 120.9779 }, fare_base: 12 },
  { id: 'lrt1-17', name: 'Gil Puyat', line: 'LRT-1', order: 17, coordinate: { latitude: 14.5498, longitude: 120.9934 }, fare_base: 12 },
  { id: 'lrt1-18', name: 'Libertad', line: 'LRT-1', order: 18, coordinate: { latitude: 14.5432, longitude: 120.9956 }, fare_base: 12 },
  { id: 'lrt1-19', name: 'EDSA', line: 'LRT-1', order: 19, coordinate: { latitude: 14.5387, longitude: 121.0012 }, fare_base: 12 },
  { id: 'lrt1-20', name: 'Baclaran', line: 'LRT-1', order: 20, coordinate: { latitude: 14.5343, longitude: 120.9978 }, fare_base: 12 },

  // LRT-2 (West to East)
  { id: 'lrt2-1', name: 'Recto', line: 'LRT-2', order: 1, coordinate: { latitude: 14.5987, longitude: 120.9823 }, fare_base: 12 },
  { id: 'lrt2-2', name: 'Legarda', line: 'LRT-2', order: 2, coordinate: { latitude: 14.5998, longitude: 120.9934 }, fare_base: 12 },
  { id: 'lrt2-3', name: 'Pureza', line: 'LRT-2', order: 3, coordinate: { latitude: 14.6009, longitude: 121.0045 }, fare_base: 12 },
  { id: 'lrt2-4', name: 'V. Mapa', line: 'LRT-2', order: 4, coordinate: { latitude: 14.6020, longitude: 121.0156 }, fare_base: 12 },
  { id: 'lrt2-5', name: 'J. Ruiz', line: 'LRT-2', order: 5, coordinate: { latitude: 14.6031, longitude: 121.0267 }, fare_base: 12 },
  { id: 'lrt2-6', name: 'Gilmore', line: 'LRT-2', order: 6, coordinate: { latitude: 14.6042, longitude: 121.0323 }, fare_base: 12 },
  { id: 'lrt2-7', name: 'Betty Go-Belmonte', line: 'LRT-2', order: 7, coordinate: { latitude: 14.6098, longitude: 121.0378 }, fare_base: 12 },
  { id: 'lrt2-8', name: 'Araneta Cubao', line: 'LRT-2', order: 8, coordinate: { latitude: 14.6154, longitude: 121.0489 }, fare_base: 12 },
  { id: 'lrt2-9', name: 'Anonas', line: 'LRT-2', order: 9, coordinate: { latitude: 14.6198, longitude: 121.0534 }, fare_base: 12 },
  { id: 'lrt2-10', name: 'Katipunan', line: 'LRT-2', order: 10, coordinate: { latitude: 14.6276, longitude: 121.0712 }, fare_base: 12 },
  { id: 'lrt2-11', name: 'Santolan LRT', line: 'LRT-2', order: 11, coordinate: { latitude: 14.6223, longitude: 121.0860 }, fare_base: 12 },
  { id: 'lrt2-12', name: 'Marikina-Pasig LRT', line: 'LRT-2', order: 12, coordinate: { latitude: 14.6219, longitude: 121.0948 }, fare_base: 12 },
  { id: 'lrt2-13', name: 'Antipolo LRT', line: 'LRT-2', order: 13, coordinate: { latitude: 14.6152, longitude: 121.1221 }, fare_base: 12 },
];

const getDistance = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const R = 6371;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export const findNearestStation = (coords: { latitude: number; longitude: number }) => {
  return STATIONS.reduce((nearest, station) => {
    const dist = getDistance(coords, station.coordinate);
    const nearestDist = getDistance(coords, nearest.coordinate);
    return dist < nearestDist ? station : nearest;
  });
};

export const getTrainRoute = (from: Station, to: Station) => {
  if (from.line !== to.line) return null;

  const start = Math.min(from.order, to.order);
  const end = Math.max(from.order, to.order);
  const stops = STATIONS.filter(s => s.line === from.line && s.order >= start && s.order <= end)
    .sort((a, b) => from.order < to.order ? a.order - b.order : b.order - a.order);

  const stationCount = stops.length - 1;
  const fare = from.fare_base + (stationCount * 2);
  const durationMin = stationCount * 3;

  return { stops, fare, durationMin, stationCount };
};

export const LINE_COLORS: Record<string, string> = {
  'MRT-3': '#FF6B35',
  'LRT-1': '#00C853',
  'LRT-2': '#6C63FF',
};

// Transfer links between stations at the same interchange
export const TRANSFER_LINKS: { from: string; to: string; walkMin: number }[] = [
  // Araneta Cubao: MRT-3 <-> LRT-2 (walkable)
  { from: 'mrt-4', to: 'lrt2-8', walkMin: 5 },
  { from: 'lrt2-8', to: 'mrt-4', walkMin: 5 },
  // EDSA (Taft): MRT-3 ↔ LRT-1
  { from: 'mrt-13', to: 'lrt1-19', walkMin: 3 },
  { from: 'lrt1-19', to: 'mrt-13', walkMin: 3 },
  // Doroteo Jose: LRT-1 ↔ LRT-2 (Recto)
  { from: 'lrt1-10', to: 'lrt2-1', walkMin: 5 },
  { from: 'lrt2-1', to: 'lrt1-10', walkMin: 5 },
];

export const getTransferLink = (fromId: string, toId: string) =>
  TRANSFER_LINKS.find(t => t.from === fromId && t.to === toId) ?? null;
