import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { COLORS } from '../utils/colors';
import RavenService from '../services/RavenService';

const { width } = Dimensions.get('window');

export default function MetricsScreen() {
  const [metrics, setMetrics] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    loadMetrics();
    setupListeners();

    // Poll for metrics every 5 seconds
    const interval = setInterval(loadMetrics, 5000);

    return () => {
      clearInterval(interval);
      RavenService.off('metrics', handleMetrics);
      RavenService.off('connect', handleConnect);
      RavenService.off('disconnect', handleDisconnect);
    };
  }, []);

  const loadMetrics = async () => {
    try {
      const data = await RavenService.fetchMetrics();
      setMetrics(data);
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const setupListeners = () => {
    RavenService.on('metrics', handleMetrics);
    RavenService.on('connect', handleConnect);
    RavenService.on('disconnect', handleDisconnect);
    setIsConnected(RavenService.isConnected);
  };

  const handleMetrics = (data) => {
    setMetrics(data);
  };

  const handleConnect = () => {
    setIsConnected(true);
    loadMetrics();
  };

  const handleDisconnect = () => {
    setIsConnected(false);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadMetrics();
  };

  const renderMetricCard = (title, value, unit, color, subtitle) => (
    <View style={styles.metricCard}>
      <Text style={styles.metricTitle}>{title}</Text>
      <View style={styles.metricValueContainer}>
        <Text style={[styles.metricValue, { color }]}>
          {value !== null && value !== undefined ? value.toFixed(1) : '--'}
        </Text>
        <Text style={styles.metricUnit}>{unit}</Text>
      </View>
      {subtitle && <Text style={styles.metricSubtitle}>{subtitle}</Text>}
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.min(value || 0, 100)}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>System Metrics</Text>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: isConnected ? COLORS.success : COLORS.error },
          ]}
        />
      </View>

      {metrics ? (
        <View style={styles.metricsGrid}>
          {renderMetricCard(
            'CPU Usage',
            metrics.cpu_usage || metrics.cpuUsage,
            '%',
            COLORS.primary,
            'Current load'
          )}

          {renderMetricCard(
            'Memory Usage',
            metrics.memory_usage || metrics.memoryUsage,
            '%',
            COLORS.info,
            `${((metrics.memory_used || metrics.memoryUsed || 0) / 1024).toFixed(1)} GB used`
          )}

          {metrics.disk_usage !== undefined && renderMetricCard(
            'Disk Usage',
            metrics.disk_usage,
            '%',
            COLORS.warning,
            `${((metrics.disk_used || 0) / 1024).toFixed(0)} GB used`
          )}

          {metrics.uptime && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>System Uptime</Text>
              <Text style={styles.infoValue}>
                {formatUptime(metrics.uptime)}
              </Text>
            </View>
          )}

          {metrics.timestamp && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Last Updated</Text>
              <Text style={styles.infoValue}>
                {new Date(metrics.timestamp).toLocaleTimeString()}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading metrics...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  metricsGrid: {
    gap: 16,
  },
  metricCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  metricTitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 8,
    fontWeight: '600',
  },
  metricValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 36,
    fontWeight: 'bold',
    marginRight: 4,
  },
  metricUnit: {
    fontSize: 18,
    color: COLORS.textMuted,
  },
  metricSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 16,
  },
});
