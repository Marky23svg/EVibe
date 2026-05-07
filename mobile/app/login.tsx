import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login } from '@/services/api';
import { EV } from '@/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please fill in all fields');
    setLoading(true);
    try {
      const res = await login(email, password);
      await AsyncStorage.setItem('token', res.data.token);
      await AsyncStorage.setItem('user', JSON.stringify(res.data.user));
      router.replace('/(tabs)/home');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require('@/assets/images/logoGogreen.jpeg')} style={styles.logo} />
      <Text style={styles.title}>GoGreen</Text>
      <Text style={styles.subtitle}>Welcome back</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={EV.textDim}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={EV.textDim}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color={EV.white} /> : <Text style={styles.buttonText}>Log In</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/signup')}>
        <Text style={styles.link}>Don't have an account? <Text style={styles.linkBold}>Sign Up</Text></Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EV.bg, justifyContent: 'center', paddingHorizontal: 28 },
  logo: { width: 80, height: 80, borderRadius: 16, alignSelf: 'center', marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
  title: { fontSize: 40, fontWeight: 'bold', color: EV.primary, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 16, color: EV.textMuted, textAlign: 'center', marginBottom: 36 },
  input: { backgroundColor: EV.bgCard, color: EV.text, borderColor: EV.border, borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 14, fontSize: 15 },
  button: { backgroundColor: EV.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 6, marginBottom: 20 },
  buttonText: { color: EV.white, fontWeight: 'bold', fontSize: 16 },
  link: { color: EV.textMuted, textAlign: 'center', fontSize: 14 },
  linkBold: { color: EV.primary, fontWeight: 'bold' },
});
