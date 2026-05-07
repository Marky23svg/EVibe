import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, StatusBar, Dimensions, Animated, PanResponder, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { EV } from '@/constants/theme';
import { fetchStations } from '@/services/ocm';
import { getRoute, autoComplete } from '@/services/ors';
import { getCommuteRoute } from '@/services/commute';
import { useRouter } from 'expo-router';
import { createTrip, calculateTripCarbon, addExpense } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STATIONS as TRAIN_STATIONS, LINE_COLORS, resolveLineSegment } from '@/data/trainStations';
import { JEEP_SHAPES, RAIL_SHAPES } from '@/data/transitShapes';

const { height } = Dimensions.get('window');
const PEEK = 72;
const FULL = 420;

const MODES = [
  { key: 'walking', icon: 'walk', label: 'Walk', profile: 'foot-walking' },
  { key: 'biking', icon: 'bicycle', label: 'Bike', profile: 'cycling-regular' },
  { key: 'commute', icon: 'bus', label: 'Transit', profile: 'driving-car' },
  { key: 'ev', icon: 'flash', label: 'EV', profile: 'driving-car' },
];

export default function MapScreen() {
  const router = useRouter();
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originCoords, setOriginCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mode, setMode] = useState('ev');
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [routeActive, setRouteActive] = useState(false);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: string; durationMin: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [STATIONS, setSTATIONS] = useState<any[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [originSuggestions, setOriginSuggestions] = useState<any[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<any[]>([]);
  const [nearbyOriginStations, setNearbyOriginStations] = useState<any[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [activeField, setActiveField] = useState<'origin' | 'dest' | null>(null);
  const [commuteSteps, setCommuteSteps] = useState<any[]>([]);
  const [commuteSuggestions, setCommuteSuggestions] = useState<any[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [showTransitLayer, setShowTransitLayer] = useState(false);

  const resetRoute = () => {
    setRouteActive(false);
    setRouteCoords([]);
    setRouteInfo(null);
    setCommuteSteps([]);
    setCommuteSuggestions([]);
    setSelectedSuggestion(0);
    snapTo(PEEK);
    // Clear all stations then reload only nearby stations at origin
    setSTATIONS([]);
    setNearbyOriginStations([]);
    if (originCoords) {
      loadNearbyStations(originCoords);
    }
  };
  const [savingTrip, setSavingTrip] = useState(false);
  const originTimeout = useRef<any>(null);
  const destTimeout = useRef<any>(null);

  const mapRef = useRef<MapView>(null);
  const sheetAnim = useRef(new Animated.Value(PEEK)).current;
  const startY = useRef(PEEK);
  const handleScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(coords);
        const data = await fetchStations(coords.latitude, coords.longitude);
        setSTATIONS(data);
        setNearbyOriginStations(data); // Set nearby stations at initial location
      }
    })();
  }, []);

  // Aggressive cache clearing for performance
  useEffect(() => {
    // Immediate clear when route becomes inactive
    if (!routeActive) {
      setCommuteSuggestions([]);
      setCommuteSteps([]);
      setRouteCoords([]);
      setOriginSuggestions([]);
      setDestSuggestions([]);
      // Trim stations to last 20 to save memory
      setSTATIONS(prev => prev.slice(-20));
    }
  }, [routeActive]);

  useEffect(() => {
    // Clear unused caches every 30 seconds aggressively
    const cacheCleaner = setInterval(() => {
      if (!routeActive) {
        // Clear all heavy state when route is inactive
        setCommuteSuggestions([]);
        setCommuteSteps([]);
        setRouteCoords([]);
        setOriginSuggestions([]);
        setDestSuggestions([]);
        setNearbyOriginStations([]);
        // Aggressive: trim main stations list
        setSTATIONS(prev => prev.slice(-15));
        // Force garbage collection hint
        if (global.gc) global.gc();
      }
    }, 30000); // 30 seconds

    // Memory pressure handler - aggressive clearing
    const handleMemoryWarning = () => {
      console.log('Memory warning - aggressive cache clear...');
      setCommuteSuggestions([]);
      setCommuteSteps([]);
      setRouteCoords([]);
      setOriginSuggestions([]);
      setDestSuggestions([]);
      setNearbyOriginStations([]);
      setSTATIONS(prev => prev.slice(-10)); // Keep only 10 stations
    };

    return () => {
      clearInterval(cacheCleaner);
    };
  }, [routeActive]);

  const snapTo = (target: number, vy = 0) => {
    Animated.spring(sheetAnim, {
      toValue: target,
      velocity: vy,
      tension: 200,
      friction: 25,
      overshootClamping: true,
      useNativeDriver: false,
    }).start(() => {
      startY.current = target;
    });
    Animated.spring(handleScale, {
      toValue: 1,
      tension: 300,
      friction: 15,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => {
      (sheetAnim as any)._value !== undefined
        ? (startY.current = (sheetAnim as any)._value)
        : null;
      Animated.spring(handleScale, {
        toValue: 1.8,
        tension: 400,
        friction: 10,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderMove: (_, g) => {
      const next = Math.max(PEEK, Math.min(FULL, startY.current - g.dy));
      sheetAnim.setValue(next);
    },
    onPanResponderRelease: (_, g) => {
      const flickUp = g.vy < -0.3;
      const flickDown = g.vy > 0.3;
      const dragUp = g.dy < -10;
      const dragDown = g.dy > 10;

      if (flickUp || dragUp) {
        snapTo(FULL, g.vy * 20);
      } else if (flickDown || dragDown) {
        snapTo(PEEK, g.vy * 20);
      } else {
        const cur = (sheetAnim as any)._value ?? startY.current;
        snapTo(cur > (PEEK + FULL) / 2 ? FULL : PEEK);
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(handleScale, { toValue: 1, tension: 300, friction: 15, useNativeDriver: true }).start();
    },
  }), []);

  const selectedS = STATIONS.find(s => s.id === selectedStation);

  const stationMarkers = useMemo(() => STATIONS.map((s, index) => (
    <Marker key={`${s.id}-${index}`} coordinate={s.coordinate} onPress={() => handleStationPress(s.id)}>
      <View style={[styles.markerWrap, s.type === 'DC Fast' && styles.markerFast, selectedStation === s.id && styles.markerSelected]}>
        <Ionicons name="flash" size={14} color={EV.bg} />
      </View>
    </Marker>
  )), [STATIONS, selectedStation]);

  const handleOriginChange = async (text: string) => {
    setOrigin(text);
    setOriginCoords(null);
    if (originTimeout.current) clearTimeout(originTimeout.current);
    if (text.length < 3) { setOriginSuggestions([]); return; }
    originTimeout.current = setTimeout(async () => {
      try { setOriginSuggestions(await autoComplete(text, userLocation?.latitude, userLocation?.longitude)); }
      catch { setOriginSuggestions([]); }
    }, 600);
  };

  const handleDestChange = async (text: string) => {
    setDestination(text);
    setDestCoords(null);
    if (destTimeout.current) clearTimeout(destTimeout.current);
    if (text.length < 3) { setDestSuggestions([]); return; }
    destTimeout.current = setTimeout(async () => {
      try { setDestSuggestions(await autoComplete(text, userLocation?.latitude, userLocation?.longitude)); }
      catch { setDestSuggestions([]); }
    }, 600);
  };

  const loadNearbyStations = async (coords: { latitude: number; longitude: number }) => {
    setStationsLoading(true);
    try {
      const data = await fetchStations(coords.latitude, coords.longitude, 5);
      setSTATIONS(prev => {
        const existingIds = new Set(prev.map((s: { id: string }) => s.id));
        const newStations = data.filter((s: { id: string }) => !existingIds.has(s.id));
        const combined = [...prev, ...newStations];
        return combined.slice(-40); // Keep last 40
      });
      setNearbyOriginStations(prev => {
        const existingIds = new Set(prev.map((s: { id: string }) => s.id));
        const newStations = data.filter((s: { id: string }) => !existingIds.has(s.id));
        const combined = [...prev, ...newStations];
        return combined.slice(-40);
      });
    } catch (err) {
      console.log('Load nearby error:', err);
    } finally {
      setStationsLoading(false);
    }
  };

  const useCurrentLocation = async () => {
    if (!userLocation) return;
    setOriginCoords(userLocation);
    setOriginSuggestions([]);
    setOrigin('Getting location...');
    try {
      const results = await Location.reverseGeocodeAsync(userLocation);
      if (results.length > 0) {
        const a = results[0];
        const parts = [a.name, a.street, a.district, a.city].filter(Boolean);
        setOrigin(parts.join(', ') || '📍 My Location');
      } else {
        setOrigin('📍 My Location');
      }
    } catch {
      setOrigin('📍 My Location');
    }
    loadNearbyStations(userLocation);
  };

  const handleCalculateRoute = async () => {
    const from = originCoords;
    const to = destCoords;
    if (!from || !to) return;
    const selectedMode = MODES.find(m => m.key === mode)!;
    setRouteLoading(true);
    setCommuteSteps([]);
    setCommuteSuggestions([]);
    try {
      if (mode === 'commute') {
        const result = await getCommuteRoute(from, to);
        setSelectedSuggestion(0);
        setCommuteSuggestions(result.suggestions);
        setRouteInfo({ distanceKm: result.totalDistanceKm.toFixed(2), durationMin: result.suggestions[0]?.totalDuration || 0 });
        setRouteActive(true);
        setNearbyOriginStations([]);
        setSTATIONS([]); // Clear EV stations from map when using public transit
        snapTo(FULL);
        const firstSteps = result.suggestions[0]?.steps || [];
        const allCoords = firstSteps.flatMap((s: any) => s.coordinates || []);
        if (allCoords.length > 1) {
          mapRef.current?.fitToCoordinates(allCoords, {
            edgePadding: { top: 260, right: 40, bottom: FULL + 20, left: 40 },
            animated: true,
          });
        }
      } else {
        const result = await getRoute(from, to, selectedMode.profile);
        setRouteCoords(result.coordinates);
        setRouteInfo({ distanceKm: result.distanceKm, durationMin: result.durationMin });
        setRouteActive(true);
        snapTo(FULL);
        if (mode === 'ev') {
          loadNearbyStations(to); // Show stations at destination for EV mode
        } else {
          setNearbyOriginStations([]); // Clear stations for walking/biking
          setSTATIONS([]);
        }
        mapRef.current?.fitToCoordinates(result.coordinates, {
          edgePadding: { top: 260, right: 40, bottom: FULL + 20, left: 40 },
          animated: true,
        });
      }
    } catch (err: any) {
      console.log('Route error:', err?.response?.data || err?.message);
    } finally {
      setRouteLoading(false);
    }
  };

  const handleStationPress = (id: string) => {
    setSelectedStation(id);
    const s = STATIONS.find(x => x.id === id)!;
    mapRef.current?.animateToRegion({
      latitude: s.coordinate.latitude - 0.003,
      longitude: s.coordinate.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 600);
  };

  const handleNavigate = async () => {
    if (!selectedS || !userLocation) return;
    setRouteLoading(true);
    try {
      const result = await getRoute(userLocation, selectedS.coordinate);
      setRouteCoords(result.coordinates);
      setRouteInfo({ distanceKm: result.distanceKm, durationMin: result.durationMin });
      setRouteActive(true);
      snapTo(FULL);
      mapRef.current?.fitToCoordinates(result.coordinates, {
        edgePadding: { top: 120, right: 40, bottom: FULL + 20, left: 40 },
        animated: true,
      });
    } catch (err) {
      console.log('Route error', err);
    } finally {
      setRouteLoading(false);
    }
  };

  const locateMe = async () => {
    if (userLocation) {
      mapRef.current?.animateToRegion({ ...userLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
    }
  };

  const handleSaveTrip = async () => {
    if (!routeInfo) return;
    setSavingTrip(true);
    try {
      const userStr = await AsyncStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : {};
      if (!user.id) {
        setSavingTrip(false);
        return;
      }

      // For commute mode, use the selected suggestion's distance and fare
      let tripDistance = parseFloat(routeInfo.distanceKm);
      let tripFare = 0;
      if (mode === 'commute' && commuteSuggestions.length > 0) {
        const selectedRoute = commuteSuggestions[selectedSuggestion];
        tripDistance = selectedRoute.totalDistanceKm || tripDistance;
        tripFare = selectedRoute.totalFare || 0;
      }

      const tripRes = await createTrip({
        userId: user.id,
        origin: origin || 'Place A',
        destination: destination || 'Place B',
        distance: tripDistance,
        mode,
        budget: tripFare,
      });

      // Automatically add fare to budget if it's a commute trip with a cost
      if (tripFare > 0) {
        await addExpense({
          userId: user.id,
          category: 'commute',
          amount: tripFare,
          description: `Commute: ${origin || 'A'} to ${destination || 'B'}`,
          date: new Date().toISOString(),
          tripId: tripRes.data._id
        });
      }

      await calculateTripCarbon(tripRes.data._id, tripDistance, mode);
      await AsyncStorage.setItem('activeTrip', JSON.stringify(tripRes.data));
    } catch (err: any) {
      console.log('Save trip error:', err?.response?.data || err?.message);
    } finally {
      setSavingTrip(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {useMemo(() => (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          provider={undefined}
          initialRegion={{
            latitude: userLocation?.latitude ?? 12.8797,
            longitude: userLocation?.longitude ?? 121.7740,
            latitudeDelta: userLocation ? 0.05 : 8,
            longitudeDelta: userLocation ? 0.05 : 8,
          }}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}>
          
          {/* Transit Network Layer (All Lines) */}
          {showTransitLayer && Object.keys(RAIL_SHAPES).map(lineId => (
            <Polyline 
              key={`transit-line-${lineId}`} 
              coordinates={RAIL_SHAPES[lineId]} 
              strokeColor={LINE_COLORS[lineId]} 
              strokeWidth={3} 
              lineDashPattern={[1]}
              zIndex={1}
            />
          ))}

          {/* Jeepney Corridor Layer */}
          {showTransitLayer && JEEP_SHAPES.map((shape, idx) => (
            <Polyline 
              key={`jeep-shape-${idx}`} 
              coordinates={shape} 
              strokeColor={EV.info} 
              strokeWidth={2} 
              lineDashPattern={[2, 4]}
              zIndex={0}
            />
          ))}

          {showTransitLayer && TRAIN_STATIONS.map(s => (
            <Marker 
              key={`transit-dot-${s.id}`} 
              coordinate={s.coordinate} 
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={2}
            >
              <View style={{ 
                width: 10, 
                height: 10, 
                borderRadius: 5, 
                backgroundColor: LINE_COLORS[s.line], 
                borderWidth: 1.5, 
                borderColor: '#FFF',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.3,
                shadowRadius: 1,
              }} />
            </Marker>
          ))}
          {stationMarkers}
          {mode === 'commute' && commuteSuggestions.length > 0 && commuteSuggestions[selectedSuggestion]?.steps.map((step: any, idx: number) => {
            const coords = step.coordinates || [];
            return coords.length > 1 ? (
              <Polyline key={`step-${idx}`} coordinates={coords} strokeColor={step.color} strokeWidth={4} />
            ) : null;
          })}
          {mode !== 'commute' && routeCoords.length > 1 && (
            <Polyline coordinates={routeCoords} strokeColor={EV.primary} strokeWidth={4} />
          )}
        </MapView>
      ), [userLocation, showTransitLayer, stationMarkers, mode, commuteSuggestions, selectedSuggestion, routeCoords])}

      {/* Dynamic Island Style Route Bar */}
      {routeActive && routeInfo && (
        <View style={styles.dynamicIsland}>
          <TouchableOpacity onPress={resetRoute} style={styles.dynamicBackBtn}>
            <Ionicons name="arrow-back" size={16} color={EV.text} />
          </TouchableOpacity>
          
          <View style={styles.dynamicInfo}>
            <View style={styles.dynamicInfoItem}>
              <Ionicons name="navigate" size={11} color={EV.primary} />
              <Text style={styles.dynamicInfoVal}>{routeInfo.distanceKm} km</Text>
            </View>
            <View style={styles.dynamicDot} />
            <View style={styles.dynamicInfoItem}>
              <Ionicons name="time-outline" size={11} color={EV.accent} />
              <Text style={styles.dynamicInfoVal}>{routeInfo.durationMin} min</Text>
            </View>
          </View>
          
          <TouchableOpacity 
            style={styles.dynamicSaveBtn} 
            onPress={handleSaveTrip} 
            disabled={savingTrip}
          >
            {savingTrip ? (
              <ActivityIndicator size="small" color={EV.bg} />
            ) : (
              <>
                <Ionicons name="leaf" size={12} color={EV.bg} />
                <Text style={styles.dynamicSaveText}>Save</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Search overlay */}
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        {!routeActive && (
          <View style={styles.searchPanel}>
            {/* Place A */}
            <View style={styles.inputRow}>
              <View style={styles.dotA}><View style={styles.dotAInner} /></View>
              <TextInput
                style={styles.searchText}
                placeholder="Origin"
                placeholderTextColor={EV.textDim}
                value={origin}
                onChangeText={handleOriginChange}
                onFocus={() => setActiveField('origin')}
              />
              <TouchableOpacity onPress={useCurrentLocation}>
                <Ionicons name="locate" size={16} color={EV.primary} />
              </TouchableOpacity>
            </View>

            {originSuggestions.length > 0 && activeField === 'origin' && (
              <View style={styles.suggestionsBox}>
                {originSuggestions.map((s, i) => (
                  <TouchableOpacity key={i} style={[styles.suggestionItem, i < originSuggestions.length - 1 && styles.suggestionBorder]}
                    onPress={() => {
                      const coords = { latitude: s.latitude, longitude: s.longitude };
                      setOrigin(s.label);
                      setOriginCoords(coords);
                      setOriginSuggestions([]);
                      loadNearbyStations(coords);
                    }}>
                    <Ionicons name="location-outline" size={13} color={EV.primary} />
                    <Text style={styles.suggestionText} numberOfLines={1}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.dividerLine} />

            {/* Place B */}
            <View style={styles.inputRow}>
              <View style={styles.dotB} />
              <TextInput
                style={styles.searchText}
                placeholder="Set Location"
                placeholderTextColor={EV.textDim}
                value={destination}
                onChangeText={handleDestChange}
                onFocus={() => setActiveField('dest')}
              />
              {(origin || destination) && (
                <TouchableOpacity onPress={() => { setOrigin(''); setDestination(''); setOriginCoords(null); setDestCoords(null); setRouteActive(false); setRouteCoords([]); setRouteInfo(null); }}>
                  <Ionicons name="close-circle" size={16} color={EV.textDim} />
                </TouchableOpacity>
              )}
            </View>

            {destSuggestions.length > 0 && activeField === 'dest' && (
              <View style={styles.suggestionsBox}>
                {destSuggestions.map((s, i) => (
                  <TouchableOpacity key={i} style={[styles.suggestionItem, i < destSuggestions.length - 1 && styles.suggestionBorder]}
                    onPress={() => { 
                      const coords = { latitude: s.latitude, longitude: s.longitude };
                      setDestination(s.label); 
                      setDestCoords(coords); 
                      setDestSuggestions([]); 
                      loadNearbyStations(coords);
                    }}>
                    <Ionicons name="location-outline" size={13} color={EV.danger} />
                    <Text style={styles.suggestionText} numberOfLines={1}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Mode selector */}
            <View style={styles.modeRow}>
              {MODES.map(m => (
                <TouchableOpacity key={m.key} style={[styles.modeBtn, mode === m.key && styles.modeBtnActive]} onPress={() => {
                  setMode(m.key);
                  setCommuteSuggestions([]);
                  setRouteCoords([]);
                  setRouteInfo(null);
                  setRouteActive(false);
                }}>
                  <Ionicons name={m.icon as any} size={16} color={mode === m.key ? EV.bg : EV.textMuted} />
                  <Text style={[styles.modeLabel, mode === m.key && styles.modeLabelActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.goBtn, (!originCoords || !destCoords) && styles.goBtnDisabled]}
                onPress={handleCalculateRoute}
                disabled={!originCoords || !destCoords || routeLoading}>
                {routeLoading
                  ? <ActivityIndicator size="small" color={EV.bg} />
                  : <Ionicons name="arrow-forward" size={18} color={EV.bg} />}
              </TouchableOpacity>
            </View>

            {commuteSuggestions.length > 0 && (
              <View style={styles.routeBar}>
                <Ionicons name="bus" size={13} color={EV.info} />
                <Text style={styles.routeVal}>{commuteSuggestions.length} route{commuteSuggestions.length > 1 ? 's' : ''} found</Text>
                <Text style={styles.routeVal}>· {routeInfo?.distanceKm} km</Text>
              </View>
            )}
          </View>
        )}
      </SafeAreaView>

      {/* Map controls */}
      <Animated.View style={[styles.mapControls, { bottom: Animated.add(sheetAnim, new Animated.Value(12)) }]}>
        <TouchableOpacity style={styles.mapBtn} onPress={locateMe}>
          <Ionicons name="locate" size={20} color={EV.primary} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.mapBtn, showTransitLayer && { backgroundColor: EV.primary }]} 
          onPress={() => setShowTransitLayer(!showTransitLayer)}
        >
          <Ionicons name="layers" size={20} color={showTransitLayer ? EV.bg : EV.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View style={[styles.sheet, { height: sheetAnim }]}>
        <View {...panResponder.panHandlers} style={styles.sheetHeader}>
          <Animated.View style={[styles.handleBar, { transform: [{ scaleX: handleScale }] }]} />
          <View style={styles.peekRow}>
            <View style={styles.peekLeft}>
              <Text style={styles.sheetTitle}>{commuteSuggestions.length > 0 ? 'SELECT ROUTE' : 'NEARBY STATIONS'}</Text>
              <View style={styles.sheetBadge}>
                <Text style={styles.sheetBadgeText}>{STATIONS.length}</Text>
              </View>
            </View>
            <Ionicons name="chevron-up" size={16} color={EV.textDim} />
          </View>
        </View>

        {selectedS ? (
          <View style={styles.selectedDetail}>
            <View style={styles.selectedTop}>
              <View style={[styles.selectedIcon, selectedS.type === 'DC Fast' && styles.selectedIconFast]}>
                <Ionicons name="flash" size={22} color={EV.bg} />
              </View>
              <View style={styles.selectedInfo}>
                <Text style={styles.selectedName}>{selectedS.name}</Text>
                <View style={styles.selectedTags}>
                  <View style={[styles.tag, selectedS.type === 'DC Fast' && styles.tagFast]}>
                    <Text style={[styles.tagText, selectedS.type === 'DC Fast' && styles.tagTextFast]}>{selectedS.type}</Text>
                  </View>
                  <View style={styles.tag}><Text style={styles.tagText}>{selectedS.power}</Text></View>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedStation(null)}>
                <Ionicons name="close-circle" size={22} color={EV.textDim} />
              </TouchableOpacity>
            </View>
            <View style={styles.selectedStats}>
              {[
                { icon: 'cash-outline', val: selectedS.cost, lbl: 'Cost', color: EV.primary },
                { icon: 'time-outline', val: selectedS.time, lbl: 'Charge Time', color: EV.accent },
                { icon: 'battery-charging-outline', val: `${selectedS.available}/${selectedS.total}`, lbl: 'Available', color: EV.neon },
              ].map(item => (
                <View key={item.lbl} style={styles.selectedStat}>
                  <View style={[styles.selectedStatIcon, { backgroundColor: item.color + '20' }]}>
                    <Ionicons name={item.icon as any} size={16} color={item.color} />
                  </View>
                  <Text style={styles.selectedStatVal}>{item.val}</Text>
                  <Text style={styles.selectedStatLbl}>{item.lbl}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.navigateBtn} onPress={handleNavigate} disabled={routeLoading}>
              {routeLoading
                ? <ActivityIndicator color={EV.bg} />
                : <><Ionicons name="navigate" size={17} color={EV.bg} /><Text style={styles.navigateBtnText}>Navigate to Station</Text></>
              }
            </TouchableOpacity>
          </View>
        ) : commuteSuggestions.length > 0 ? (
          <ScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionTabs}>
              {commuteSuggestions.map((s: any, i: number) => {
                const label = s.line.includes('Fastest') ? 'FAST' : s.line.includes('Cheapest') ? 'CHEAP' : `${i + 1}`;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.suggestionTab, selectedSuggestion === i && { backgroundColor: EV.primary, borderColor: EV.primary }]}
                    onPress={() => {
                      setSelectedSuggestion(i);
                      const coords = s.steps.flatMap((st: any) => st.coordinates || []);
                      if (coords.length > 1) {
                        mapRef.current?.fitToCoordinates(coords, {
                          edgePadding: { top: 260, right: 40, bottom: FULL + 20, left: 40 },
                          animated: true,
                        });
                      }
                    }}>
                    <Text style={[styles.suggestionTabText, selectedSuggestion === i && { color: EV.bg }]}>{label}</Text>
                    <Text style={[styles.suggestionTabDur, selectedSuggestion === i && { color: EV.bg }]}>{s.totalDuration}m</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {commuteSuggestions[selectedSuggestion] && (() => {
              const suggestion = commuteSuggestions[selectedSuggestion];
              return (
                <View style={styles.journeyCard}>
                  <View style={styles.journeyHeader}>
                    <View style={styles.journeyHeaderLeft}>
                      <View style={[styles.journeyBadge, { backgroundColor: EV.primary }]}>
                        <Ionicons name="navigate" size={14} color={EV.bg} />
                        <Text style={styles.journeyBadgeText}>{suggestion.line}</Text>
                      </View>
                      <View>
                        <Text style={styles.journeyDuration}>{suggestion.totalDuration} min</Text>
                        <Text style={styles.journeyFare}>Total Fare: ₱{suggestion.totalFare}</Text>
                      </View>
                    </View>
                    <View style={styles.journeyHeaderRight}>
                       <Text style={styles.journeyDist}>{(suggestion.totalDistanceKm || 0).toFixed(1)} km</Text>
                    </View>
                  </View>
                  
                  <View style={styles.timeline}>
                    {suggestion.steps.map((step: any, i: number) => {
                      const isJeep = step.type === 'jeep';
                      const isTrain = step.type === 'train';
                      const isBus = step.type === 'bus';
                      const iconName = step.type === 'walk' ? 'walk' : isTrain ? 'train' : isJeep ? 'bus' : 'bus';
                      
                      return (
                        <View key={i} style={styles.timelineRow}>
                          <View style={styles.timelineLeft}>
                            <View style={[styles.timelineIcon, { backgroundColor: step.color + '20', borderColor: step.color }]}>
                              <Ionicons name={iconName as any} size={14} color={step.color} />
                            </View>
                            {i < suggestion.steps.length - 1 && (
                              <View style={[styles.timelineLine, { backgroundColor: step.color + '40' }]} />
                            )}
                          </View>
                          <View style={styles.timelineContent}>
                            <View style={styles.timelineMain}>
                              <Text style={styles.timelineLabel}>{step.label}</Text>
                              {step.fare > 0 && <Text style={styles.stepFareBadge}>₱{step.fare}</Text>}
                            </View>
                            <Text style={styles.timelineDetail}>{step.detail}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })()}
            <View style={{ height: 16 }} />
          </ScrollView>
        ) : (
          <View style={styles.sheetContent}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              snapToInterval={312} // card width + gap
              decelerationRate="fast"
              contentContainerStyle={styles.stationList}
            >
              {(nearbyOriginStations.length > 0 ? nearbyOriginStations : STATIONS).map((s, index) => (
                <TouchableOpacity key={`sheet-${s.id}-${index}`} style={styles.stationCard} onPress={() => handleStationPress(s.id)} activeOpacity={0.85}>
                  <View style={styles.stationCardTop}>
                    <View style={[styles.stationCardIcon, s.type === 'DC Fast' && styles.stationCardIconFast]}>
                      <Ionicons name="flash" size={16} color={EV.bg} />
                    </View>
                    <View style={[styles.availPill, s.available === 0 && styles.availPillEmpty]}>
                      <Text style={styles.availPillText}>{s.available}/{s.total}</Text>
                    </View>
                  </View>
                  <Text style={styles.stationCardName} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.stationCardType}>{s.type}</Text>
                  <View style={styles.stationCardDivider} />
                  <View style={styles.stationCardStats}>
                    <View style={styles.stationStat}><Text style={styles.stationStatVal}>{s.cost}</Text><Text style={styles.stationStatLbl}>Cost</Text></View>
                    <View style={styles.stationStat}><Text style={styles.stationStatVal}>{s.time}</Text><Text style={styles.stationStatLbl}>Time</Text></View>
                    <View style={styles.stationStat}><Text style={styles.stationStatVal}>{s.power}</Text><Text style={styles.stationStatLbl}>Power</Text></View>
                  </View>
                  <TouchableOpacity style={styles.cardNavBtn} onPress={() => handleStationPress(s.id)}>
                    <Ionicons name="navigate" size={14} color={EV.bg} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EV.bg },
  safeTop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },

  searchPanel: {
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: EV.bgCard + 'F8',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: EV.border,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dotA: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: EV.primary, alignItems: 'center', justifyContent: 'center' },
  dotAInner: { width: 4, height: 4, borderRadius: 2, backgroundColor: EV.primary },
  dotB: { width: 12, height: 12, borderRadius: 3, backgroundColor: EV.danger },
  dividerLine: { height: 1, backgroundColor: EV.border, marginVertical: 2, marginLeft: 22 },
  searchText: { flex: 1, color: EV.text, fontSize: 14, fontWeight: '500' },
  modeRow: { flexDirection: 'row', gap: 6, marginTop: 10, alignItems: 'center' },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: EV.bgSurface, borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: EV.border },
  modeBtnActive: { backgroundColor: EV.primary, borderColor: EV.primary },
  modeLabel: { color: EV.textDim, fontSize: 10, fontWeight: '700' },
  modeLabelActive: { color: EV.bg },
  goBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: EV.primary, alignItems: 'center', justifyContent: 'center' },
  goBtnDisabled: { backgroundColor: EV.border },

  routeBar: {
    flexDirection: 'row', alignItems: 'center', marginTop: 8,
    backgroundColor: EV.bgSurface, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: EV.primaryDark, gap: 10,
  },
  routeItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  routeVal: { fontSize: 12, fontWeight: '700', color: EV.text },
  routeDivider: { width: 1, height: 14, backgroundColor: EV.border },

  saveTripBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: EV.primary, borderRadius: 12, paddingVertical: 12,
    marginTop: 8,
  },
  saveTripText: { color: EV.bg, fontSize: 13, fontWeight: '800' },

  // Dynamic Island Style Route Bar
  dynamicIsland: {
    position: 'absolute',
    top: 50,
    left: '50%',
    transform: [{ translateX: -135 }],
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: EV.bgCard + 'F2',
    borderRadius: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 0.5,
    borderColor: EV.primary + '60',
    zIndex: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  dynamicBackBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: EV.bgSurface,
  },
  dynamicInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  dynamicInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dynamicInfoVal: {
    fontSize: 12,
    fontWeight: '600',
    color: EV.text,
  },
  dynamicDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: EV.textDim,
  },
  dynamicSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: EV.primary,
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  dynamicSaveText: {
    color: EV.bg,
    fontSize: 11,
    fontWeight: '700',
  },

  mapControls: { position: 'absolute', right: 16, gap: 10, zIndex: 5 },
  mapBtn: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: EV.bgCard + 'F0', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: EV.border,
  },

  markerWrap: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: EV.primaryDeep, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: EV.primary,
  },
  markerFast: { backgroundColor: EV.primary },
  markerSelected: {
    width: 38, height: 38, borderRadius: 12,
    borderColor: EV.white, borderWidth: 2.5,
    shadowColor: EV.primary, shadowOpacity: 0.8, shadowRadius: 8, elevation: 8,
  },

  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: EV.bgCard,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderBottomWidth: 0, borderColor: EV.border,
    zIndex: 20, overflow: 'hidden',
  },
  sheetHeader: {
    alignItems: 'center', paddingTop: 10,
    paddingBottom: 10, paddingHorizontal: 16, gap: 8,
  },
  handleBar: {
    width: 40, height: 5, borderRadius: 3,
    backgroundColor: EV.primary + '80',
  },
  peekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  peekLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { fontSize: 11, fontWeight: '700', color: EV.primary, letterSpacing: 1.5 },
  sheetBadge: { backgroundColor: EV.primary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  sheetBadgeText: { fontSize: 11, fontWeight: '800', color: EV.bg },

  sheetContent: { paddingHorizontal: 5, paddingBottom: 16 },
  nearbyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  nearbyTitle: { fontSize: 11, fontWeight: '700', color: EV.primary, letterSpacing: 1.2 },
  stationList: { gap: 12, paddingRight: 20, paddingLeft: 12 },
  stationCard: {
    width: 300, height: 170,
    backgroundColor: EV.bgSurface, borderRadius: 16,
    padding: 12, borderWidth: 1, borderColor: EV.border,
  },
  stationCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stationCardIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: EV.primaryDeep, alignItems: 'center', justifyContent: 'center' },
  stationCardIconFast: { backgroundColor: EV.primary },
  availPill: { backgroundColor: EV.bgCard, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: EV.primaryDark },
  availPillEmpty: { borderColor: EV.danger },
  availPillText: { fontSize: 10, color: EV.primary, fontWeight: '700' },
  stationCardName: { fontSize: 15, fontWeight: '700', color: EV.text, marginBottom: 1 },
  stationCardType: { fontSize: 10, color: EV.textMuted, marginBottom: 8 },
  stationCardDivider: { height: 1, backgroundColor: EV.border, marginBottom: 8 },
  stationCardStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  stationStat: { alignItems: 'center' },
  stationStatVal: { fontSize: 10, fontWeight: '700', color: EV.text },
  stationStatLbl: { fontSize: 9, color: EV.textMuted, marginTop: 1 },
  cardNavBtn: {
    alignSelf: 'flex-end',
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: EV.primary, alignItems: 'center', justifyContent: 'center',
  },

  selectedDetail: { flex: 1, paddingHorizontal: 16 },
  selectedTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  selectedIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: EV.primaryDeep, alignItems: 'center', justifyContent: 'center' },
  selectedIconFast: { backgroundColor: EV.primary },
  selectedInfo: { flex: 1 },
  selectedName: { fontSize: 16, fontWeight: '800', color: EV.text, marginBottom: 5 },
  selectedTags: { flexDirection: 'row', gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: EV.bgSurface, borderWidth: 1, borderColor: EV.border },
  tagFast: { backgroundColor: EV.primary + '20', borderColor: EV.primaryDark },
  tagText: { fontSize: 10, color: EV.textMuted, fontWeight: '600' },
  tagTextFast: { color: EV.primary },
  selectedStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  selectedStat: { alignItems: 'center', gap: 6 },
  selectedStatIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  selectedStatVal: { fontSize: 15, fontWeight: '800', color: EV.text },
  selectedStatLbl: { fontSize: 10, color: EV.textMuted },
  navigateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: EV.primary, borderRadius: 14, paddingVertical: 15,
  },
  navigateBtnText: { color: EV.bg, fontWeight: '800', fontSize: 15 },

  suggestionsBox: {
    marginHorizontal: 16,
    backgroundColor: EV.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: EV.border,
    overflow: 'hidden',
    marginTop: 4,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionBorder: { borderBottomWidth: 1, borderBottomColor: EV.border },
  suggestionText: { flex: 1, color: EV.text, fontSize: 13 },

  suggestionTabs: { flexDirection: 'row', gap: 8, paddingBottom: 10 },
  suggestionTab: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, borderColor: EV.border,
    backgroundColor: EV.bgSurface, minWidth: 52,
  },
  suggestionTabText: { fontSize: 13, fontWeight: '800', color: EV.text },
  suggestionTabDur: { fontSize: 10, color: EV.textMuted, marginTop: 2 },
  journeyCard: {
    backgroundColor: EV.bgSurface, borderRadius: 16, borderWidth: 1,
    borderColor: EV.border, marginBottom: 12, overflow: 'hidden', marginHorizontal: 0,
  },
  journeyHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderBottomWidth: 1, borderBottomColor: EV.border,
  },
  journeyHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  journeyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  journeyBadgeText: { color: EV.bg, fontSize: 11, fontWeight: '800' },
  journeyHeaderRight: { alignItems: 'flex-end' },
  journeyDist: { fontSize: 13, fontWeight: '700', color: EV.textMuted },
  journeyDuration: { color: EV.text, fontSize: 15, fontWeight: '800' },
  journeyFare: { color: EV.textMuted, fontSize: 11, marginTop: 2 },

  timeline: { padding: 14, gap: 0 },
  timelineRow: { flexDirection: 'row', gap: 12, minHeight: 52 },
  timelineLeft: { alignItems: 'center', width: 32 },
  timelineIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  timelineLine: { width: 2, flex: 1, marginVertical: 4, borderRadius: 1 },
  timelineContent: { flex: 1, paddingBottom: 16 },
  timelineMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  timelineLabel: { color: EV.text, fontSize: 13, fontWeight: '700' },
  stepFareBadge: { fontSize: 10, fontWeight: '800', color: EV.primary, backgroundColor: EV.primary + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  timelineDetail: { color: EV.textMuted, fontSize: 11, marginBottom: 4 },
  timelineDurationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timelineDuration: { color: EV.textDim, fontSize: 10 },
  timelineFare: { color: EV.primary, fontSize: 10, fontWeight: '700', marginLeft: 6 },
});