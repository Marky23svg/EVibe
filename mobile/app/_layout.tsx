import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { EV } from '@/constants/theme';
import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EVTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: EV.primary,
    background: EV.bg,
    card: EV.bgCard,
    text: EV.text,
    border: EV.border,
  },
};

export const unstable_settings = {
  initialRouteName: 'login',
};

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          router.replace('/(tabs)');
        } else {
          router.replace('/login');
        }
      } catch {
        router.replace('/login');
      }
    };
    checkAuth();
  }, []);

  return (
    <ThemeProvider value={EVTheme}>
      <Stack initialRouteName="login">
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add-income" options={{ headerShown: false }} />
        <Stack.Screen name="add-expense" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
