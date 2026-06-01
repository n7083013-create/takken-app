// ============================================================
// Input 共通部品 (T8 Phase 2) — 両アプリ同一実装
// ============================================================
// 設計仕様: ObsidianVault/10_Projects/資格アプリ開発/2026-05-27_T8_Input共通部品_仕様.md
// 純関数ロジックは Input.helpers.ts に切り出し済 (ts-jest で単体テスト)
//
// 6 variants (text/email/password/number/multiline/search)
// 5 states (default/focused/error/disabled/loading)
// token 全採用 (Colors/Spacing/FontSize/LineHeight/BorderRadius/Shadow)
// useThemeColors でダーク追従、forwardRef で TextInput ref 透過

import { forwardRef, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  StyleSheet,
  type TextInput as RNTextInput,
} from 'react-native';
import {
  Spacing,
  FontSize,
  FontWeight,
  LineHeight,
} from '../../constants/theme';
import { useThemeColors, type ThemeColors } from '../../hooks/useThemeColors';
import {
  resolveVariantProps,
  resolveBorderColor,
  resolveBackgroundColor,
  resolveTextColor,
  resolveMinHeight,
  deriveAccessibilityLabel,
  resolveCounterColor,
  type InputProps,
} from './Input.helpers';

export type { InputProps, InputVariant } from './Input.helpers';

