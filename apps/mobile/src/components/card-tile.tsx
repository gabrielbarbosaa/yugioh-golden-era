import type { Card } from '@golden-era/api-client';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { LimitBadge } from '@/components/limit-badge';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Proporção das cartas de Yu-Gi-Oh! (59 x 86 mm). */
export const CARD_ASPECT = 59 / 86;

export function CardTile({ card, width }: { card: Card; width: number }) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(320)} style={{ width }}>
    <PressableScale
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityLabel={card.name}
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(card.id) } })}
      style={[{ width }, styles.tile]}>
      <View style={[styles.frame, { shadowColor: theme.gold }]}>
        <Image
          source={{ uri: card.imageSmallUrl }}
          style={{ width, height: width / CARD_ASPECT, borderRadius: 4 }}
          contentFit="cover"
          transition={150}
          recyclingKey={String(card.id)}
        />
        {card.maxCopies < 3 ? (
          <View style={styles.badge}>
            <LimitBadge maxCopies={card.maxCopies} size={24} />
          </View>
        ) : null}
      </View>
      <ThemedText type="small" numberOfLines={2} style={styles.name}>
        {card.name}
      </ThemedText>
    </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: { gap: Spacing.one },
  frame: { borderRadius: 4, shadowOpacity: 0.0, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  badge: { position: 'absolute', top: -6, right: -6 },
  name: { fontSize: 12, lineHeight: 15 },
});
