import type { Card } from '@golden-era/api-client';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** Proporção das cartas de Yu-Gi-Oh! (59 x 86 mm). */
export const CARD_ASPECT = 59 / 86;

export function CardTile({ card, width }: { card: Card; width: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={card.name}
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(card.id) } })}
      style={({ pressed }) => [{ width }, styles.tile, pressed && styles.pressed]}>
      <Image
        source={{ uri: card.imageSmallUrl }}
        style={{ width, height: width / CARD_ASPECT }}
        contentFit="cover"
        transition={150}
        recyclingKey={String(card.id)}
      />
      <ThemedText type="small" numberOfLines={2} style={styles.name}>
        {card.name}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { gap: Spacing.one },
  pressed: { opacity: 0.7 },
  name: { fontSize: 12, lineHeight: 15 },
});
