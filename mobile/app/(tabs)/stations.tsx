import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar, ActivityIndicator, Image, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EV } from '@/constants/theme';
import * as Location from 'expo-location';
import { fetchStations } from '@/services/ocm';

const FILTERS = ['All', 'DC Fast', 'AC Level 2'];

function AvailabilityBar({ available, total }: { available: number; total: number }) {
  const pct = total > 0 ? available / total : 0;
  const color = pct > 0.5 ? EV.primary : pct > 0 ? EV.warning : EV.danger;
  return (
    <View style={styles.availBar}>
      {[...Array(total)].map((_, i) => (
        <View
          key={i}
          style={[
            styles.availSegment,
            { backgroundColor: i < available ? color : EV.bgSurface },
          ]}
        />
      ))}
    </View>
  );
}

export default function StationsScreen() {
  const [filter, setFilter] = useState('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStations();
  }, []);

  const loadStations = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      console.log('Location:', loc.coords.latitude, loc.coords.longitude);
      const data = await fetchStations(loc.coords.latitude, loc.coords.longitude);
      console.log('Stations fetched:', data.length);
      setStations(data);
    } catch (err) {
      console.log('Failed to load stations:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(
    () => (filter === 'All' ? stations : stations.filter(s => s.type.includes(filter))),
    [filter, stations]
  );

  const renderStationItem = useCallback(({ item: station }: { item: any }) => {
    const isExpanded = expanded === station.id;
    const isFast = station.type === 'DC Fast';
    return (
      <TouchableOpacity
        key={station.id}
        style={[styles.card, isExpanded && styles.cardExpanded]}
        onPress={() => setExpanded(isExpanded ? null : station.id)}
        activeOpacity={0.85}>

      {/* Distance badge */}
      <View style={styles.distanceBadge}>
        <Text style={styles.distanceBadgeText}>{station.distance}</Text>
      </View>

      <View style={styles.cardMain}>
        {/* Icon */}
        <View style={[styles.iconWrap, isFast && styles.iconWrapFast]}>
          <Ionicons name="flash" size={22} color={EV.bg} />
          {isFast && <View style={styles.fastGlow} />}
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={styles.stationName}>{station.name}</Text>
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={11} color={EV.textDim} />
            <Text style={styles.stationAddr}>{station.address}</Text>
          </View>

          <View style={styles.tagsRow}>
            <View style={[styles.typeTag, isFast && styles.typeTagFast]}>
              <Text style={[styles.typeTagText, isFast && styles.typeTagTextFast]}>{station.type}</Text>
            </View>
            <View style={styles.powerTag}>
              <Text style={styles.powerTagText}>{station.power}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Availability */}
      <View style={styles.availRow}>
        <View style={styles.availLeft}>
          <Text style={styles.availLabel}>Availability</Text>
          <AvailabilityBar available={station.available} total={station.total} />
        </View>
        <View style={styles.availRight}>
          <Text style={styles.availCount}>
            <Text style={{ color: station.available > 0 ? EV.primary : EV.danger }}>
              {station.available}
            </Text>
            /{station.total}
          </Text>
          <Text style={styles.availSub}>open</Text>
        </View>
      </View>

      {/* Expanded */}
      {isExpanded && (
        <View style={styles.expandedContent}>
          <View style={styles.expandedDivider} />

          <View style={styles.detailsGrid}>
            <View style={styles.detailBox}>
              <View style={[styles.detailIcon, { backgroundColor: EV.primary + '20' }]}>
                <Ionicons name="cash-outline" size={16} color={EV.primary} />
              </View>
              <Text style={styles.detailVal}>{station.cost}</Text>
              <Text style={styles.detailLbl}>Cost</Text>
            </View>
            <View style={styles.detailBox}>
              <View style={[styles.detailIcon, { backgroundColor: EV.accent + '20' }]}>
                <Ionicons name="time-outline" size={16} color={EV.accent} />
              </View>
              <Text style={styles.detailVal}>{station.time}</Text>
              <Text style={styles.detailLbl}>Charge Time</Text>
            </View>
            <View style={styles.detailBox}>
              <View style={[styles.detailIcon, { backgroundColor: EV.info + '20' }]}>
                <Ionicons name="hardware-chip-outline" size={16} color={EV.info} />
              </View>
              <Text style={styles.detailVal}>{station.connectors?.[0] || 'N/A'}</Text>
              <Text style={styles.detailLbl}>Connector</Text>
            </View>
          </View>

          {station.connectors && station.connectors.length > 1 && (
            <View style={styles.connectorRow}>
              {station.connectors.map((c: string, idx: number) => (
                <View key={`${c}-${idx}`} style={styles.connectorChip}>
                  <Text style={styles.connectorChipText}>{c}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.dirBtn}>
              <Ionicons name="navigate-outline" size={14} color={EV.primary} />
              <Text style={styles.dirBtnText}>Directions</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addTripBtn}>
              <Ionicons name="add-circle" size={14} color={EV.bg} />
              <Text style={styles.addTripBtnText}>Add to Trip</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Expand indicator */}
      <View style={styles.expandIndicator}>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={EV.textDim}
        />
      </View>
    </TouchableOpacity>
    );
  }, [expanded]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={EV.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={require('@/assets/images/logoGogreen.jpeg')} style={styles.headerLogo} />
          <View>
            <Text style={styles.headerTitle}>Charging Stations</Text>
            <Text style={styles.headerSub}>{loading ? 'Loading...' : `${filtered.length} stations found near you`}</Text>
          </View>
        </View>
        <View style={styles.headerBadge}>
          <Ionicons name="flash" size={14} color={EV.bg} />
          <Text style={styles.headerBadgeText}>{filtered.length}</Text>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}>
            {f !== 'All' && (
              <Ionicons
                name={f === 'DC Fast' ? 'flash' : 'battery-charging'}
                size={12}
                color={filter === f ? EV.bg : EV.textMuted}
              />
            )}
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        style={styles.scroll}
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderStationItem}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          loading ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={EV.primary} />
              <Text style={{ color: EV.textMuted, marginTop: 12 }}>Finding stations near you...</Text>
            </View>
          ) : (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: EV.textMuted }}>No stations found nearby</Text>
            </View>
          )
        }
        ListFooterComponent={<View style={{ height: 24 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: EV.bg },
  scroll: { flex: 1 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: EV.border,
  },
  headerLogo: { width: 40, height: 40, borderRadius: 10, shadowColor: '#a1a1a1', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: EV.text },
  headerSub: { fontSize: 12, color: EV.textMuted, marginTop: 2 },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: EV.primary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerBadgeText: { fontSize: 13, fontWeight: '800', color: EV.bg },

  filterScroll: { maxHeight: 44 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: EV.bgCard,
    borderWidth: 1,
    borderColor: EV.border,
    height: 32,
  },
  chipActive: { backgroundColor: EV.primary, borderColor: EV.primary },
  chipText: { fontSize: 13, color: EV.textMuted, fontWeight: '600' },
  chipTextActive: { color: EV.bg },

  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: EV.bgCard,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: EV.border,
  },
  cardExpanded: { borderColor: EV.primary },

  distanceBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: EV.bgSurface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: EV.border,
  },
  distanceBadgeText: { fontSize: 11, fontWeight: '700', color: EV.accent },

  cardMain: { flexDirection: 'row', gap: 14, marginBottom: 14, paddingRight: 60 },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: EV.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconWrapFast: { backgroundColor: EV.primary },
  fastGlow: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: EV.primary + '30',
    transform: [{ scale: 1.3 }],
  },
  cardInfo: { flex: 1 },
  stationName: { fontSize: 16, fontWeight: '800', color: EV.text, marginBottom: 4 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  stationAddr: { fontSize: 12, color: EV.textDim },
  tagsRow: { flexDirection: 'row', gap: 6 },
  typeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: EV.bgSurface,
    borderWidth: 1,
    borderColor: EV.border,
  },
  typeTagFast: { backgroundColor: EV.primary + '20', borderColor: EV.primaryDark },
  typeTagText: { fontSize: 10, color: EV.textMuted, fontWeight: '600' },
  typeTagTextFast: { color: EV.primary },
  powerTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: EV.bgSurface,
    borderWidth: 1,
    borderColor: EV.border,
  },
  powerTagText: { fontSize: 10, color: EV.textMuted, fontWeight: '600' },

  availRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  availLeft: { flex: 1, gap: 6 },
  availLabel: { fontSize: 10, color: EV.textDim, fontWeight: '600', letterSpacing: 0.5 },
  availBar: { flexDirection: 'row', gap: 4 },
  availSegment: { flex: 1, height: 5, borderRadius: 3, maxWidth: 28 },
  availRight: { alignItems: 'flex-end' },
  availCount: { fontSize: 16, fontWeight: '800', color: EV.text },
  availSub: { fontSize: 10, color: EV.textDim },

  expandedContent: { marginTop: 14 },
  expandedDivider: { height: 1, backgroundColor: EV.border, marginBottom: 14 },
  detailsGrid: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  detailBox: { alignItems: 'center', gap: 6 },
  detailIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailVal: { fontSize: 14, fontWeight: '800', color: EV.text },
  detailLbl: { fontSize: 10, color: EV.textMuted },
  connectorRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  connectorChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: EV.info + '20',
    borderWidth: 1,
    borderColor: EV.info + '40',
  },
  connectorChipText: { fontSize: 11, color: EV.info, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8 },
  dirBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: EV.primary,
  },
  dirBtnText: { fontSize: 12, fontWeight: '700', color: EV.primary },
  addTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: EV.primary,
  },
  addTripBtnText: { fontSize: 12, fontWeight: '700', color: EV.bg },

  expandIndicator: { alignItems: 'center', marginTop: 10 },
});
