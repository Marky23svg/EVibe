import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, StatusBar, Dimensions, Animated, PanResponder, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { EV } from '@/constants/theme';
import { fetchStations } from '@/services/ocm';
import { getRoute, geocode, autoComplete } from '@/services/ors';
import { getCommuteRoute } from '@/services/commute';
import { useRouter } from 'expo-router';
import { createTrip, calculateTripCarbon } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { height } = Dimensions.get('window');
const PEEK = 72;
const FULL = 420;

const MODES = [
  { key: 'walking', icon: 'walk', label: 'Walk', profile: 'foot-walking' },
  { key: 'biking', icon: 'bicycle', label: 'Bike', profile: 'cycling-regular' },
  { key: 'commute', icon: 'bus', label: 'Bus', profile: 'driving-car' },
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

  const resetRoute = () => {
    setRouteActive(false);
    setRouteCoords([]);
    setRouteInfo(null);
    setCommuteSteps([]);
    setCommuteSuggestions([]);
    setSelectedSuggestion(0);
    snapTo(PEEK);
  };
  const [savingTrip, setSavingTrip] = useState(false);
  const originTimeout = useRef<any>(null);
  const destTimeout = useRef<any>(null);

  const mapRef = useRef<MapView>(null);
  const sheetAnim = useRef(new Animated.Value(PEEK)).current;
  const startY = useRef(PEEK);         // sheet height when finger touches down
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
      }
    })();
  }, []);

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
    onPanResponderGrant: (_, g) => {
      // capture current sheet height synchronously
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
      const flickUp   = g.vy < -0.3;
      const flickDown = g.vy > 0.3;
      const dragUp    = g.dy < -10;
      const dragDown  = g.dy > 10;

      if (flickUp || dragUp) {
        snapTo(FULL, g.vy * 20);
      } else if (flickDown || dragDown) {
        snapTo(PEEK, g.vy * 20);
      } else {
        // tiny movement — snap based on midpoint
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
      setNearbyOriginStations(data);
      setSTATIONS(data);
    } catch {
      setNearbyOriginStations([]);
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
        snapTo(FULL);
        // Draw first suggestion coords on map — fit bounds only
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
        const data = await fetchStations(to.latitude, to.longitude);
        setSTATIONS(data);
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

      // For commute mode, use the selected suggestion's distance
      let tripDistance = parseFloat(routeInfo.distanceKm);
      if (mode === 'commute' && commuteSuggestions.length > 0) {
        const selectedRoute = commuteSuggestions[selectedSuggestion];
        tripDistance = selectedRoute.totalDistanceKm || tripDistance;
      }

      const tripRes = await createTrip({
        userId: user.id,
        origin: origin || 'Place A',
        destination: destination || 'Place B',
        distance: tripDistance,
        mode,
        budget: 0,
      });

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
        {stationMarkers}
        {/* Draw route polylines - separate line for each step with geometry */}
        {mode === 'commute' && commuteSuggestions.length > 0 && commuteSuggestions[selectedSuggestion]?.steps.map((step: any, idx: number) => {
          const coords = step.coordinates || [];
          return coords.length > 1 ? (
            <Polyline key={`step-${idx}`} coordinates={coords} strokeColor={step.color} strokeWidth={4} />
          ) : null;
        })}
        {/* Single polyline for non-commute modes */}
        {mode !== 'commute' && routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={EV.primary} strokeWidth={4} />
        )}
      </MapView>

      {/* Floating back button + route info strip when viewing route */}
      {routeActive && (
        <TouchableOpacity style={styles.routeBackBtn} onPress={resetRoute}>
          <Ionicons name="arrow-back" size={20} color={EV.text} />
          <Text style={styles.routeBackText}>Back</Text>
        </TouchableOpacity>
      )}

      {routeActive && routeInfo && (
        <View style={styles.routeFloatingBar}>
          <View style={styles.routeFloatItem}>
            <Ionicons name="navigate" size={13} color={EV.primary} />
            <Text style={styles.routeFloatVal}>{routeInfo.distanceKm} km</Text>
          </View>
          <View style={styles.routeFloatDivider} />
          <View style={styles.routeFloatItem}>
            <Ionicons name="time-outline" size={13} color={EV.accent} />
            <Text style={styles.routeFloatVal}>{routeInfo.durationMin} min</Text>
          </View>
          <View style={styles.routeFloatDivider} />
          <TouchableOpacity style={styles.routeFloatSave} onPress={handleSaveTrip} disabled={savingTrip}>
            {savingTrip
              ? <ActivityIndicator size="small" color={EV.bg} />
              : <><Ionicons name="leaf" size={13} color={EV.bg} /><Text style={styles.routeFloatSaveText}>Save</Text></>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Search overlay */}
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        {/* App header — hidden when viewing route */}
        {!routeActive && (
          <>
            <View style={styles.appHeader}>
              <Image source={require('@/assets/images/logoGogreen.jpeg')} style={styles.appHeaderLogo} />
              <Text style={styles.appHeaderTitle}>GoGreen</Text>
            </View>
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
              <TouchableOpacity onPress={() => { setOrigin(''); setDestination(''); setOriginCoords(null); setDestCoords(null); setRouteActive(false); setRouteCoords([]); setRouteInfo(null); setNearbyOriginStations([]); }}>
                <Ionicons name="close-circle" size={16} color={EV.textDim} />
              </TouchableOpacity>
            )}
          </View>

          {destSuggestions.length > 0 && activeField === 'dest' && (
            <View style={styles.suggestionsBox}>
              {destSuggestions.map((s, i) => (
                <TouchableOpacity key={i} style={[styles.suggestionItem, i < destSuggestions.length - 1 && styles.suggestionBorder]}
                  onPress={() => { setDestination(s.label); setDestCoords({ latitude: s.latitude, longitude: s.longitude }); setDestSuggestions([]); }}>
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

          {routeActive && routeInfo && (
            <View style={styles.routeBar}>
              <View style={styles.routeItem}><Ionicons name="navigate" size={13} color={EV.primary} /><Text style={styles.routeVal}>{routeInfo.distanceKm} km</Text></View>
              <View style={styles.routeDivider} />
              <View style={styles.routeItem}><Ionicons name="time-outline" size={13} color={EV.accent} /><Text style={styles.routeVal}>{routeInfo.durationMin} min</Text></View>
              <TouchableOpacity style={{ marginLeft: 'auto' as any }} onPress={() => { setRouteActive(false); setRouteCoords([]); setRouteInfo(null); setCommuteSteps([]); }}>
                <Ionicons name="close" size={14} color={EV.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {routeActive && routeInfo && (
            <TouchableOpacity style={styles.saveTripBtn} onPress={handleSaveTrip} disabled={savingTrip}>
              {savingTrip ? (
                <ActivityIndicator size="small" color={EV.bg} />
              ) : (
                <>
                  <Ionicons name="leaf" size={16} color={EV.bg} />
                  <Text style={styles.saveTripText}>Save Trip & View Carbon</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {commuteSuggestions.length > 0 && (
            <View style={styles.routeBar}>
              <Ionicons name="bus" size={13} color={EV.info} />
              <Text style={styles.routeVal}>{commuteSuggestions.length} route{commuteSuggestions.length > 1 ? 's' : ''} found</Text>
              <Text style={styles.routeVal}>· {routeInfo?.distanceKm} km</Text>
            </View>
          )}
        </View>
          </>
        )}
      </SafeAreaView>

      {/* Map controls */}
      <Animated.View style={[styles.mapControls, { bottom: Animated.add(sheetAnim, new Animated.Value(12)) }]}>
        <TouchableOpacity style={styles.mapBtn} onPress={locateMe}>
          <Ionicons name="locate" size={20} color={EV.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapBtn}>
          <Ionicons name="layers-outline" size={20} color={EV.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View style={[styles.sheet, { height: sheetAnim }]}>

        {/* Drag handle */}
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

        {/* Selected station */}
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
              {commuteSuggestions.map((s: any, i: number) => (
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
                  <Text style={[styles.suggestionTabText, selectedSuggestion === i && { color: EV.bg }]}>{i + 1}</Text>
                  <Text style={[styles.suggestionTabDur, selectedSuggestion === i && { color: EV.bg }]}>{s.totalDuration}m</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {commuteSuggestions[selectedSuggestion] && (() => {
              const suggestion = commuteSuggestions[selectedSuggestion];
              return (
                <View style={[styles.journeyCard, { borderColor: EV.primary }]}>
                  <View style={styles.journeyHeader}>
                    <View style={styles.journeyHeaderLeft}>
                      <View style={[styles.journeyBadge, { backgroundColor: EV.primary }]}>
                        <Text style={styles.journeyBadgeText}>{suggestion.line}</Text>
                      </View>
                      <View>
                        <Text style={styles.journeyDuration}>{suggestion.totalDuration} min</Text>
                        <Text style={styles.journeyFare}>₱{suggestion.totalFare} estimated</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.timeline}>
                    {suggestion.steps.map((step: any, i: number) => (
                      <View key={i} style={styles.timelineRow}>
                        <View style={styles.timelineLeft}>
                          <View style={[styles.timelineIcon, { backgroundColor: step.color + '20', borderColor: step.color }]}>
                            <Ionicons name={step.type === 'walk' ? 'walk' : step.type === 'train' ? 'train' : step.type === 'jeep' ? 'car' : 'bus'} size={14} color={step.color} />
                          </View>
                          {i < suggestion.steps.length - 1 && (
                            <View style={[styles.timelineLine, { backgroundColor: step.color + '40' }]} />
                          )}
                        </View>
                        <View style={styles.timelineContent}>
                          <Text style={styles.timelineLabel}>{step.label}</Text>
                          <Text style={styles.timelineDetail}>{step.detail}</Text>
                          {step.duration > 0 && (
                            <View style={styles.timelineDurationRow}>
                              <Ionicons name="time-outline" size={10} color={EV.textDim} />
                              <Text style={styles.timelineDuration}>{step.duration} min</Text>
                              {step.fare > 0 && <Text style={styles.timelineFare}>₱{step.fare}</Text>}
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}
            <View style={{ height: 16 }} />
          </ScrollView>
        ) : (
          <View style={styles.sheetContent}>
            {nearbyOriginStations.length > 0 && (
              <View style={styles.nearbyHeader}>
                <Ionicons name="flash" size={13} color={EV.primary} />
                <Text style={styles.nearbyTitle}>NEAR STARTING POINT</Text>
                {stationsLoading && <ActivityIndicator size="small" color={EV.primary} style={{ marginLeft: 6 }} />}
              </View>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stationList}>
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

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0a1a0f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6DBF8A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#050F0A' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#0D2B1A' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1A4A2A' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#112E1C' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#00C853' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#030a06' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0A1F14' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0d2b1a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#0A1F14' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1A4A2A' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#071409' }] },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EV.bg },
  safeTop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },

  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8, marginTop: 4 },
  appHeaderLogo: { width: 36, height: 36, borderRadius: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 },
  appHeaderTitle: { fontSize: 18, fontWeight: '800', color: EV.text },

  searchPanel: {
    marginHorizontal: 12,
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

  routeBackBtn: {
    position: 'absolute',
    top: 56,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: EV.bgCard + 'F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: EV.border,
    zIndex: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  routeBackText: { color: EV.text, fontSize: 13, fontWeight: '700' },

  routeFloatingBar: {
    position: 'absolute',
    top: 56,
    left: 100,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: EV.bgCard + 'F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: EV.border,
    zIndex: 15,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  routeFloatItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  routeFloatDivider: { width: 1, height: 14, backgroundColor: EV.border },
  routeFloatVal: { fontSize: 12, fontWeight: '700', color: EV.text },
  routeFloatSave: {
    marginLeft: 'auto' as any,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: EV.primary, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  routeFloatSaveText: { color: EV.bg, fontSize: 11, fontWeight: '800' },

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

  sheetContent: { paddingHorizontal: 16, paddingBottom: 16 },
  nearbyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  nearbyTitle: { fontSize: 11, fontWeight: '700', color: EV.primary, letterSpacing: 1.2 },
  stationList: { gap: 10, paddingRight: 16 },
  stationCard: {
    width: 150, height: 180,
    backgroundColor: EV.bgSurface, borderRadius: 16,
    padding: 12, borderWidth: 1, borderColor: EV.border,
  },
  stationCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stationCardIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: EV.primaryDeep, alignItems: 'center', justifyContent: 'center' },
  stationCardIconFast: { backgroundColor: EV.primary },
  availPill: { backgroundColor: EV.bgCard, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: EV.primaryDark },
  availPillEmpty: { borderColor: EV.danger },
  availPillText: { fontSize: 9, color: EV.primary, fontWeight: '700' },
  stationCardName: { fontSize: 12, fontWeight: '700', color: EV.text, marginBottom: 1 },
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
  cardNavBtnText: { fontSize: 12, fontWeight: '700', color: EV.bg },

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

  commuteSteps: { marginTop: 6, backgroundColor: EV.bgSurface, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: EV.border },
  commuteStep: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderBottomWidth: 1, borderBottomColor: EV.border },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  stepInfo: { flex: 1 },
  stepLabel: { color: EV.text, fontSize: 11, fontWeight: '700' },
  stepDetail: { color: EV.textMuted, fontSize: 10, marginTop: 1 },
  commuteSuggestion: { backgroundColor: EV.bgSurface, borderRadius: 10, borderWidth: 1, borderColor: EV.border, marginTop: 6, overflow: 'hidden' },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderBottomWidth: 1, borderBottomColor: EV.border },
  suggestionBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  suggestionBadgeText: { color: EV.bg, fontSize: 10, fontWeight: '800' },
  suggestionDuration: { color: EV.text, fontSize: 11, fontWeight: '700', flex: 1 },
  suggestionFare: { color: EV.primary, fontSize: 11, fontWeight: '800' },

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
  journeyBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  journeyBadgeText: { color: EV.bg, fontSize: 11, fontWeight: '800' },
  journeyDuration: { color: EV.text, fontSize: 15, fontWeight: '800' },
  journeyFare: { color: EV.textMuted, fontSize: 11, marginTop: 2 },
  selectedBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  selectedBadgeText: { fontSize: 10, fontWeight: '700' },

  timeline: { padding: 14, gap: 0 },
  timelineRow: { flexDirection: 'row', gap: 12, minHeight: 52 },
  timelineLeft: { alignItems: 'center', width: 32 },
  timelineIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  timelineLine: { width: 2, flex: 1, marginVertical: 4, borderRadius: 1 },
  timelineContent: { flex: 1, paddingBottom: 12 },
  timelineLabel: { color: EV.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  timelineDetail: { color: EV.textMuted, fontSize: 11, marginBottom: 4 },
  timelineDurationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timelineDuration: { color: EV.textDim, fontSize: 10 },
  timelineFare: { color: EV.primary, fontSize: 10, fontWeight: '700', marginLeft: 6 },
});
