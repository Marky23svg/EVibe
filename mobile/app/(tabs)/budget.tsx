import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EV } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserExpenses, getIncomes, getMonthlySummary, getYearlySummary, getDailySummary, deleteExpense as apiDeleteExpense, deleteIncome as apiDeleteIncome } from '@/services/api';
import { useRouter, useFocusEffect } from 'expo-router';

const EXPENSE_CATEGORIES = [
  { key: 'commute', label: 'Commute', icon: 'bus', color: EV.info },
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

export default function BudgetScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'overview' | 'calendar' | 'summary'>('overview');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dailyData, setDailyData] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [yearlyData, setYearlyData] = useState<any>(null);
  const [noUser, setNoUser] = useState(false);
  const selectedYear = selectedDate.getFullYear();
  const selectedMonth = selectedDate.getMonth();

  const monthlyCumulativeMap = useMemo(() => {
    const dailyMap = monthlyData?.dailyMap || {};
    const daysInSelectedMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const cumulativeMap: Record<number, { income: number; expenses: number; cumulativeExpenses: number; balance: number }> = {};
    let cumulativeIncome = 0;
    let cumulativeExpenses = 0;

    for (let day = 1; day <= daysInSelectedMonth; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayData = dailyMap[dateStr] || { income: 0, expenses: 0 };
      if (dayData.income > 0) cumulativeIncome += dayData.income;
      if (dayData.expenses > 0) cumulativeExpenses += dayData.expenses;

      cumulativeMap[day] = {
        income: cumulativeIncome,
        expenses: dayData.expenses || 0,
        cumulativeExpenses,
        balance: cumulativeIncome - cumulativeExpenses,
      };
    }

    return cumulativeMap;
  }, [monthlyData, selectedYear, selectedMonth]);

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
      console.log('User from storage:', user);
      if (!user.id) {
        console.log('No user ID found');
        setNoUser(true);
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const now = new Date();
      const [incRes, expRes, monthRes, yearRes] = await Promise.all([
        getIncomes(user.id),
        getUserExpenses(user.id),
        getMonthlySummary(user.id, now.getMonth() + 1, now.getFullYear()),
        getYearlySummary(user.id, now.getFullYear()),
      ]);

      console.log('Data loaded:', { incomes: incRes.data.length, expenses: expRes.data.length });
      setIncomes(incRes.data);
      setExpenses(expRes.data);
      setTotalIncome(incRes.data.reduce((s: number, i: any) => s + i.amount, 0));
      setTotalExpenses(expRes.data.reduce((s: number, e: any) => s + e.amount, 0));
      setMonthlyData(monthRes.data);
      setYearlyData(yearRes.data);
    } catch (err: any) {
      console.log('Load error:', err?.response?.data || err?.message || err);
      Alert.alert('Error', 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadDailyData = async (date: Date) => {
    try {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const res = await getDailySummary(userId, dateStr);
      
      const selectedDay = date.getDate();
      const cumulativeData = monthlyCumulativeMap[selectedDay] || { income: 0, cumulativeExpenses: 0 };
      
      // Update daily data with cumulative values
      const updatedData = {
        ...res.data,
        totalIncome: cumulativeData.income,
        totalExpenses: res.data.totalExpenses || 0, // Only today's expenses, 0 if none
        cumulativeExpenses: cumulativeData.cumulativeExpenses, // Total expenses up to this day
        balance: cumulativeData.income - cumulativeData.cumulativeExpenses,
      };
      
      setDailyData(updatedData);
    } catch (err) {
      console.log('Daily load error:', err);
    }
  };

  const balance = totalIncome - totalExpenses;
  const isOverBudget = balance < 0;
  const isLowBalance = totalIncome > 0 && balance < totalIncome * 0.2 && balance > 0;
  const balanceColor = isOverBudget ? EV.danger : isLowBalance ? EV.warning : EV.primary;

  const deleteExpense = (id: string) => {
    Alert.alert('Delete', 'Remove this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteExpense(id);
            loadData();
          } catch {
            Alert.alert('Error', 'Failed to delete');
          }
        },
      },
    ]);
  };

  const deleteIncome = (id: string) => {
    Alert.alert('Delete', 'Remove this income?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDeleteIncome(id);
            loadData();
          } catch {
            Alert.alert('Error', 'Failed to delete');
          }
        },
      },
    ]);
  };

  const renderOverview = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {isOverBudget && (
        <View style={styles.alertBanner}>
          <Ionicons name="warning" size={20} color={EV.danger} />
          <Text style={styles.alertText}> You are over budget by ₱{Math.abs(balance).toFixed(2)}</Text>
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

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT INCOME</Text>
          <TouchableOpacity onPress={() => router.push('/add-income')}>
            <Ionicons name="add-circle" size={24} color={EV.primary} />
          </TouchableOpacity>
        </View>
        {incomes.slice(0, 5).map((inc) => {
          const cat = INCOME_CATEGORIES.find((c) => c.key === inc.category) || INCOME_CATEGORIES[3];
          return (
            <View key={inc._id} style={styles.transactionRow}>
              <View style={[styles.transactionIcon, { backgroundColor: cat.color + '18' }]}>
                <Ionicons name={cat.icon as any} size={18} color={cat.color} />
              </View>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionLabel}>{inc.description || cat.label}</Text>
                <Text style={styles.transactionDate}>{new Date(inc.date).toLocaleDateString()}</Text>
              </View>
              <Text style={[styles.transactionAmount, { color: EV.primary }]}>+₱{inc.amount.toFixed(2)}</Text>
              <TouchableOpacity onPress={() => deleteIncome(inc._id)} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={16} color={EV.danger} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT EXPENSES</Text>
          <TouchableOpacity onPress={() => router.push('/add-expense')}>
            <Ionicons name="add-circle" size={24} color={EV.danger} />
          </TouchableOpacity>
        </View>
        {expenses.slice(0, 5).map((exp) => {
          const cat = EXPENSE_CATEGORIES.find((c) => c.key === exp.category) || EXPENSE_CATEGORIES[3];
          return (
            <View key={exp._id} style={styles.transactionRow}>
              <View style={[styles.transactionIcon, { backgroundColor: cat.color + '18' }]}>
                <Ionicons name={cat.icon as any} size={18} color={cat.color} />
              </View>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionLabel}>{exp.description || cat.label}</Text>
                <Text style={styles.transactionDate}>{new Date(exp.createdAt).toLocaleDateString()}</Text>
              </View>
              <Text style={[styles.transactionAmount, { color: EV.danger }]}>-₱{exp.amount.toFixed(2)}</Text>
              <TouchableOpacity onPress={() => deleteExpense(exp._id)} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={16} color={EV.danger} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );

  const renderCalendar = () => {
    const year = selectedYear;
    const month = selectedMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const getDayData = (day: number) => (
      monthlyCumulativeMap[day] || { income: 0, expenses: 0, cumulativeExpenses: 0, balance: 0 }
    );

    const isToday = (day: number) => {
      return isCurrentMonth && day === today.getDate();
    };

    const isSelected = (day: number) => {
      return selectedDate.getDate() === day && 
             selectedDate.getMonth() === month && 
             selectedDate.getFullYear() === year;
    };

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity 
            onPress={() => {
              const newDate = new Date(year, month - 1);
              setSelectedDate(newDate);
              loadData();
            }}
            style={styles.calendarNavBtn}
          >
            <Ionicons name="chevron-back" size={24} color={EV.primary} />
          </TouchableOpacity>
          <View style={styles.calendarTitleContainer}>
            <Text style={styles.calendarTitle}>
              {selectedDate.toLocaleDateString('en', { month: 'long' })}
            </Text>
            <Text style={styles.calendarYear}>{year}</Text>
          </View>
          <TouchableOpacity 
            onPress={() => {
              const newDate = new Date(year, month + 1);
              setSelectedDate(newDate);
              loadData();
            }}
            style={styles.calendarNavBtn}
          >
            <Ionicons name="chevron-forward" size={24} color={EV.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.calendarLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: EV.primary }]} />
            <Text style={styles.legendText}>Income</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: EV.danger }]} />
            <Text style={styles.legendText}>Expense</Text>
          </View>
        </View>

        <View style={styles.calendarGrid}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
            <View key={i} style={styles.calendarDayLabelContainer}>
              <Text style={styles.calendarDayLabel}>{d}</Text>
            </View>
          ))}
          {days.map((day, i) => {
            if (!day) return <View key={`empty-${i}`} style={styles.calendarDayEmpty} />;
            const data = getDayData(day);
            const hasIncome = data.income > 0;
            const hasExpense = data.expenses > 0;
            const isTodayDate = isToday(day);
            const isSelectedDate = isSelected(day);
            const hasActivity = hasIncome || hasExpense;
            
            return (
              <View key={`day-${day}`} style={styles.calendarDayCell}>
                <TouchableOpacity
                  style={[
                    styles.calendarDayCellInner,
                    isTodayDate && styles.calendarDayToday,
                    isSelectedDate && styles.calendarDaySelected,
                    hasActivity && !isTodayDate && !isSelectedDate && styles.calendarDayActive,
                  ]}
                  onPress={() => {
                    const d = new Date(year, month, day);
                    setSelectedDate(d);
                    loadDailyData(d);
                  }}
                >
                  <Text style={[
                    styles.calendarDayText,
                    isTodayDate && styles.calendarDayTextToday,
                    isSelectedDate && styles.calendarDayTextSelected,
                  ]}>
                    {day}
                  </Text>
                  {hasActivity && (
                    <View style={styles.calendarDots}>
                      {hasIncome && <View style={[styles.calendarDot, { backgroundColor: EV.primary }]} />}
                      {hasExpense && <View style={[styles.calendarDot, { backgroundColor: EV.danger }]} />}
                    </View>
                  )}
                  {hasActivity && (
                    <Text style={[
                      styles.calendarDayAmount,
                      { color: data.balance < 0 ? EV.danger : isTodayDate ? EV.primary : EV.textMuted }
                    ]}>
                      ₱{data.balance.toFixed(0)}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {dailyData && (
          <View style={styles.dailyBreakdown}>
            <View style={styles.dailyHeader}>
              <View>
                <Text style={styles.dailyTitle}>
                  {new Date(dailyData.date).toLocaleDateString('en', { weekday: 'long' })}
                </Text>
                <Text style={styles.dailySubtitle}>
                  {new Date(dailyData.date).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDailyData(null)} style={styles.dailyCloseBtn}>
                <Ionicons name="close" size={20} color={EV.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.dailyStats}>
              <View style={[styles.dailyStatCard, { borderColor: EV.primary + '40' }]}>
                <Ionicons name="arrow-down-circle" size={24} color={EV.primary} />
                <Text style={styles.dailyStatLabel}>Total Income</Text>
                <Text style={[styles.dailyStatValue, { color: EV.primary }]}>₱{dailyData.totalIncome.toFixed(2)}</Text>
              </View>
              <View style={[styles.dailyStatCard, { borderColor: EV.danger + '40' }]}>
                <Ionicons name="arrow-up-circle" size={24} color={EV.danger} />
                <Text style={styles.dailyStatLabel}>Today&apos;s Expenses</Text>
                <Text style={[styles.dailyStatValue, { color: EV.danger }]}>₱{dailyData.totalExpenses.toFixed(2)}</Text>
              </View>
              <View style={[styles.dailyStatCard, { borderColor: dailyData.balance >= 0 ? EV.primary + '40' : EV.danger + '40' }]}>
                <Ionicons name="wallet" size={24} color={dailyData.balance >= 0 ? EV.primary : EV.danger} />
                <Text style={styles.dailyStatLabel}>Balance</Text>
                <Text style={[styles.dailyStatValue, { color: dailyData.balance >= 0 ? EV.primary : EV.danger }]}>
                  ₱{dailyData.balance.toFixed(2)}
                </Text>
              </View>
            </View>

            {(dailyData.incomes.length > 0 || dailyData.expenses.length > 0) && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 12 }]}>TRANSACTIONS ON THIS DAY</Text>
                {dailyData.incomes.map((inc: any) => {
                  const cat = INCOME_CATEGORIES.find((c) => c.key === inc.category) || INCOME_CATEGORIES[3];
                  return (
                    <View key={inc._id} style={styles.transactionRow}>
                      <View style={[styles.transactionIcon, { backgroundColor: cat.color + '18' }]}>
                        <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                      </View>
                      <View style={styles.transactionInfo}>
                        <Text style={styles.transactionLabel}>{inc.description || cat.label}</Text>
                        <Text style={styles.transactionDate}>{new Date(inc.date).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      <Text style={[styles.transactionAmount, { color: EV.primary }]}>+₱{inc.amount.toFixed(2)}</Text>
                    </View>
                  );
                })}
                {dailyData.expenses.map((exp: any) => {
                  const cat = EXPENSE_CATEGORIES.find((c) => c.key === exp.category) || EXPENSE_CATEGORIES[3];
                  return (
                    <View key={exp._id} style={styles.transactionRow}>
                      <View style={[styles.transactionIcon, { backgroundColor: cat.color + '18' }]}>
                        <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                      </View>
                      <View style={styles.transactionInfo}>
                        <Text style={styles.transactionLabel}>{exp.description || cat.label}</Text>
                        <Text style={styles.transactionDate}>{new Date(exp.createdAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      <Text style={[styles.transactionAmount, { color: EV.danger }]}>-₱{exp.amount.toFixed(2)}</Text>
                    </View>
                  );
                })}
              </>
            )}

            {dailyData.incomes.length === 0 && dailyData.expenses.length === 0 && (
              <View style={styles.emptyDaily}>
                <Ionicons name="calendar-outline" size={48} color={EV.textDim} />
                <Text style={styles.emptyDailyText}>No transactions on this day</Text>
              </View>
            )}
          </View>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    );
  };

  const renderSummary = () => {
    return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {monthlyData && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>MONTHLY SUMMARY</Text>
          <Text style={styles.summarySubtitle}>
            {new Date(monthlyData.year, monthlyData.month - 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })}
          </Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Income</Text>
              <Text style={[styles.summaryValue, { color: EV.primary }]}>₱{monthlyData.totalIncome.toFixed(2)}</Text>
              {monthlyData.incomeChange && (
                <Text style={[styles.summaryChange, { color: parseFloat(monthlyData.incomeChange) >= 0 ? EV.primary : EV.danger }]}>
                  {parseFloat(monthlyData.incomeChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(monthlyData.incomeChange))}%
                </Text>
              )}
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Expenses</Text>
              <Text style={[styles.summaryValue, { color: EV.danger }]}>₱{monthlyData.totalExpenses.toFixed(2)}</Text>
              {monthlyData.expenseChange && (
                <Text style={[styles.summaryChange, { color: parseFloat(monthlyData.expenseChange) >= 0 ? EV.danger : EV.primary }]}>
                  {parseFloat(monthlyData.expenseChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(monthlyData.expenseChange))}%
                </Text>
              )}
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Balance</Text>
              <Text style={[styles.summaryValue, { color: monthlyData.balance >= 0 ? EV.primary : EV.danger }]}>
                ₱{monthlyData.balance.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {yearlyData && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>YEARLY SUMMARY</Text>
          <Text style={styles.summarySubtitle}>{yearlyData.year}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Income</Text>
              <Text style={[styles.summaryValue, { color: EV.primary }]}>₱{yearlyData.totalIncome.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Expenses</Text>
              <Text style={[styles.summaryValue, { color: EV.danger }]}>₱{yearlyData.totalExpenses.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Balance</Text>
              <Text style={[styles.summaryValue, { color: yearlyData.balance >= 0 ? EV.primary : EV.danger }]}>
                ₱{yearlyData.balance.toFixed(2)}
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 10}]}>MONTHLY EXPENSES</Text>
          {yearlyData.monthly.map((m: any) => (
            (() => {
              const expenseFillPct = m.income > 0
                ? Math.min((m.expenses / m.income) * 100, 100)
                : m.expenses > 0
                  ? 100
                  : 0;

              return (
                <View key={m.month} style={styles.trendRow}>
                  <Text style={styles.trendMonth}>{new Date(yearlyData.year, m.month - 1).toLocaleDateString('en', { month: 'short' })}</Text>
                  <View style={styles.trendTrack}>
                    <View
                      style={[
                        styles.trendBar,
                        { width: `${expenseFillPct}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.trendExpenseValue}>₱{m.expenses.toFixed(0)}</Text>
                </View>
              );
            })()
          ))}
        </View>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={EV.bg} />

      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={require('@/assets/images/logoGogreen.jpeg')} style={styles.headerLogo} />
          <Text style={styles.headerTitle}>Budget Tracker</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'overview' && styles.tabActive]} onPress={() => setTab('overview')}>
          <Text style={[styles.tabText, tab === 'overview' && styles.tabTextActive]}>Overview</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'calendar' && styles.tabActive]} onPress={() => setTab('calendar')}>
          <Text style={[styles.tabText, tab === 'calendar' && styles.tabTextActive]}>Calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'summary' && styles.tabActive]} onPress={() => setTab('summary')}>
          <Text style={[styles.tabText, tab === 'summary' && styles.tabTextActive]}>Summary</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={EV.primary} />
        </View>
      ) : noUser ? (
        <View style={styles.loader}>
          <Ionicons name="person-circle-outline" size={64} color={EV.textMuted} />
          <Text style={styles.emptyText}>Please login to view budget</Text>
        </View>
      ) : (
        <View style={styles.content}>
          {tab === 'overview' && renderOverview()}
          {tab === 'calendar' && renderCalendar()}
          {tab === 'summary' && renderSummary()}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: EV.bg },
  header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: EV.border },
  headerLogo: { width: 40, height: 40, borderRadius: 10, shadowColor: '#a1a1a1', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: EV.text },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: EV.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: EV.bgCard },
  tabActive: { backgroundColor: EV.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: EV.textMuted },
  tabTextActive: { color: EV.bg },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText: { fontSize: 16, color: EV.textMuted, fontWeight: '600' },
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: EV.danger + '18', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: EV.danger },
  alertText: { flex: 1, color: EV.danger, fontWeight: '700', fontSize: 14 },
  balanceCard: { backgroundColor: EV.bgCard, borderRadius: 20, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: EV.border, overflow: 'hidden' },
  balanceGlow: { position: 'absolute', top: -50, right: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: EV.primary + '0C' },
  balanceLabel: { fontSize: 11, color: EV.textMuted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  balanceAmount: { fontSize: 40, fontWeight: '900', marginBottom: 20 },
  balanceRow: { flexDirection: 'row', gap: 16 },
  balanceItem: { flex: 1, alignItems: 'center', gap: 6 },
  balanceItemLabel: { fontSize: 11, color: EV.textMuted, fontWeight: '600' },
  balanceItemValue: { fontSize: 16, color: EV.text, fontWeight: '800' },
  balanceDivider: { width: 1, backgroundColor: EV.border },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: EV.primary, letterSpacing: 1.5 },
  transactionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: EV.bgCard, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: EV.border },
  transactionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  transactionInfo: { flex: 1 },
  transactionLabel: { fontSize: 14, fontWeight: '700', color: EV.text, marginBottom: 2 },
  transactionDate: { fontSize: 11, color: EV.textDim },
  transactionAmount: { fontSize: 15, fontWeight: '800' },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 8 },
  calendarNavBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: EV.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: EV.border },
  calendarTitleContainer: { alignItems: 'center' },
  calendarTitle: { fontSize: 20, fontWeight: '800', color: EV.text },
  calendarYear: { fontSize: 13, color: EV.textMuted, fontWeight: '600', marginTop: 2 },
  calendarLegend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 16, paddingVertical: 12, backgroundColor: EV.bgCard, borderRadius: 12, borderWidth: 1, borderColor: EV.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: EV.textMuted, fontWeight: '600' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20, backgroundColor: EV.bgCard, borderRadius: 16, padding: 8, borderWidth: 1, borderColor: EV.border },
  calendarDayLabelContainer: { width: `${100/7}%`, paddingVertical: 8, alignItems: 'center' },
  calendarDayLabel: { fontSize: 11, fontWeight: '700', color: EV.textMuted, textTransform: 'uppercase' },
  calendarDayEmpty: { width: `${100/7}%`, aspectRatio: 1, padding: 2 },
  calendarDayCell: { width: `${100/7}%`, aspectRatio: 1, padding: 2, alignItems: 'center', justifyContent: 'center' },
  calendarDayCellInner: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: EV.bgSurface, borderRadius: 10, borderWidth: 1, borderColor: EV.border },
  calendarDayToday: { backgroundColor: EV.primary, borderColor: EV.primary, borderWidth: 2 },
  calendarDaySelected: { backgroundColor: EV.primary + '20', borderColor: EV.primary, borderWidth: 2 },
  calendarDayActive: { backgroundColor: EV.bgSurface, borderColor: EV.border },
  calendarDayText: { fontSize: 14, fontWeight: '700', color: EV.text, marginBottom: 2 },
  calendarDayTextToday: { color: EV.bg },
  calendarDayTextSelected: { color: EV.primary },
  calendarDayAmount: { fontSize: 9, fontWeight: '700', color: EV.textDim, marginTop: 2 },
  calendarDots: { flexDirection: 'row', gap: 3, marginTop: 2 },
  calendarDot: { width: 5, height: 5, borderRadius: 2.5 },
  dailyBreakdown: { backgroundColor: EV.bgCard, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: EV.border, marginBottom: 16 },
  dailyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  dailyTitle: { fontSize: 18, fontWeight: '800', color: EV.text, marginBottom: 4 },
  dailySubtitle: { fontSize: 13, color: EV.textMuted, fontWeight: '600' },
  dailyCloseBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: EV.bgSurface, alignItems: 'center', justifyContent: 'center' },
  dailyStats: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  dailyStatCard: { flex: 1, backgroundColor: EV.bgSurface, borderRadius: 14, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1 },
  dailyStatLabel: { fontSize: 10, color: EV.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  dailyStatValue: { fontSize: 13, fontWeight: '900' },
  emptyDaily: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  emptyDailyText: { fontSize: 14, color: EV.textDim, fontWeight: '600' },
  summaryCard: { backgroundColor: EV.bgCard, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: EV.border },
  summaryTitle: { fontSize: 11, fontWeight: '700', color: EV.primary, letterSpacing: 1.5, marginBottom: 4 },
  summarySubtitle: { fontSize: 16, fontWeight: '800', color: EV.text, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', gap: 16 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: EV.textMuted, fontWeight: '600', marginBottom: 6 },
  summaryValue: { fontSize: 17, fontWeight: '900', marginBottom: 4 },
  summaryChange: { fontSize: 11, fontWeight: '700' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  trendMonth: { width: 40, fontSize: 12, fontWeight: '700', color: EV.textMuted },
  trendTrack: { flex: 1, height: 12, borderRadius: 999, backgroundColor: EV.bgSurface, overflow: 'hidden', borderWidth: 1, borderColor: EV.border },
  trendBar: { height: '100%', borderRadius: 999, backgroundColor: EV.danger },
  trendExpenseValue: { width: 68, fontSize: 12, fontWeight: '800', textAlign: 'right', color: EV.text },
});
