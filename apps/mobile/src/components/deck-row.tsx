import type { DeckSummary } from '@golden-era/api-client';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { CARD_ASPECT } from '@/components/card-tile';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const COVER = 56;

/** Linha de deck para listas (marketplace e "meus decks"); toca para abrir. */
export function DeckRow({ deck, showVisibility }: { deck: DeckSummary; showVisibility?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/deck/[id]', params: { id: deck.id } })}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.row}>
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
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Spacing.three, padding: Spacing.three, borderWidth: 1, borderColor: '#3A3220' },
  info: { flex: 1, gap: Spacing.half },
  pressed: { opacity: 0.7 },
});
