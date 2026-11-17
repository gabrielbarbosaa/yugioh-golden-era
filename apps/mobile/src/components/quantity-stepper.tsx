import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MAX_QUANTITY } from '@/lib/collection';

function Step({ label, a11y, disabled, onPress }: { label: string; a11y: string; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.step, { backgroundColor: theme.backgroundSelected }, (pressed || disabled) && styles.dim]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

/** − quantidade + (de 0 a 999). */
export function QuantityStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <ThemedView type="backgroundElement" style={styles.box}>
      <Step label="−" a11y="Tenho uma cópia a menos" disabled={value <= 0} onPress={() => onChange(value - 1)} />
      <ThemedText type="smallBold" style={styles.value}>
        {value}
      </ThemedText>
      <Step label="+" a11y="Tenho uma cópia a mais" disabled={value >= MAX_QUANTITY} onPress={() => onChange(value + 1)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  step: { width: 36, height: 36, borderRadius: Spacing.two, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 28, textAlign: 'center' },
  dim: { opacity: 0.4 },
});
