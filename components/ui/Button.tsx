import React, { useCallback, useMemo } from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import {
  BorderRadius,
  FontSize,
  FontWeight,
  LineHeight,
  Spacing,
} from '../../constants/theme';
import { useThemeColors } from '../../hooks/useThemeColors';
import { resolveButtonVariantStyle, ButtonVariant } from './variantStyles';

type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
}) => {
  const colors = useThemeColors();
  const isDisabled = disabled || loading;

  const variantStyle = useMemo(() => resolveButtonVariantStyle(variant, colors), [variant, colors]);

  const containerStyle: ViewStyle[] = [
    styles.base,
    sizeStyles[size],
    variantStyle.container,
    fullWidth && styles.fullWidth,
    isDisabled && styles.disabled,
  ].filter(Boolean) as ViewStyle[];

  const textStyle: TextStyle[] = [
    styles.textBase,
    textSizeStyles[size],
    variantStyle.text,
    isDisabled && styles.disabledText,
  ].filter(Boolean) as TextStyle[];

  const handlePress = useCallback(() => {
    if (!isDisabled && onPress) onPress();
  }, [isDisabled, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        ...containerStyle,
        pressed && !isDisabled && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyle.indicator} />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === 'left' && (
            <View style={styles.iconLeft}>{icon}</View>
          )}
          <Text style={textStyle}>{title}</Text>
          {icon && iconPosition === 'right' && (
            <View style={styles.iconRight}>{icon}</View>
          )}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft: {
    marginRight: Spacing.sm,
  },
  iconRight: {
    marginLeft: Spacing.sm,
  },
  textBase: {
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
});

const sizeStyles = StyleSheet.create({
  sm: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, minHeight: 36 },
  md: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl, minHeight: 48 },
  lg: { paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xxxl, minHeight: 56 },
});

const textSizeStyles = StyleSheet.create({
  sm: { fontSize: FontSize.footnote, lineHeight: LineHeight.footnote },
  md: { fontSize: FontSize.subhead, lineHeight: LineHeight.subhead },
  lg: { fontSize: FontSize.callout, lineHeight: LineHeight.callout },
});

export default React.memo(Button);
