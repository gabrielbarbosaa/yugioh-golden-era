import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Botão principal do app: degradê dourado, mola ao toque e vibração leve. `ghost` é a versão discreta (só contorno). */
export function GradientButton({
  label,
  onPress,
  disabled,
  loading,
  ghost,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  ghost?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const pad = small ? { paddingVertical: 8, paddingHorizontal: Spacing.three } : { paddingVertical: Spacing.three, paddingHorizontal: Spacing.four };
  return (
    <PressableScale feedback="thud" onPress={onPress} disabled={inactive} accessibilityRole="button" accessibilityState={{ disabled: !!inactive, busy: !!loading }} style={[{ opacity: disabled ? 0.5 : 1 }, style]}>
      {ghost ? (
        <ThemedText type="smallBold" style={[styles.ghost, pad, { borderColor: theme.goldDark }]}>
          {label}
        </ThemedText>
      ) : (
        <LinearGradient colors={[theme.goldLight, theme.gold, theme.goldDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, pad]}>
          {loading ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <ThemedText type="smallBold" style={{ color: theme.background, fontSize: small ? 14 : 16 }}>
              {label}
            </ThemedText>
          )}
        </LinearGradient>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fill: { borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#E6B422', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  ghost: { borderRadius: 16, borderWidth: 1, textAlign: 'center', overflow: 'hidden' },
});