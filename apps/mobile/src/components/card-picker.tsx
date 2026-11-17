import type { Card } from '@golden-era/api-client';
import { Image } from 'expo-image';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';

import { CARD_ASPECT } from '@/components/card-tile';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagedList } from '@/hooks/use-paged-list';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useCollection } from '@/lib/collection';
import { banlistLabel, canAdd, copiesOf, homeZone, type DeckCards, type Zone } from '@/lib/deck-rules';

const THUMB = 48;

function AddButton({ label, reason, onPress }: { label: string; reason: string | null; onPress: () => void }) {
  const theme = useTheme();
  const disabled = reason !== null;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={disabled ? `${label} (${reason})` : label}
      style={({ pressed }) => [
        styles.add,
        { backgroundColor: theme.backgroundSelected },
        (pressed || disabled) && styles.dim,
      ]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

/** Busca cartas e as adiciona ao deck (na zona natural da carta ou no Side). */
export function CardPicker({
  cards,
  onAdd,
  onClose,
}: {
  cards: DeckCards;
  onAdd: (card: Card, zone: Zone) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const collection = useCollection();
  const owned = collection.status === 'ready' ? collection.quantities : null;
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim());
  const { items, loading, error, loadMore, reload } = usePagedList<Card>(
    (cursor) => api.GET('/cards', { params: { query: { q: q || undefined, cursor, limit: 30 } } }),
    [q],
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar carta para adicionar"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <Pressable onPress={onClose} accessibilityRole="button">
          <ThemedText type="linkPrimary">Concluir</ThemedText>
        </Pressable>
      </ThemedView>

      <FlatList
        data={items}
        keyExtractor={(card) => String(card.id)}
        keyboardShouldPersistTaps="handled"
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const home = homeZone(item);
          const copies = copiesOf(cards, item.id);
          return (
            <ThemedView type="backgroundElement" style={styles.row}>
              <Image
                source={{ uri: item.imageSmallUrl }}
                style={{ width: THUMB, height: THUMB / CARD_ASPECT }}
                contentFit="cover"
                recyclingKey={String(item.id)}
              />
              <ThemedView type="backgroundElement" style={styles.info}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {item.type}
                  {banlistLabel(item) ? ` · ${banlistLabel(item)}` : ''}
                  {copies > 0 ? ` · ${copies}/3 no deck` : ''}
                  {owned ? ` · tenho ${owned[item.id] ?? 0}` : ''}
                </ThemedText>
              </ThemedView>
              <AddButton
                label={home === 'extra' ? '+ Extra' : '+ Deck'}
                reason={canAdd(cards, home, item)}
                onPress={() => onAdd(item, home)}
              />
              <AddButton label="+ Side" reason={canAdd(cards, 'side', item)} onPress={() => onAdd(item, 'side')} />
            </ThemedView>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <StateMessage loading />
          ) : error ? (
            <StateMessage message={error} onRetry={reload} />
          ) : (
            <StateMessage message="Nenhuma carta encontrada." />
          )
        }
        ListFooterComponent={
          items.length > 0 && loading ? <StateMessage loading /> : undefined
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  search: { flex: 1, borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16 },
  list: { gap: Spacing.two, paddingBottom: Spacing.five },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Spacing.three, padding: Spacing.two },
  info: { flex: 1, gap: Spacing.half },
  add: { borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  dim: { opacity: 0.4 },
});
