import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EV } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState({ name: '', email: '' });
  const [editedName, setEditedName] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        setUser(userData);
        setEditedName(userData.name || '');
      }
    } catch (error) {
      console.log('Error loading user data:', error);
    }
  };

  const handleSaveName = async () => {
    if (!editedName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        userData.name = editedName.trim();
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        setIsEditing(false);
        Alert.alert('Success', 'Name updated successfully');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update name');
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove(['user', 'token']);
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={EV.bg} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={EV.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.container}>
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Name</Text>
              <View style={styles.nameContainer}>
                {isEditing ? (
                  <View style={styles.editContainer}>
                    <TextInput
                      style={styles.nameInput}
                      value={editedName}
                      onChangeText={setEditedName}
                      placeholder="Enter your name"
                      placeholderTextColor={EV.textMuted}
                    />
                    <View style={styles.editButtons}>
                      <TouchableOpacity onPress={() => setIsEditing(false)} style={styles.cancelBtn}>
                        <Ionicons name="close" size={20} color={EV.danger} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveName} style={styles.saveBtn}>
                        <Ionicons name="checkmark" size={20} color={EV.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.nameDisplay}>
                    <Text style={styles.value}>{user.name}</Text>
                    <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editBtn}>
                      <Ionicons name="pencil" size={18} color={EV.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{user.email}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color={EV.danger} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: EV.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: EV.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: EV.text },
  placeholder: { width: 40 },
  container: { flex: 1, padding: 20 },
  profileSection: { alignItems: 'center' },
  avatarContainer: { marginBottom: 30 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: EV.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: 'white' },
  infoCard: {
    width: '100%',
    backgroundColor: EV.bgCard,
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: EV.border,
  },
  infoRow: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: EV.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontSize: 16, fontWeight: '600', color: EV.text },
  nameContainer: { width: '100%' },
  nameDisplay: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editBtn: { padding: 8, borderRadius: 8, backgroundColor: EV.primary + '20' },
  editContainer: { gap: 12 },
  nameInput: {
    fontSize: 16,
    fontWeight: '600',
    color: EV.text,
    borderWidth: 1,
    borderColor: EV.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: EV.bgSurface,
  },
  editButtons: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  cancelBtn: { padding: 8, borderRadius: 8, backgroundColor: EV.danger + '20' },
  saveBtn: { padding: 8, borderRadius: 8, backgroundColor: EV.primary + '20' },
  divider: { height: 1, backgroundColor: EV.border, marginVertical: 8 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: EV.danger + '18',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: EV.danger + '40',
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: EV.danger },
});