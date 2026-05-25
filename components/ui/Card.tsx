import React, { useMemo } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ViewStyle,
  GestureResponderEvent,
} from 'react-native';
import { BorderRadius, Spacing } from '../../constants/theme';
import { useThemeColors } from '../../hooks/useThemeColors';
import { resolveCardVariantStyle, CardVariant } from './variantStyles';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  padding?: number;
  onPress?: (event: GestureResponderEvent) => void;
  style?: ViewStyle;
}

const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = Spacing.lg,
  onPress,
  style,
}) => {
  const colors = useThemeColors();
  const variantStyle = useMemo(() => resolveCardVariantStyle(variant, colors), [variant, colors]);

  const cardStyle: ViewStyle[] = [
    styles.base,
    variantStyle,
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
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});

export default React.memo(Card);
