import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { logError } from '../services/errorLogger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/* Theme-aware fallback UI (functional component so we can use hooks) */
function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const bg = dark ? '#111312' : '#F5F6F3';
  const primary = dark ? '#3DBA5E' : '#1B7A3D';
  const textColor = dark ? '#F2F2F7' : '#1D1D1F';
  const textSec = dark ? '#A1A1A6' : '#555658';

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={[styles.iconCircle, { backgroundColor: primary }]}>
        <Text style={styles.iconText}>!</Text>
      </View>
      <Text style={[styles.title, { color: textColor }]}>
        予期せぬエラーが発生しました
      </Text>
      <Text style={[styles.message, { color: textSec }]}>
        アプリを再起動してください
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: primary }]}
        onPress={onRetry}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>再試行</Text>
      </TouchableOpacity>
    </View>
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(error, {
      context: 'ErrorBoundary',
      extra: { componentStack: info.componentStack ?? undefined },
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
