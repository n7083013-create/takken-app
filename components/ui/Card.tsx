import React from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ViewStyle,
  GestureResponderEvent,
} from 'react-native';

type CardVariant = 'default' | 'elevated' | 'outlined' | 'flat';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  padding?: number;
  onPress?: (event: GestureResponderEvent) => void;
  style?: ViewStyle;
}

const COLORS = {
  background: '#FFFFFF',
  surface: '#F8FAF8',
  border: '#E0E0E0',
};

const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 16,
  onPress,
  style,
}) => {
  const cardStyle: ViewStyle[] = [
    styles.base,
    variantStyles[variant],
    { padding },
    style,
  ].filter(Boolean) as ViewStyle[];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          ...cardStyle,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});

const variantStyles = StyleSheet.create({
  default: {
    backgroundColor: COLORS.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  elevated: {
    backgroundColor: COLORS.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  outlined: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  flat: {
    backgroundColor: COLORS.surface,
  },
});

export default React.memo(Card);
