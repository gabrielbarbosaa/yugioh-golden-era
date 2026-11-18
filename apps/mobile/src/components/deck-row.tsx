import type { DeckSummary } from '@golden-era/api-client';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CARD_ASPECT } from '@/components/card-tile';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const COVER = 56;

/** Linha de deck para listas (marketplace e "meus decks"); toca para abrir. */
export function DeckRow({ deck, showVisibility }: { deck: DeckSummary; showVisibility?: boolean }) {
  return (
    <Animated.View entering={FadeInDown.duration(350)}>
    <PressableScale
      scaleTo={0.97}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/deck/[id]', params: { id: deck.id } })}>
      <LinearGradient colors={['#211E45', '#15132E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.row}>
        {deck.coverImageUrl ? (
          <Image
            source={{ uri: deck.coverImageUrl }}
            style={{ width: COVER, height: COVER / CARD_ASPECT }}
            contentFit="cover"
            recyclingKey={deck.id}
          />
        ) : (
          <ThemedView type="backgroundSelected" style={{ width: COVER, height: COVER / CARD_ASPECT }} />
        )}
        <ThemedView type="backgroundElement" style={styles.info}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {deck.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {showVisibility ? (deck.visibility === 'public' ? 'Público' : 'Privado') : `por @${deck.owner.username}`}
            {deck.archetype ? ` · ${deck.archetype}` : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ♥ {deck.likeCount} · 💬 {deck.commentCount}
          </ThemedText>
        </ThemedView>
      </LinearGradient>
    </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Spacing.three, padding: Spacing.three, borderWidth: 1, borderColor: '#3A3220' },
  info: { flex: 1, gap: Spacing.half },
});
