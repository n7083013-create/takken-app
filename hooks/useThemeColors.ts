// ============================================================
// テーマカラーを返すフック
// settings.themeMode に応じて light/dark を切替
// ============================================================

import { useColorScheme } from 'react-native';
import { Colors as LightColors } from '../constants/theme';
import { DarkColors } from '../constants/darkTheme';
import { useSettingsStore } from '../store/useSettingsStore';

export type ThemeColors = typeof LightColors;

export function useThemeColors(): ThemeColors {
  const mode = useSettingsStore((s) => s.settings.themeMode);
  const system = useColorScheme();
  const isDark =
    mode === 'dark' || (mode === 'system' && system === 'dark');
  return (isDark ? DarkColors : LightColors) as ThemeColors;
}

export function useIsDark(): boolean {
  const mode = useSettingsStore((s) => s.settings.themeMode);
  const system = useColorScheme();
  return mode === 'dark' || (mode === 'system' && system === 'dark');
}
