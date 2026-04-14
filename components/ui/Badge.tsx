import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  label: string;
  color?: string;
  textColor?: string;
  size?: BadgeSize;
}

/**
 * Converts a hex color to rgba with the given opacity.
 */
function hexToRgba(hex: string, opacity: number): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const Badge: React.FC<BadgeProps> = ({
  label,
  color = '#2E7D32',
  textColor,
  size = 'md',
}) => {
  const resolvedTextColor = textColor ?? color;
  const backgroundColor = hexToRgba(color, 0.22);

  return (
    <View
      style={[
        styles.base,
        sizeStyles[size],
        { backgroundColor },
      ]}
    >
      <Text
        style={[
          styles.textBase,
          textSizeStyles[size],
          { color: resolvedTextColor },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: 999,
  },
  textBase: {
    fontWeight: '600',
    textAlign: 'center',
  },
});

const sizeStyles = StyleSheet.create({
  sm: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  md: {
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
});

const textSizeStyles = StyleSheet.create({
  sm: {
    fontSize: 11,
    lineHeight: 16,
  },
  md: {
    fontSize: 13,
    lineHeight: 18,
  },
});

export default React.memo(Badge);