export const Input = forwardRef<RNTextInput, InputProps>(function Input(
  props,
  ref,
) {
  const {
    variant = 'text',
    value,
    onChangeText,
    label,
    required,
    helperText,
    placeholder,
    error,
    disabled,
    loading,
    rows,
    maxLength,
    onClear,
    accessibilityLabel,
    accessibilityHint,
    containerStyle,
    inputStyle,
    autoFocus,
    returnKeyType,
    onSubmitEditing,
    onBlur,
    onFocus,
    autoComplete,
    keyboardType,
    testID,
  } = props;

  const C = useThemeColors();
  const s = useMemo(() => makeStyles(C), [C]);

  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isError = !!error;
  const isInactive = !!disabled || !!loading;

  // [Fabric focus-blur 修正] 毎レンダー新規オブジェクトを focus コミット経路に渡さない
  const a11yState = useMemo(
    () => ({ disabled: isInactive, busy: !!loading }),
    [isInactive, loading],
  );

  const variantProps = useMemo(
    () => resolveVariantProps(variant, rows, showPassword),
    [variant, rows, showPassword],
  );

  const borderColor = resolveBorderColor(C, {
    focused,
    isError,
    disabled: !!disabled,
  });
  const backgroundColor = resolveBackgroundColor(C, {
    isError,
    disabled: !!disabled,
  });
  const textColor = resolveTextColor(C, { disabled: !!disabled, loading: !!loading });
  // [Fabric focus-blur 修正] focus で border 幅を変えると New Architecture で
  // 祖先 View が再コミットされ TextInput の first responder が剥離 → キーボードが落ちる。
  // 幅は focus に依存させず一定にする(focus は色だけ変える = レイアウト不変)。
  const borderWidth = isError ? 2 : 1.5;
  const minHeight = resolveMinHeight(variant, rows, Spacing.md, LineHeight.subhead);
  const derivedA11yLabel = deriveAccessibilityLabel(
    accessibilityLabel,
    label,
    placeholder,
  );
  const webA11yProps =
    Platform.OS === 'web'
      ? ({
          'aria-invalid': isError ? true : undefined,
          'aria-required': required ? true : undefined,
        } as Record<string, boolean | undefined>)
      : {};

  const handleClear = useCallback(() => {
    if (onClear) onClear();
    else onChangeText('');
  }, [onClear, onChangeText]);

  // variant が決める keyboardType/autoComplete を呼び出し側で上書きできるよう、
  // 明示 props を変数化して最後にスプレッド (後勝ち)
  const overrideProps = useMemo(() => {
    const o: Record<string, unknown> = {};
    if (autoComplete !== undefined) o.autoComplete = autoComplete;
    if (keyboardType !== undefined) o.keyboardType = keyboardType;
    if (returnKeyType !== undefined) o.returnKeyType = returnKeyType;
    return o;
  }, [autoComplete, keyboardType, returnKeyType]);

  const iconColor = isError
    ? C.error
    : focused
      ? C.primary
      : C.textTertiary;

  return (
    <View style={[s.container, containerStyle]}>
      {label !== undefined && label !== '' && (
        <Text style={s.label}>
          {label}
          {required && <Text style={{ color: C.error }}> *</Text>}
        </Text>
      )}

      <View
        style={[
          s.inputRow,
          {
            borderColor,
            backgroundColor,
            minHeight,
            borderWidth,
            alignItems: variant === 'multiline' ? 'flex-start' : 'center',
          },
          // [Fabric focus-blur 修正] focus 時の shadow 付与を撤去(focus で親を再コミットさせない)
        ]}
      >
        {variant === 'search' && (
          <Text style={[s.icon, { color: iconColor }]}>{'⌕'}</Text>
        )}

        <TextInput
          ref={ref}
          value={value}
          onChangeText={isInactive ? () => {} : onChangeText}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          placeholder={placeholder}
          placeholderTextColor={C.textTertiary}
          editable={!isInactive}
          maxLength={maxLength}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={derivedA11yLabel}
          accessibilityHint={accessibilityHint ?? helperText}
          accessibilityState={a11yState}
          testID={testID}
          style={[
            s.input,
            { color: textColor },
            variant === 'multiline' && {
              textAlignVertical: 'top',
              paddingTop: Spacing.md,
            },
            inputStyle,
          ]}
          {...webA11yProps}
          {...variantProps}
          {...overrideProps}
        />

        {variant === 'password' && (
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              showPassword ? 'パスワードを非表示' : 'パスワードを表示'
            }
          >
            <Text style={[s.icon, { color: C.textSecondary }]}>
              {showPassword ? '🙈' : '👁'}
            </Text>
          </Pressable>
        )}

        {variant === 'search' && value.length > 0 && (
          <Pressable
            onPress={handleClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="検索をクリア"
          >
            <Text style={[s.icon, { color: C.textTertiary }]}>{'✕'}</Text>
          </Pressable>
        )}

        {loading && (
          <ActivityIndicator
            size="small"
            color={C.textSecondary}
            style={{ marginLeft: Spacing.sm }}
          />
        )}
      </View>

      {(isError || helperText !== undefined || maxLength !== undefined) && (
        <View style={s.bottomRow}>
          {isError ? (
            <Text style={[s.helper, { color: C.error }]}>{error}</Text>
          ) : helperText ? (
            <Text style={s.helper}>{helperText}</Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {maxLength !== undefined && (
            <Text
              style={[
                s.counter,
                { color: resolveCounterColor(C, value.length, maxLength) },
              ]}
            >
              {value.length} / {maxLength}
            </Text>
          )}
        </View>
      )}
    </View>
  );
});

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { width: '100%' },
    label: {
      fontSize: FontSize.footnote,
      fontWeight: FontWeight.semibold,
      color: C.text,
      marginBottom: 6,
    },
    inputRow: {
      flexDirection: 'row',
      borderRadius: 12,
      paddingHorizontal: 14,
    },
    input: {
      flex: 1,
      fontSize: FontSize.subhead,
      lineHeight: LineHeight.subhead,
      color: C.text,
      paddingVertical: Spacing.md,
    },
    icon: { fontSize: 18, marginHorizontal: 4 },
    bottomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 6,
      minHeight: 16,
    },
    helper: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      flex: 1,
    },
    counter: {
      fontSize: FontSize.caption,
      marginLeft: Spacing.sm,
    },
  });
}

export default Input;
