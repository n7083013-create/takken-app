import { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { GlobalAIButton } from '../../components/GlobalAIButton';

function TabIcon({ icon, label, focused, colors }: { icon: string; label: string; focused: boolean; colors: ThemeColors }) {
  return (
    <View style={styles.tabIconContainer} accessibilityLabel={label} accessibilityRole="tab" accessibilityState={{ selected: focused }}>
      <Text style={[styles.tabEmoji, focused && styles.tabEmojiActive]}>{icon}</Text>
      <Text style={[styles.tabLabel, { color: focused ? colors.primary : colors.textTertiary }, focused && styles.tabLabelActiveWeight]}>{label}</Text>
      {focused && <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />}
    </View>
  );
}

export default function TabLayout() {
  const colors = useThemeColors();
  const tabBarStyle = useMemo(() => ({
    height: 84,
    paddingTop: 6,
    paddingBottom: 20,
    backgroundColor: colors.card,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 4,
  }), [colors]);

  return (
    <>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle,
        tabBarShowLabel: false,
        headerStyle: {
          backgroundColor: colors.card,
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
          letterSpacing: -0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏠" label="ホーム" focused={focused} colors={colors} />
          ),
        }}
      />
      <Tabs.Screen
        name="questions"
        options={{
          title: '問題集',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="📝" label="問題集" focused={focused} colors={colors} />
          ),
        }}
      />
      <Tabs.Screen
        name="quick-quiz"
        options={{
          title: '一問一答',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="⚡" label="一問一答" focused={focused} colors={colors} />
          ),
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: '復習',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🔄" label="復習" focused={focused} colors={colors} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: '記録',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="📊" label="記録" focused={focused} colors={colors} />
          ),
        }}
      />
      {/* flashcards is kept as a file but hidden from tabs */}
      <Tabs.Screen
        name="flashcards"
        options={{
          href: null,
        }}
      />
    </Tabs>
    <GlobalAIButton />
    </>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 56,
  },
  tabEmoji: {
    fontSize: 22,
    opacity: 0.45,
  },
  tabEmojiActive: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  tabLabelActiveWeight: {
    fontWeight: '700',
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
});
