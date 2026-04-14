import React, { useCallback } from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
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

const COLORS = {
  primary: '#2E7D32',
  primaryDark: '#1B5E20',
  secondary: '#558B2F',
  secondaryDark: '#33691E',
  danger: '#D32F2F',
  dangerDark: '#B71C1C',
  white: '#FFFFFF',
  gray100: '#F5F5F5',
  gray300: '#E0E0E0',
  gray500: '#9E9E9E',
  gray700: '#616161',
  transparent: 'transparent',
};

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
  const isDisabled = disabled || loading;

  const containerStyle: ViewStyle[] = [
    styles.base,
    sizeStyles[size],
    variantStyles[variant],
    fullWidth && styles.fullWidth,
    isDisabled && styles.disabled,
  ].filter(Boolean) as ViewStyle[];

  const textStyle: TextStyle[] = [
    styles.textBase,
    textSizeStyles[size],
    variantTextStyles[variant],
    isDisabled && styles.disabledText,
  ].filter(Boolean) as TextStyle[];

  const indicatorColor =
    variant === 'outline' || variant === 'ghost' ? COLORS.primary : COLORS.white;

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
        <ActivityIndicator size="small" color={indicatorColor} />
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
    borderRadius: 12,
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
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  textBase: {
    fontWeight: '700',
    textAlign: 'center',
  },
});

const sizeStyles = StyleSheet.create({
  sm: { paddingVertical: 8, paddingHorizontal: 16, minHeight: 36 },
  md: { paddingVertical: 12, paddingHorizontal: 24, minHeight: 48 },
  lg: { paddingVertical: 16, paddingHorizontal: 32, minHeight: 56 },
});

const textSizeStyles = StyleSheet.create({
  sm: { fontSize: 13, lineHeight: 18 },
  md: { fontSize: 15, lineHeight: 20 },
  lg: { fontSize: 17, lineHeight: 24 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: COLORS.primary },
  secondary: { backgroundColor: COLORS.secondary },
  outline: {
    backgroundColor: COLORS.transparent,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  ghost: { backgroundColor: COLORS.transparent },
  danger: { backgroundColor: COLORS.danger },
});

const variantTextStyles = StyleSheet.create({
  primary: { color: COLORS.white },
  secondary: { color: COLORS.white },
  outline: { color: COLORS.primary },
  ghost: { color: COLORS.primary },
  danger: { color: COLORS.white },
});

export default React.memo(Button);
