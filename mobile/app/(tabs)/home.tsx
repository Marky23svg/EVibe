import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EV } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserExpenses, getIncomes, getTrips, deleteTrip } from '@/services/api';
import { useRouter, useFocusEffect } from 'expo-router';

const EXPENSE_CATEGORIES = [
  { key: 'charging', label: 'Charging', icon: 'flash', color: EV.primary },
  { key: 'food', label: 'Food', icon: 'restaurant', color: EV.warning },
  { key: 'accommodation', label: 'Stay', icon: 'bed', color: EV.info },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: EV.textMuted },
];

const INCOME_CATEGORIES = [
  { key: 'salary', label: 'Salary', icon: 'briefcase', color: EV.primary },
  { key: 'allowance', label: 'Allowance', icon: 'wallet', color: EV.info },
  { key: 'gift', label: 'Gift', icon: 'gift', color: EV.warning },
  { key: 'other', label: 'Other', icon: 'cash', color: EV.textMuted },
];

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

export default function HomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [tripHistory, setTripHistory] = useState<any[]>([]);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const userStr = await AsyncStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : {};
      if (!user.id) {
        setLoading(false);
        return;
      }

      setUserName(user.name || 'User');

      const [incRes, expRes, tripsRes] = await Promise.all([
        getIncomes(user.id),
        getUserExpenses(user.id),
        getTrips(user.id),
      ]);

      setIncomes(incRes.data);
      setExpenses(expRes.data);
      setTotalIncome(incRes.data.reduce((s: number, i: any) => s + i.amount, 0));
      setTotalExpenses(expRes.data.reduce((s: number, e: any) => s + e.amount, 0));
      setTripHistory(tripsRes.data.slice(0, 5));
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleProfilePress = () => {
    router.push('/profile');
  };

  const balance = totalIncome - totalExpenses;
  const isOverBudget = balance < 0;
  const isLowBalance = totalIncome > 0 && balance < totalIncome * 0.2 && balance > 0;
  const balanceColor = isOverBudget ? EV.danger : isLowBalance ? EV.warning : EV.primary;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={EV.bg} />
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={EV.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={EV.bg} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerGreeting}>{getGreeting()},</Text>
          <Text style={styles.headerName}>{userName}</Text>
        </View>
        <TouchableOpacity onPress={handleProfilePress} style={styles.profileBtn}>
          <Text style={styles.profileText}>{userName.charAt(0).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Balance Card */}
        {isOverBudget && (
          <View style={styles.alertBanner}>
            <Ionicons name="warning" size={20} color={EV.danger} />
            <Text style={styles.alertText}> Over budget by ₱{Math.abs(balance).toFixed(2)}</Text>
          </View>
        )}

        <View style={styles.balanceCard}>
          <View style={styles.balanceGlow} />
          <Text style={styles.balanceLabel}>CURRENT BALANCE</Text>
          <Text style={[styles.balanceAmount, { color: balanceColor }]}>₱{balance.toFixed(2)}</Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Ionicons name="arrow-down-circle" size={20} color={EV.primary} />
              <Text style={styles.balanceItemLabel}>Income</Text>
              <Text style={styles.balanceItemValue}>₱{totalIncome.toFixed(2)}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <Ionicons name="arrow-up-circle" size={20} color={EV.danger} />
              <Text style={styles.balanceItemLabel}>Expenses</Text>
              <Text style={styles.balanceItemValue}>₱{totalExpenses.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)')}>  
            <View style={[styles.actionIcon, { backgroundColor: EV.primary + '20' }]}>
              <Ionicons name="map" size={24} color={EV.primary} />
            </View>
            <Text style={styles.actionText}>Map</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/stations')}>
            <View style={[styles.actionIcon, { backgroundColor: EV.warning + '20' }]}>
              <Ionicons name="flash" size={24} color={EV.warning} />
            </View>
            <Text style={styles.actionText}>Stations</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/budget')}>
            <View style={[styles.actionIcon, { backgroundColor: EV.info + '20' }]}>
              <Ionicons name="wallet" size={24} color={EV.info} />
            </View>
            <Text style={styles.actionText}>Budget</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/eco')}>
            <View style={[styles.actionIcon, { backgroundColor: EV.accent + '20' }]}>
              <Ionicons name="leaf" size={24} color={EV.accent} />
            </View>
            <Text style={styles.actionText}>Eco</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>RECENT TRANSACTIONS</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/budget')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {[...incomes.slice(0, 3), ...expenses.slice(0, 3)]
            .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())
            .slice(0, 5)
            .map((item) => {
              const isIncome = 'date' in item;
              const cat = isIncome
                ? INCOME_CATEGORIES.find((c) => c.key === item.category) || INCOME_CATEGORIES[3]
                : EXPENSE_CATEGORIES.find((c) => c.key === item.category) || EXPENSE_CATEGORIES[3];
              return (
                <View key={item._id} style={styles.transactionRow}>
                  <View style={[styles.transactionIcon, { backgroundColor: cat.color + '18' }]}>
                    <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                  </View>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionLabel}>{item.description || cat.label}</Text>
                    <Text style={styles.transactionDate}>
                      {new Date(item.createdAt || item.date).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={[styles.transactionAmount, { color: isIncome ? EV.primary : EV.danger }]}>
                    {isIncome ? '+' : '-'}₱{item.amount.toFixed(2)}
                  </Text>
                </View>
              );
            })}
        </View>

        {/* Trip History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>TRIP HISTORY</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/eco')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {tripHistory.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Ionicons name="car-outline" size={48} color={EV.textDim} />
              <Text style={styles.emptyText}>No trips yet</Text>
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
                      <Text style={styles.historyDate}>
                        {new Date(trip.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                      </Text>
                      <Text style={styles.historyDot}>·</Text>
                      <Text style={styles.historyDist}>{trip.distance.toFixed(1)} km</Text>
                    </View>
                    <View style={styles.historyStars}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Ionicons
                          key={i}
                          name={i <= s ? 'star' : 'star-outline'}
                          size={11}
                          color={i <= s ? EV.warning : EV.textDim}
                        />
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
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: EV.bg },
  scroll: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: EV.border,
  },
  headerGreeting: { fontSize: 15, fontWeight: '400', color: EV.textMuted, marginTop: -8 },
  headerName: { fontSize: 25, fontWeight: '800', color: EV.text, marginTop: 1 },
  profileBtn: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: EV.primary, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  profileText: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: 'white' 
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: EV.danger + '18',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: EV.danger,
  },
  alertText: { flex: 1, color: EV.danger, fontWeight: '700', fontSize: 14 },
  balanceCard: {
    backgroundColor: EV.bgCard,
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: EV.border,
    overflow: 'hidden',
  },
  balanceGlow: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: EV.primary + '0C',
  },
  balanceLabel: { fontSize: 11, color: EV.textMuted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  balanceAmount: { fontSize: 40, fontWeight: '900', marginBottom: 20 },
  balanceRow: { flexDirection: 'row', gap: 16 },
  balanceItem: { flex: 1, alignItems: 'center', gap: 6 },
  balanceItemLabel: { fontSize: 11, color: EV.textMuted, fontWeight: '600' },
  balanceItemValue: { fontSize: 16, color: EV.text, fontWeight: '800' },
  balanceDivider: { width: 1, backgroundColor: EV.border },
  quickActions: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 16 },
  actionBtn: { flex: 1, alignItems: 'center', gap: 8, backgroundColor: EV.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: EV.border },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '700', color: EV.text },
  section: { marginTop: 20, marginHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: EV.primary, letterSpacing: 1.5 },
  seeAll: { fontSize: 12, fontWeight: '600', color: EV.primary },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: EV.bgCard,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: EV.border,
  },
  transactionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  transactionInfo: { flex: 1 },
  transactionLabel: { fontSize: 14, fontWeight: '700', color: EV.text, marginBottom: 2 },
  transactionDate: { fontSize: 11, color: EV.textDim },
  transactionAmount: { fontSize: 15, fontWeight: '800' },
  emptyHistory: { alignItems: 'center', paddingVertical: 40, gap: 12, backgroundColor: EV.bgCard, borderRadius: 20, borderWidth: 1, borderColor: EV.border },
  emptyText: { fontSize: 14, color: EV.textMuted, fontWeight: '600' },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
    backgroundColor: EV.bgCard,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: EV.border,
  },
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
