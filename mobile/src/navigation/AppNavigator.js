import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COLORS } from '../utils/colors';

// Screens
import ConnectionScreen from '../screens/ConnectionScreen';
import ProjectListScreen from '../screens/ProjectListScreen';
import EventFeedScreen from '../screens/EventFeedScreen';
import MetricsScreen from '../screens/MetricsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs({ route }) {
  const { projectName } = route.params;

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.surfaceLight,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        headerStyle: {
          backgroundColor: COLORS.surface,
          borderBottomColor: COLORS.surfaceLight,
          borderBottomWidth: 1,
        },
        headerTintColor: COLORS.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Events"
        component={EventFeedScreen}
        initialParams={{ projectName }}
        options={{
          title: `${projectName} - Events`,
          tabBarIcon: ({ color }) => <TabIcon emoji="📝" color={color} />,
        }}
      />
      <Tab.Screen
        name="Metrics"
        component={MetricsScreen}
        options={{
          title: 'System Metrics',
          tabBarIcon: ({ color }) => <TabIcon emoji="📊" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

function TabIcon({ emoji, color }) {
  return (
    <Text style={{ fontSize: 24, opacity: color === COLORS.primary ? 1 : 0.6 }}>
      {emoji}
    </Text>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="Connection" component={ConnectionScreen} />
        <Stack.Screen name="ProjectList" component={ProjectListScreen} />
        <Stack.Screen name="MainTabs" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
