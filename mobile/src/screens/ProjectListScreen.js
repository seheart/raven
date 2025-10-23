import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../utils/colors';
import { STORAGE_KEYS } from '../utils/constants';
import ProjectBadge from '../components/ProjectBadge';
import RavenService from '../services/RavenService';

export default function ProjectListScreen({ navigation }) {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setError(null);
      const data = await RavenService.fetchProjects();

      // Sort by file_count (most active first)
      const sorted = (data.projects || []).sort(
        (a, b) => (b.file_count || 0) - (a.file_count || 0)
      );

      setProjects(sorted);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadProjects();
  };

  const handleProjectSelect = async (project) => {
    try {
      // Save selected project
      await AsyncStorage.setItem(
        STORAGE_KEYS.SELECTED_PROJECT,
        project.name
      );

      // Navigate to main tabs
      navigation.replace('MainTabs', { projectName: project.name });
    } catch (error) {
      console.error('Error selecting project:', error);
    }
  };

  const renderProject = ({ item }) => (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() => handleProjectSelect(item)}
    >
      <View style={styles.projectHeader}>
        <ProjectBadge projectName={item.name} size="large" />
        <View style={styles.stats}>
          <Text style={styles.statText}>
            {item.file_count || 0} files
          </Text>
          <Text style={styles.statText}>
            {item.event_count || 0} events
          </Text>
        </View>
      </View>

      {item.last_activity && (
        <Text style={styles.lastActivity}>
          Last activity: {new Date(item.last_activity).toLocaleString()}
        </Text>
      )}
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading projects...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>❌ {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadProjects}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Projects</Text>
        <Text style={styles.subtitle}>
          Select a project to monitor
        </Text>
      </View>

      <FlatList
        data={projects}
        renderItem={renderProject}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No projects found
            </Text>
            <Text style={styles.emptySubtext}>
              Make sure Raven is monitoring some projects
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
    padding: 24,
  },
  header: {
    padding: 24,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  list: {
    padding: 16,
  },
  projectCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stats: {
    alignItems: 'flex-end',
  },
  statText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  lastActivity: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.background,
    fontWeight: '600',
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
