import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../utils/colors';
import { EVENT_TYPES } from '../utils/constants';
import ProjectBadge from './ProjectBadge';

const EVENT_ICONS = {
  [EVENT_TYPES.FILE_CREATED]: '📄',
  [EVENT_TYPES.FILE_MODIFIED]: '✏️',
  [EVENT_TYPES.FILE_DELETED]: '🗑️',
  [EVENT_TYPES.DIRECTORY_CREATED]: '📁',
  [EVENT_TYPES.DIRECTORY_DELETED]: '🗂️',
  [EVENT_TYPES.SYSTEM_METRIC]: '📊',
  [EVENT_TYPES.TRIGGER_FIRED]: '🔔',
};

export default function EventCard({ event }) {
  const icon = EVENT_ICONS[event.event_type] || '📌';
  const timestamp = new Date(event.timestamp).toLocaleTimeString();

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.headerText}>
          <Text style={styles.eventType}>{event.event_type}</Text>
          <Text style={styles.timestamp}>{timestamp}</Text>
        </View>
        {event.project_name && (
          <ProjectBadge projectName={event.project_name} size="small" />
        )}
      </View>

      {event.file_path && (
        <Text style={styles.filePath} numberOfLines={1}>
          {event.file_path}
        </Text>
      )}

      {event.details && (
        <Text style={styles.details} numberOfLines={2}>
          {event.details}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  icon: {
    fontSize: 20,
    marginRight: 8,
  },
  headerText: {
    flex: 1,
  },
  eventType: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  timestamp: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  filePath: {
    color: COLORS.textBright,
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  details: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
});
