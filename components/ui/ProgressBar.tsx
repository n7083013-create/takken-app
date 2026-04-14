import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

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
  color = '#2E7D32',
  trackColor = '#E8F5E9',
  height = 10,
  showLabel = false,
  labelPosition = 'right',
}) => {
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
          { backgroundColor: trackColor, height, borderRadius: height / 2 },
        ]}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: color,
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
            <Text style={styles.insideLabel}>{percentText}</Text>
          )}
        </Animated.View>
      </View>

      {showLabel && labelPosition === 'right' && (
        <Text style={styles.rightLabel}>{percentText}</Text>
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
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    paddingRight: 6,
  },
  rightLabel: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#424242',
    minWidth: 36,
  },
});

export default React.memo(ProgressBar);
