import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getProjectColor, COLORS } from '../utils/colors';

export default function ProjectBadge({ projectName, size = 'medium' }) {
  const backgroundColor = getProjectColor(projectName);

  const sizeStyles = {
    small: { paddingHorizontal: 6, paddingVertical: 2, fontSize: 10 },
    medium: { paddingHorizontal: 10, paddingVertical: 4, fontSize: 12 },
    large: { paddingHorizontal: 14, paddingVertical: 6, fontSize: 14 },
  };

  const style = sizeStyles[size] || sizeStyles.medium;

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.text, { fontSize: style.fontSize }]}>
        {projectName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: {
    color: COLORS.background,
    fontWeight: '600',
    fontSize: 12,
  },
});
