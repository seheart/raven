import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../utils/colors';
import { APP_CONFIG, STORAGE_KEYS } from '../utils/constants';
import RavenService from '../services/RavenService';

export default function ConnectionScreen({ navigation }) {
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState(APP_CONFIG.DEFAULT_PORT);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSavedUrl();
  }, []);

  const loadSavedUrl = async () => {
    try {
      const savedUrl = await AsyncStorage.getItem(STORAGE_KEYS.BACKEND_URL);
      if (savedUrl) {
        const match = savedUrl.match(/http:\/\/(.+):(\d+)/);
        if (match) {
          setIpAddress(match[1]);
          setPort(match[2]);
        }
      }
    } catch (error) {
      console.error('Error loading saved URL:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!ipAddress.trim()) {
      Alert.alert('Error', 'Please enter a valid IP address');
      return;
    }

    const url = `http://${ipAddress}:${port}`;
    setIsConnecting(true);

    try {
      // Test connection by fetching projects
      const response = await fetch(`${url}/api/projects/list`, {
        timeout: 5000,
      });

      if (!response.ok) {
        throw new Error('Backend not responding');
      }

      // Save URL and connect
      await AsyncStorage.setItem(STORAGE_KEYS.BACKEND_URL, url);
      RavenService.connect(url);

      // Navigate to project list
      navigation.replace('ProjectList');
    } catch (error) {
      Alert.alert(
        'Connection Failed',
        `Could not connect to ${url}\n\n${error.message}\n\nMake sure Raven backend is running and accessible.`
      );
    } finally {
      setIsConnecting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>🐦‍⬛ Raven Mobile</Text>
        <Text style={styles.subtitle}>Connect to your Raven backend</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Backend IP Address</Text>
          <TextInput
            style={styles.input}
            value={ipAddress}
            onChangeText={setIpAddress}
            placeholder="192.168.1.100"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={styles.label}>Port</Text>
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            placeholder="3030"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
          />

          <TouchableOpacity
            style={[
              styles.button,
              isConnecting && styles.buttonDisabled,
            ]}
            onPress={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.buttonText}>Connect</Text>
            )}
          </TouchableOpacity>

          <View style={styles.hint}>
            <Text style={styles.hintText}>💡 Make sure you're on the same WiFi network</Text>
            <Text style={styles.hintText}>💡 Raven backend should be running on port {port}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    color: COLORS.textBright,
    fontWeight: '600',
    marginBottom: -8,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    marginTop: 16,
    gap: 8,
  },
  hintText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
