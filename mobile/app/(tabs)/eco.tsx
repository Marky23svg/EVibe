import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, StatusBar, ActivityIndicator, TouchableOpacity, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EV } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { getUserExpenses, getIncomes, getTrips, deleteTrip } from '@/services/api';
import { useCarbonData } from '@/hooks/useCarbonData';

function calculateEcoScore(carbonData: any, budgetData: any, tripData: any) {
  let carbonScore = 0;
  let budgetScore = 0;
  let efficiencyScore = 0;

  if (carbonData && carbonData.savedPercentage) {
    carbonScore = Math.min(100, carbonData.savedPercentage);
  }

  if (budgetData) {
    const { totalIncome, totalExpenses } = budgetData;
    if (totalIncome > 0) {
      const budgetUsage = (totalExpenses / totalIncome) * 100;
      if (budgetUsage <= 70) budgetScore = 100;
      else if (budgetUsage <= 85) budgetScore = 85;
      else if (budgetUsage <= 100) budgetScore = 70;
      else budgetScore = Math.max(0, 50 - (budgetUsage - 100));
    }
  }

  if (tripData && tripData.mode) {
    const modeScores: any = { walking: 100, biking: 100, ev: 85, commute: 70 };
    efficiencyScore = modeScores[tripData.mode] || 50;
  }

  const overallScore = Math.round((carbonScore * 0.4) + (budgetScore * 0.3) + (efficiencyScore * 0.3));

  return {
    overall: overallScore,
    carbon: Math.round(carbonScore),
    budget: Math.round(budgetScore),
    efficiency: Math.round(efficiencyScore),
  };
}

function getStars(score: number) {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}

function getScoreColor(score: number) {
  if (score >= 75) return EV.primary;
  if (score >= 50) return EV.warning;
  return EV.danger;
}

function getMessage(score: number) {
  if (score >= 90) return { title: 'Outstanding!', sub: "You're an eco champion!" };
  if (score >= 75) return { title: 'Great job!', sub: 'Keep up the green driving!' };
  if (score >= 60) return { title: 'Good effort!', sub: 'Room to improve your score.' };
  if (score >= 40) return { title: 'Keep improving!', sub: 'Try optimizing your route.' };
  return { title: "Let's do better!", sub: 'Check your budget & carbon tips.' };
}

