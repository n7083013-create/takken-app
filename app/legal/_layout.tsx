import { Stack } from 'expo-router';
import { useThemeColors } from '../../hooks/useThemeColors';

export default function LegalLayout() {
  const colors = useThemeColors();
  return <Stack screenOptions={{ headerTintColor: colors.primary }} />;
}
