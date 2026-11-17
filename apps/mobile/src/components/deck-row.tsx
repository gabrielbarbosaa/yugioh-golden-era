import type { DeckSummary } from '@golden-era/api-client';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Linha de deck para listas (marketplace e "meus decks"); toca para abrir. */
export function DeckRow({ deck, showVisibility }: { deck: DeckSummary; showVisibility?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/deck/[id]', params: { id: deck.id } })}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.row}>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  pressed: { opacity: 0.7 },
});