export default function EcoScreen() {
  const router = useRouter();
  const { loading: carbonLoading, error, carbonData, refetch } = useCarbonData();
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState({ overall: 0, carbon: 0, budget: 0, efficiency: 0 });
  const [tripHistory, setTripHistory] = useState<any[]>([]);
  const [tripInfo, setTripInfo] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
      refetch();
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [userStr, tripStr] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('activeTrip'),
      ]);

      const user = userStr ? JSON.parse(userStr) : {};
      if (!user.id) {
        setLoading(false);
        return;
      }

      let activeTripCarbon = null;
      if (tripStr) {
        const trip = JSON.parse(tripStr);
        activeTripCarbon = trip.carbonData;
        setTripInfo(trip);
      }

      const [incRes, expRes, tripsRes] = await Promise.all([
        getIncomes(user.id),
        getUserExpenses(user.id),
        getTrips(user.id),
      ]);

      const totalIncome = incRes.data.reduce((s: number, i: any) => s + i.amount, 0);
      const totalExpenses = expRes.data.reduce((s: number, e: any) => s + e.amount, 0);
      setTripHistory(tripsRes.data.slice(0, 5));

      const calculatedScores = calculateEcoScore(
        activeTripCarbon,
        { totalIncome, totalExpenses },
        tripStr ? JSON.parse(tripStr) : null
      );
      setScores(calculatedScores);
    } catch (err) {
      console.log('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTrip = (tripId: string, tripName: string) => {
    Alert.alert('Delete Trip', `Remove "${tripName}" from history?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTrip(tripId);
            loadData();
          } catch {
            Alert.alert('Error', 'Failed to delete trip');
          }
        },
      },
    ]);
  };

  const { overall: score, budget, carbon, efficiency } = scores;
  const color = getScoreColor(score);
  const stars = getStars(score);
  const msg = getMessage(score);

  const saved = carbonData?.savedKg || 0;
  const treesSaved = carbonData?.treesEquivalent || 0;
  const reductionPct = carbonData?.savedPercentage || 0;
  const evCO2 = carbonData?.tripEmission || 0;
  const gasCO2 = carbonData?.carEmission || 0;
  const distanceKm = carbonData?.distanceKm || 0;
  const energyKwh = carbonData?.energyKwh || 0;

  const metrics = [
    { label: 'Budget Score', value: budget, icon: 'wallet-outline', color: EV.accent, desc: 'Stayed within budget' },
    { label: 'Carbon Score', value: carbon, icon: 'leaf-outline', color: EV.primary, desc: 'Low emissions trip' },
    { label: 'Efficiency', value: efficiency, icon: 'flash-outline', color: EV.neon, desc: 'Energy usage rating' },
  ];

  if (loading || carbonLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={EV.bg} />
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={EV.primary} />
          <Text style={styles.loadingText}>Loading eco data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={EV.bg} />

      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={require('@/assets/images/logoGogreen.jpeg')} style={styles.headerLogo} />
          <View>
            <Text style={styles.headerTitle}>Eco Dashboard</Text>
            <Text style={styles.headerSub}>Carbon footprint & eco score</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={[styles.starBadge, { backgroundColor: EV.warning }]}>
            <Ionicons name="star" size={14} color={EV.bg} />
            <Text style={styles.starBadgeText}>{stars}/5</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Eco Score Hero */}
        <View style={styles.heroCard}>
          <View style={[styles.heroGlow, { backgroundColor: color + '12' }]} />
          <View style={styles.ringContainer}>
            <View style={[styles.ringDecor, { borderColor: color + '15' }]} />
            <View style={[styles.ringMiddle, { borderColor: color + '30' }]} />
            <View style={[styles.ringMain, { borderColor: color }]}>
              <Text style={[styles.ringScore, { color }]}>{score}</Text>
              <Text style={styles.ringDivider}>/100</Text>
            </View>
          </View>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Ionicons key={i} name={i <= stars ? 'star' : 'star-outline'} size={22} color={i <= stars ? EV.warning : EV.textDim} />
            ))}
          </View>
          <Text style={styles.msgTitle}>{msg.title}</Text>
          <Text style={styles.msgSub}>{msg.sub}</Text>
          {tripInfo && (
            <View style={styles.currentTripBadge}>
              <Ionicons name="navigate" size={14} color={EV.primary} />
              <Text style={styles.currentTripText}>{tripInfo.origin} → {tripInfo.destination}</Text>
            </View>
          )}
        </View>

        {/* Carbon Savings */}
        {carbonData && (
          <View style={styles.carbonCard}>
            <Text style={styles.carbonEyebrow}>CO₂ SAVED THIS TRIP</Text>
            <Text style={styles.carbonNumber}>{saved.toFixed(1)}</Text>
            <Text style={styles.carbonUnit}>kilograms of CO₂</Text>
            <View style={styles.treesRow}>
              <View style={styles.treesIconGroup}>
                {[...Array(Math.min(Math.ceil(treesSaved), 5))].map((_, i) => (
                  <View key={i} style={[styles.treeIcon, { marginLeft: i > 0 ? -8 : 0, zIndex: 5 - i }]}>
                    <Ionicons name="leaf" size={14} color={EV.bg} />
                  </View>
                ))}
              </View>
              <View style={styles.treesText}>
                <Text style={styles.treesNum}>{treesSaved.toFixed(1)} trees</Text>
                <Text style={styles.treesSub}>planted for a year equivalent</Text>
              </View>
            </View>
            <View style={styles.reductionBadge}>
              <Ionicons name="trending-down" size={16} color={EV.primary} />
              <Text style={styles.reductionText}>{reductionPct.toFixed(0)}% less emissions</Text>
            </View>
          </View>
        )}

        {/* Score Breakdown */}
        <Text style={styles.sectionTitle}>SCORE BREAKDOWN</Text>
        <View style={styles.metricsCard}>
          {metrics.map((m, i) => (
            <View key={m.label} style={[styles.metricRow, i < metrics.length - 1 && styles.metricDivider]}>
              <View style={[styles.metricIcon, { backgroundColor: m.color + '18' }]}>
                <Ionicons name={m.icon as any} size={20} color={m.color} />
              </View>
              <View style={styles.metricInfo}>
                <View style={styles.metricTop}>
                  <View>
                    <Text style={styles.metricLabel}>{m.label}</Text>
                    <Text style={styles.metricDesc}>{m.desc}</Text>
                  </View>
                  <Text style={[styles.metricVal, { color: m.color }]}>{m.value}</Text>
                </View>
                <View style={styles.metricTrack}>
                  <View style={[styles.metricFill, { width: `${m.value}%` as any, backgroundColor: m.color }]} />
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Trip History */}
        <Text style={styles.sectionTitle}>TRIP HISTORY</Text>
        {tripHistory.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Ionicons name="car-outline" size={48} color={EV.textDim} />
            <Text style={styles.emptyText}>No trip history yet</Text>
            <TouchableOpacity style={styles.planTripBtn} onPress={() => router.push('/setup')}>
              <Ionicons name="add-circle" size={20} color={EV.bg} />
              <Text style={styles.planTripText}>Plan Your First Trip</Text>
            </TouchableOpacity>
          </View>
        ) : (
          tripHistory.map((trip) => {
            const tripScore = trip.carbonData?.savedPercentage || 50;
            const c = getScoreColor(tripScore);
            const s = getStars(tripScore);
            const tripName = `${trip.origin} → ${trip.destination}`;
            return (
              <View key={trip._id} style={styles.historyCard}>
                <View style={[styles.historyScore, { borderColor: c + '60', backgroundColor: c + '12' }]}>
                  <Text style={[styles.historyScoreNum, { color: c }]}>{Math.round(tripScore)}</Text>
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyRoute}>{tripName}</Text>
                  <View style={styles.historyMeta}>
                    <Text style={styles.historyDate}>{new Date(trip.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</Text>
                    <Text style={styles.historyDot}>·</Text>
                    <Text style={styles.historyDist}>{trip.distance.toFixed(1)} km</Text>
                  </View>
                  <View style={styles.historyStars}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Ionicons key={i} name={i <= s ? 'star' : 'star-outline'} size={11} color={i <= s ? EV.warning : EV.textDim} />
                    ))}
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleDeleteTrip(trip._id, tripName)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={18} color={EV.danger} />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: EV.bg },
  scroll: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 14, color: EV.textMuted, fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: EV.border },
  headerLogo: { width: 40, height: 40, borderRadius: 10, shadowColor: '#a2a2a2', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: EV.text },
  headerSub: { fontSize: 12, color: EV.textMuted, marginTop: 2 },
  starBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  starBadgeText: { fontSize: 13, fontWeight: '800', color: EV.bg },
  heroCard: { margin: 16, backgroundColor: EV.bgCard, borderRadius: 24, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: EV.border, overflow: 'hidden' },
  heroGlow: { position: 'absolute', top: -80, width: 300, height: 300, borderRadius: 150 },
  ringContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 20, width: 160, height: 160 },
  ringDecor: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 16 },
  ringMiddle: { position: 'absolute', width: 136, height: 136, borderRadius: 68, borderWidth: 8 },
  ringMain: { width: 112, height: 112, borderRadius: 56, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  ringScore: { fontSize: 42, fontWeight: '900', lineHeight: 46 },
  ringDivider: { fontSize: 13, color: EV.textMuted, fontWeight: '600' },
  starsRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  msgTitle: { fontSize: 22, fontWeight: '800', color: EV.text, marginBottom: 4 },
  msgSub: { fontSize: 14, color: EV.textMuted, marginBottom: 16 },
  currentTripBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: EV.primary + '18', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: EV.primary + '40' },
  currentTripText: { fontSize: 13, color: EV.primary, fontWeight: '700' },
  carbonCard: { marginHorizontal: 16, marginBottom: 20, backgroundColor: EV.bgCard, borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: EV.border },
  carbonEyebrow: { fontSize: 11, color: EV.textMuted, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  carbonNumber: { fontSize: 48, fontWeight: '900', color: EV.primary, letterSpacing: -2, lineHeight: 52 },
  carbonUnit: { fontSize: 14, color: EV.textMuted, marginBottom: 16 },
  treesRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  treesIconGroup: { flexDirection: 'row' },
  treeIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: EV.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: EV.bgCard },
  treesText: {},
  treesNum: { fontSize: 16, fontWeight: '800', color: EV.text },
  treesSub: { fontSize: 11, color: EV.textMuted },
  reductionBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: EV.primary + '18', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: EV.accentSoft },
  reductionText: { fontSize: 13, color: EV.primary, fontWeight: '700' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: EV.primary, letterSpacing: 1.5, marginHorizontal: 16, marginBottom: 12 },
  metricsCard: { marginHorizontal: 16, marginBottom: 20, backgroundColor: EV.bgCard, borderRadius: 20, borderWidth: 1, borderColor: EV.border, overflow: 'hidden' },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  metricDivider: { borderBottomWidth: 1, borderBottomColor: EV.border },
  metricIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  metricInfo: { flex: 1, gap: 8 },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  metricLabel: { fontSize: 14, fontWeight: '700', color: EV.text },
  metricDesc: { fontSize: 11, color: EV.textDim, marginTop: 2 },
  metricVal: { fontSize: 22, fontWeight: '900' },
  metricTrack: { height: 6, backgroundColor: EV.bgSurface, borderRadius: 3, overflow: 'hidden' },
  metricFill: { height: '100%', borderRadius: 3 },
  emptyHistory: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 12, marginHorizontal: 16, backgroundColor: EV.bgCard, borderRadius: 20, borderWidth: 1, borderColor: EV.border },
  emptyText: { fontSize: 14, color: EV.textMuted, fontWeight: '600' },
  planTripBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: EV.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  planTripText: { color: EV.bg, fontWeight: '700', fontSize: 14 },
  historyCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginBottom: 8, backgroundColor: EV.bgCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: EV.border },
  historyScore: { width: 54, height: 54, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  historyScoreNum: { fontSize: 20, fontWeight: '900' },
  historyInfo: { flex: 1, gap: 3 },
  historyRoute: { fontSize: 14, fontWeight: '700', color: EV.text },
  historyMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyDate: { fontSize: 12, color: EV.textMuted },
  historyDot: { fontSize: 12, color: EV.textDim },
  historyDist: { fontSize: 12, color: EV.textMuted },
  historyStars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  deleteBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: EV.danger + '18', alignItems: 'center', justifyContent: 'center' },
});
