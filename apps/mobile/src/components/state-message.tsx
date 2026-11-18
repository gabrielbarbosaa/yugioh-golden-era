import { ActivityIndicator, StyleSheet } from 'react-native';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Estado vazio, de carregamento ou de erro, centralizado. */
export function StateMessage({
  loading,
  message,
  onRetry,
}: {
  loading?: boolean;
  message?: string;
  onRetry?: () => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.box}>
      {loading ? <ActivityIndicator color={theme.gold} size="large" /> : null}
      {message ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
          {message}
        </ThemedText>
      ) : null}
      {onRetry ? <GradientButton ghost small label="Tentar de novo" onPress={onRetry} /> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  text: { textAlign: 'center' },
});
