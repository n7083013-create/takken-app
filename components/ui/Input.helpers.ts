// ============================================================
// Input 共通部品の純関数ヘルパー (T8 Phase 2)
// ============================================================
// JSX を含む Input.tsx は ts-jest (node 環境) では parse できないため、
// variant/state 解決を純関数として切り出し、Input.test.tsx で単体テスト可能にする。
// 設計仕様: ObsidianVault/10_Projects/資格アプリ開発/2026-05-27_T8_Input共通部品_仕様.md

import type {
  ReturnKeyTypeOptions,
  KeyboardTypeOptions,
  TextInputProps as RNTextInputProps,
} from 'react-native';
import type { ThemeColors } from '../../hooks/useThemeColors';

export type InputVariant =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'multiline'
  | 'search';

export interface InputProps {
  value: string;
  onChangeText: (text: string) => void;

  variant?: InputVariant;

  error?: string;
  disabled?: boolean;
  loading?: boolean;

  label?: string;
  required?: boolean;
  helperText?: string;
  placeholder?: string;

  rows?: number;
  maxLength?: number;

  onClear?: () => void;

  accessibilityLabel?: string;
  accessibilityHint?: string;

  autoFocus?: boolean;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: RNTextInputProps['onSubmitEditing'];
  onBlur?: RNTextInputProps['onBlur'];
  onFocus?: RNTextInputProps['onFocus'];
  autoComplete?: RNTextInputProps['autoComplete'];
  keyboardType?: KeyboardTypeOptions;
  testID?: string;
  containerStyle?: RNTextInputProps['style'];
  inputStyle?: RNTextInputProps['style'];
}

export interface VariantProps {
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: RNTextInputProps['autoComplete'];
  autoCorrect?: boolean;
  secureTextEntry?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  returnKeyType?: ReturnKeyTypeOptions;
  textAlignVertical?: 'auto' | 'top' | 'bottom' | 'center';
}

// variant ごとの TextInput 標準 props 解決
export function resolveVariantProps(
  variant: InputVariant,
  rows: number | undefined,
  showPassword: boolean,
): VariantProps {
  switch (variant) {
    case 'email':
      return {
        keyboardType: 'email-address',
        autoCapitalize: 'none',
        autoComplete: 'email',
        autoCorrect: false,
      };
    case 'password':
      return {
        keyboardType: 'default',
        autoCapitalize: 'none',
        autoComplete: 'password',
        autoCorrect: false,
        secureTextEntry: !showPassword,
      };
    case 'number':
      return {
        keyboardType: 'number-pad',
        autoCapitalize: 'none',
        autoCorrect: false,
      };
    case 'multiline':
      return {
        multiline: true,
        numberOfLines: rows ?? 4,
        textAlignVertical: 'top',
      };
    case 'search':
      return {
        keyboardType: 'default',
        autoCapitalize: 'none',
        autoCorrect: false,
        returnKeyType: 'search',
      };
    case 'text':
    default:
      return {};
  }
}

// state に応じた border 色
export function resolveBorderColor(
  C: ThemeColors,
  state: { focused: boolean; isError: boolean; disabled: boolean },
): string {
  if (state.isError) return C.error;
  if (state.focused) return C.primary;
  if (state.disabled) return C.borderLight;
  return C.border;
}

// state に応じた背景色
export function resolveBackgroundColor(
  C: ThemeColors,
  state: { isError: boolean; disabled: boolean },
): string {
  if (state.disabled) return C.background;
  if (state.isError) return C.errorSurface ?? C.card;
  return C.card;
}

// state に応じたテキスト色
export function resolveTextColor(
  C: ThemeColors,
  state: { disabled: boolean; loading?: boolean },
): string {
  if (state.disabled) return C.textDisabled;
  if (state.loading) return C.textSecondary;
  return C.text;
}

// border 太さ
export function resolveBorderWidth(focused: boolean, isError: boolean): number {
  return focused || isError ? 2 : 1.5;
}

// multiline の minHeight 計算
export function resolveMinHeight(
  variant: InputVariant,
  rows: number | undefined,
  padding: number,
  lineHeight: number,
): number {
  if (variant === 'multiline') {
    return padding * 2 + lineHeight * (rows ?? 4);
  }
  return 48;
}

// accessibilityLabel の自動推論 (label > placeholder の優先)
export function deriveAccessibilityLabel(
  explicit: string | undefined,
  label: string | undefined,
  placeholder: string | undefined,
): string | undefined {
  return explicit ?? label ?? placeholder;
}

// 文字数カウンタの色 (90%以上で warning、100%以上で error)
export function resolveCounterColor(
  C: ThemeColors,
  length: number,
  maxLength: number,
): string {
  if (length >= maxLength) return C.error;
  if (length >= maxLength * 0.9) return C.warning;
  return C.textTertiary;
}
