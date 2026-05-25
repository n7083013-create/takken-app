import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BorderRadius, FontSize, FontWeight, LineHeight, Spacing } from '../../constants/theme';
import { useThemeColors } from '../../hooks/useThemeColors';
import { hexToRgba } from './variantStyles';

type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  label: string;
  color?: string;
  textColor?: string;
  size?: BadgeSize;
}

const Badge: React.FC<BadgeProps> = ({
  label,
  color,
  textColor,
  size = 'md',
}) => {
  const colors = useThemeColors();
  // 引数未指定時はテーマの primary にフォールバック (ダーク/ライト追従)
  const resolvedColor = color ?? colors.primary;
  const resolvedTextColor = textColor ?? resolvedColor;
  const backgroundColor = hexToRgba(resolvedColor, 0.22);

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
    borderRadius: BorderRadius.full,
  },
  textBase: {
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
});

const sizeStyles = StyleSheet.create({
  sm: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
  },
  md: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
});

const textSizeStyles = StyleSheet.create({
  sm: {
    fontSize: FontSize.caption2,
    lineHeight: LineHeight.caption,
  },
  md: {
    fontSize: FontSize.footnote,
    lineHeight: LineHeight.footnote,
  },
});

export default React.memo(Badge);
