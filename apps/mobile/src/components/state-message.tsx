import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

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
  return (
    <ThemedView style={styles.box}>
      {loading ? <ActivityIndicator /> : null}
      {message ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
          {message}
        </ThemedText>
      ) : null}
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <ThemedText type="linkPrimary">Tentar de novo</ThemedText>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  text: { textAlign: 'center' },
});
