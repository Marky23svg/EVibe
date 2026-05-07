import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EV } from '@/constants/theme';
import * as Location from 'expo-location';
import { getRoute, geocode, autoComplete, reverseGeocode } from '@/services/ors';
import { createTrip, calculateTripCarbon } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MODES = [
  { key: 'walk', label: 'Walk', icon: 'walk', profile: 'foot-walking', co2: 0, color: EV.primary },
  { key: 'bike', label: 'Bike', icon: 'bicycle', profile: 'cycling-regular', co2: 0, color: EV.accent },
  { key: 'commute', label: 'Commute', icon: 'bus', profile: 'driving-car', co2: 0.05, color: EV.info },
  { key: 'ev', label: 'EV', icon: 'flash', profile: 'driving-car', co2: 0.02, color: EV.neon },
];

const CO2_CAR = 0.21;

export default function SetupScreen() {
  const router = useRouter();
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originCoords, setOriginCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mode, setMode] = useState('ev');
  const [loading, setLoading] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: string; durationMin: number } | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<any[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<any[]>([]);
  const [activeField, setActiveField] = useState<'origin' | 'dest' | null>(null);

  const selectedMode = MODES.find(m => m.key === mode)!;

  const handleOriginChange = async (text: string) => {
    setOrigin(text);
    setOriginCoords(null);
    setRouteInfo(null);
    if (text.length < 3) { setOriginSuggestions([]); return; }
    try {
      const results = await autoComplete(text);
      setOriginSuggestions(results);
    } catch { setOriginSuggestions([]); }
  };

  const handleDestChange = async (text: string) => {
    setDestination(text);
    setDestCoords(null);
    setRouteInfo(null);
    if (text.length < 3) { setDestSuggestions([]); return; }
    try {
      const results = await autoComplete(text);
      setDestSuggestions(results);
    } catch { setDestSuggestions([]); }
  };

  const selectOrigin = (s: any) => {
    setOrigin(s.label);
    setOriginCoords({ latitude: s.latitude, longitude: s.longitude });
    setOriginSuggestions([]);
  };

  const selectDest = (s: any) => {
    setDestination(s.label);
    setDestCoords({ latitude: s.latitude, longitude: s.longitude });
    setDestSuggestions([]);
  };

  const useCurrentLocation = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission denied');
      const loc = await Location.getCurrentPositionAsync({});
      setOriginCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setOrigin('📍 Current Location');
      setOriginSuggestions([]);
    } catch {
      Alert.alert('Error', 'Could not get location');
    } finally {
      setLocLoading(false);
    }
  };

  const calculateRoute = async () => {
    if (!originCoords && !origin) return Alert.alert('Error', 'Enter a starting point');
    if (!destCoords && !destination) return Alert.alert('Error', 'Enter a destination');
    setLoading(true);
    try {
      const from = originCoords ?? await geocode(origin);
      const to = destCoords ?? await geocode(destination);
      console.log('From:', from, 'To:', to, 'Profile:', selectedMode.profile);
      const result = await getRoute(from, to, selectedMode.profile);
      console.log('Route result:', result);
      setRouteInfo({ distanceKm: result.distanceKm, durationMin: result.durationMin });
    } catch (err: any) {
      console.log('Route error:', err?.response?.data || err?.message);
      Alert.alert('Error', 'Could not calculate route. Try different locations.');
    } finally {
      setLoading(false);
    }
  };

  const startTrip = async () => {
    if (!routeInfo) return;
    setLoading(true);
    try {
      const userStr = await AsyncStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : {};
      if (!user.id) {
        Alert.alert('Error', 'Please login first');
        setLoading(false);
        return;
      }

      // Create trip
      const tripRes = await createTrip({
        userId: user.id,
        origin,
        destination,
        distance: parseFloat(routeInfo.distanceKm),
        mode,
        budget: 0,
      });

      // Calculate carbon data
      await calculateTripCarbon(tripRes.data._id, parseFloat(routeInfo.distanceKm), mode);

      // Save to AsyncStorage
      await AsyncStorage.setItem('activeTrip', JSON.stringify(tripRes.data));

      router.push('/(tabs)');
    } catch (err: any) {
      console.log('Start trip error:', err?.response?.data || err?.message);
      Alert.alert('Error', 'Failed to start trip');
    } finally {
      setLoading(false);
    }
  };

  const co2Saved = routeInfo
    ? ((CO2_CAR - selectedMode.co2) * parseFloat(routeInfo.distanceKm)).toFixed(2)
    : '--';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Plan Your Trip</Text>
      <Text style={styles.subtitle}>Where are you going?</Text>

      {/* Place A */}
      <View style={styles.inputWrapper}>
        <View style={styles.inputRow}>
          <View style={styles.dotA}><View style={styles.dotAInner} /></View>
          <TextInput
            style={styles.input}
            placeholder="Place A — Starting point"
            placeholderTextColor={EV.textDim}
            value={origin}
            onChangeText={handleOriginChange}
            onFocus={() => setActiveField('origin')}
          />
          <TouchableOpacity onPress={useCurrentLocation} style={styles.locBtn}>
            {locLoading
              ? <ActivityIndicator size="small" color={EV.primary} />
              : <Ionicons name="locate" size={18} color={EV.primary} />}
          </TouchableOpacity>
        </View>
        {originSuggestions.length > 0 && activeField === 'origin' && (
          <View style={styles.suggestions}>
            {originSuggestions.map((s, i) => (
              <TouchableOpacity key={i} style={[styles.suggestionItem, i < originSuggestions.length - 1 && styles.suggestionBorder]} onPress={() => selectOrigin(s)}>
                <Ionicons name="location-outline" size={13} color={EV.primary} />
                <Text style={styles.suggestionText} numberOfLines={1}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Place B */}
      <View style={styles.inputWrapper}>
        <View style={styles.inputRow}>
          <View style={styles.dotB} />
          <TextInput
            style={styles.input}
            placeholder="Place B — Destination"
            placeholderTextColor={EV.textDim}
            value={destination}
            onChangeText={handleDestChange}
            onFocus={() => setActiveField('dest')}
          />
        </View>
        {destSuggestions.length > 0 && activeField === 'dest' && (
          <View style={styles.suggestions}>
            {destSuggestions.map((s, i) => (
              <TouchableOpacity key={i} style={[styles.suggestionItem, i < destSuggestions.length - 1 && styles.suggestionBorder]} onPress={() => selectDest(s)}>
                <Ionicons name="location-outline" size={13} color={EV.danger} />
                <Text style={styles.suggestionText} numberOfLines={1}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Transport Mode */}
      <Text style={styles.label}>Choose Transport Mode</Text>
      <View style={styles.modeRow}>
        {MODES.map(m => (
          <TouchableOpacity
            key={m.key}
            style={[styles.modeBtn, mode === m.key && { borderColor: m.color, backgroundColor: m.color + '18' }]}
            onPress={() => { setMode(m.key); setRouteInfo(null); }}>
            <Ionicons name={m.icon as any} size={24} color={mode === m.key ? m.color : EV.textDim} />
            <Text style={[styles.modeLabel, mode === m.key && { color: m.color }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.calcBtn} onPress={calculateRoute} disabled={loading}>
        {loading
          ? <ActivityIndicator color={EV.bg} />
          : <Text style={styles.calcBtnText}>Calculate Route</Text>}
      </TouchableOpacity>

      {routeInfo && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📍 Route Details</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Distance</Text>
            <Text style={styles.infoValue}>{routeInfo.distanceKm} km</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Duration</Text>
            <Text style={styles.infoValue}>{routeInfo.durationMin} min</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>CO₂ Saved vs Car</Text>
            <Text style={[styles.infoValue, { color: EV.primary }]}>{co2Saved} kg 🌿</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Mode</Text>
            <Text style={styles.infoValue}>{selectedMode.label}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, !routeInfo && styles.buttonDisabled]}
        onPress={startTrip}
        disabled={!routeInfo || loading}>
        {loading ? <ActivityIndicator color={EV.bg} /> : <Text style={styles.buttonText}>Start Trip →</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EV.bg },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  backBtn: { marginBottom: 20 },
  backText: { color: EV.primary, fontSize: 16 },
  title: { fontSize: 26, fontWeight: 'bold', color: EV.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: EV.textMuted, marginBottom: 24 },
  inputWrapper: { marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: EV.bgCard, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: EV.border },
  dotA: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: EV.primary, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  dotAInner: { width: 5, height: 5, borderRadius: 3, backgroundColor: EV.primary },
  dotB: { width: 14, height: 14, borderRadius: 3, backgroundColor: EV.danger, marginRight: 10 },
  input: { flex: 1, color: EV.text, fontSize: 15, paddingVertical: 16 },
  locBtn: { padding: 8 },
  suggestions: { backgroundColor: EV.bgCard, borderRadius: 12, borderWidth: 1, borderColor: EV.border, marginTop: 4, overflow: 'hidden' },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  suggestionBorder: { borderBottomWidth: 1, borderBottomColor: EV.border },
  suggestionText: { flex: 1, color: EV.text, fontSize: 13 },
  label: { color: EV.textMuted, fontSize: 13, marginBottom: 12, marginTop: 8 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  modeBtn: { flex: 1, backgroundColor: EV.bgCard, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: EV.border, gap: 6 },
  modeLabel: { color: EV.textDim, fontWeight: '700', fontSize: 11 },
  calcBtn: { backgroundColor: EV.primaryDark, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  calcBtnText: { color: EV.bg, fontWeight: 'bold', fontSize: 15 },
  infoCard: { backgroundColor: EV.bgCard, borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: EV.border },
  infoTitle: { color: EV.primary, fontWeight: 'bold', fontSize: 15, marginBottom: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  infoLabel: { color: EV.textMuted, fontSize: 14 },
  infoValue: { color: EV.text, fontWeight: '600', fontSize: 14 },
  button: { backgroundColor: EV.primary, borderRadius: 14, padding: 18, alignItems: 'center' },
  buttonDisabled: { backgroundColor: EV.border },
  buttonText: { color: EV.bg, fontWeight: 'bold', fontSize: 16 },
});
