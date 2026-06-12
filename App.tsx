import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StandaloneTerminal } from './src/terminal/StandaloneTerminal';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_400Regular,
  });

  if (!fontsLoaded && !fontError) {
    return <View style={s.bootSplash} />;
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaProvider>
        <View style={s.webStage}>
          <View style={s.phoneShadow}>
            <View style={s.phoneFrame}>
              <View style={s.phoneNotch} />
              <StandaloneTerminal />
            </View>
          </View>
        </View>
        <StatusBar style="light" />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StandaloneTerminal />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  webStage: {
    flex: 1,
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8E8E0',
    padding: 20,
  },
  phoneShadow: {
    width: 393,
    height: '100%',
    maxHeight: 852,
    borderRadius: 44,
    backgroundColor: '#D2D0C8',
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.58,
    shadowRadius: 16,
    elevation: 24,
  },
  phoneFrame: {
    flex: 1,
    minHeight: 620,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: '#06070A',
  },
  phoneNotch: {
    position: 'absolute',
    top: 8,
    left: '50%',
    width: 76,
    height: 4,
    marginLeft: -38,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    zIndex: 50,
  },
  bootSplash: {
    flex: 1,
    backgroundColor: '#06070A',
  },
});
