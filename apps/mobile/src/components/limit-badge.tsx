import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { banlistLabel } from '@/lib/deck-rules';

/**
 * Selo da lista da era, como no jogo: o número de cópias permitidas (0 vira ✕).
 * Não desenha nada para cartas sem restrição.
 */
export function LimitBadge({ maxCopies, size = 22 }: { maxCopies: number; size?: number }) {
  const theme = useTheme();
  const label = banlistLabel({ maxCopies });
  if (!label) return null;

  const background = maxCopies === 0 ? theme.forbidden : maxCopies === 1 ? theme.limited : theme.semi;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}>
      <Text style={[styles.text, { fontSize: size * 0.58, color: maxCopies === 2 ? '#2A2000' : '#FFFFFF' }]}>
        {maxCopies === 0 ? '✕' : String(maxCopies)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF' },
  text: { fontWeight: '800', includeFontPadding: false },
});
