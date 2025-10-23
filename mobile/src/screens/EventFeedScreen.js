import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { COLORS } from '../utils/colors';
import { APP_CONFIG } from '../utils/constants';
import EventCard from '../components/EventCard';
import RavenService from '../services/RavenService';

export default function EventFeedScreen({ route }) {
  const { projectName } = route.params;
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    loadInitialEvents();
    setupRealtimeListeners();

    return () => {
      // Cleanup listeners
      RavenService.off('event', handleNewEvent);
      RavenService.off('connect', handleConnect);
      RavenService.off('disconnect', handleDisconnect);
    };
  }, [projectName]);

  const loadInitialEvents = async () => {
    try {
      const data = await RavenService.fetchEvents(
        projectName,
        APP_CONFIG.MAX_EVENTS_DISPLAY
      );
      setEvents(data.events || []);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const setupRealtimeListeners = () => {
    RavenService.on('event', handleNewEvent);
    RavenService.on('connect', handleConnect);
    RavenService.on('disconnect', handleDisconnect);
    setIsConnected(RavenService.isConnected);
  };

  const handleNewEvent = useCallback(
    (event) => {
      // Only add events for this project
      if (event.project_name === projectName) {
        setEvents((prev) => {
          const updated = [event, ...prev];
          // Keep only the most recent events
          return updated.slice(0, APP_CONFIG.MAX_EVENTS_DISPLAY);
        });
      }
    },
    [projectName]
  );

  const handleConnect = () => {
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadInitialEvents();
  };

  const renderHeader = () => (
    <View style={styles.connectionStatus}>
      <View
        style={[
          styles.statusDot,
          { backgroundColor: isConnected ? COLORS.success : COLORS.error },
        ]}
      />
      <Text style={styles.statusText}>
        {isConnected ? 'Live' : 'Disconnected'}
      </Text>
      {isConnected && (
        <Text style={styles.eventCount}>
          {events.length} events
        </Text>
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading events...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        renderItem={({ item }) => <EventCard event={item} />}
        keyExtractor={(item, index) =>
          `${item.id || index}-${item.timestamp}`
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No events yet</Text>
            <Text style={styles.emptySubtext}>
              Waiting for file changes in {projectName}...
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  eventCount: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
