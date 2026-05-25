import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { FontSize, FontWeight, Spacing } from '../../constants/theme';
import { useThemeColors } from '../../hooks/useThemeColors';

interface ProgressBarProps {
  progress: number; // 0 to 1
  color?: string;
  trackColor?: string;
  height?: number;
  showLabel?: boolean;
  labelPosition?: 'inside' | 'right';
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  color,
  trackColor,
  height = 10,
  showLabel = false,
  labelPosition = 'right',
}) => {
  const colors = useThemeColors();
  // 未指定時はテーマ primary / primarySurface にフォールバック (ダーク追従)
  const resolvedColor = color ?? colors.primary;
  const resolvedTrack = trackColor ?? colors.primarySurface;

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const animatedWidth = useRef(new Animated.Value(clampedProgress)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: clampedProgress,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [clampedProgress, animatedWidth]);

  const percentText = `${Math.round(clampedProgress * 100)}%`;
  const showInsideLabel = showLabel && labelPosition === 'inside' && height >= 18;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.track,
          { backgroundColor: resolvedTrack, height, borderRadius: height / 2 },
        ]}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: resolvedColor,
              borderRadius: height / 2,
              height,
              width: animatedWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        >
          {showInsideLabel && (
            <Text style={[styles.insideLabel, { color: colors.onPrimary }]}>
              {percentText}
            </Text>
          )}
        </Animated.View>
      </View>

      {showLabel && labelPosition === 'right' && (
        <Text style={[styles.rightLabel, { color: colors.textSecondary }]}>
          {percentText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  track: {
    flex: 1,
    overflow: 'hidden',
  },
  fill: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    minWidth: 2,
  },
  insideLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    paddingRight: 6,
  },
  rightLabel: {
    marginLeft: Spacing.sm,
    fontSize: FontSize.footnote,
    fontWeight: FontWeight.semibold,
    minWidth: 36,
  },
});

export default React.memo(ProgressBar);
