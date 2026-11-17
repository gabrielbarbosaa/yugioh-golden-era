import type { Card } from '@golden-era/api-client';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CardTile } from '@/components/card-tile';
import { activeFilterCount, EMPTY_FILTERS, FilterSheet, type CardFilters } from '@/components/filter-sheet';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagedList } from '@/hooks/use-paged-list';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';

const GAP = Spacing.two;

/** Quantas colunas cabem: cartas de ~110 px, de 2 (celular estreito) até 6 (web). */
function columnsFor(width: number) {
  return Math.max(2, Math.min(6, Math.floor((width + GAP) / (110 + GAP))));
}

export default function CardsScreen() {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim());
  const [filters, setFilters] = useState<CardFilters>(EMPTY_FILTERS);
  const [filtering, setFiltering] = useState(false);
  const filterCount = activeFilterCount(filters);

  const { items, loading, error, loadMore, reload } = usePagedList<Card>(
    (cursor) =>
      api.GET('/cards', {
        params: { query: { q: q || undefined, ...filters, cursor, limit: 30 } },
      }),
    [q, filters],
  );

  const contentWidth = Math.min(windowWidth, MaxContentWidth) - Spacing.three * 2;
  const columns = columnsFor(contentWidth);
  const tileWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="subtitle" style={styles.title}>
          Cartas
        </ThemedText>
        <ThemedView style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por nome (ex.: Dark Magician)"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <Pressable
            onPress={() => setFiltering(true)}
            accessibilityRole="button"
            accessibilityLabel="Abrir filtros"
            style={({ pressed }) => [
              styles.filterButton,
              { backgroundColor: filterCount > 0 ? theme.text : theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={filterCount > 0 ? { color: theme.background } : undefined}>
              {filterCount > 0 ? `Filtros (${filterCount})` : 'Filtros'}
            </ThemedText>
          </Pressable>
        </ThemedView>
        {filterCount > 0 ? (
          <ThemedView style={styles.active}>
            {Object.entries(filters).map(([key, value]) =>
              value === undefined ? null : (
                <Pressable
                  key={key}
                  onPress={() => setFilters((f) => ({ ...f, [key]: undefined }))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remover filtro ${value}`}
                  style={[styles.activeChip, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="small">{`${value} ✕`}</ThemedText>
                </Pressable>
              ),
            )}
          </ThemedView>
        ) : null}
        {filtering ? (
          <FilterSheet
            value={filters}
            onApply={(next) => {
              setFilters(next);
              setFiltering(false);
            }}
            onClose={() => setFiltering(false)}
          />
        ) : null}

        <FlatList
          key={columns} // trocar o número de colunas exige recriar a lista
          data={items}
          keyExtractor={(card) => String(card.id)}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <CardTile card={item} width={tileWidth} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          keyboardShouldPersistTaps="handled"
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
            items.length === 0 ? undefined : error ? (
              <StateMessage message={error} onRetry={loadMore} />
            ) : loading ? (
              <StateMessage loading />
            ) : undefined
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: TopTabInset,
    gap: Spacing.two,
  },
  title: { fontSize: 28, lineHeight: 34, paddingTop: Spacing.two },
  searchRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  search: { flex: 1, borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16 },
  filterButton: { borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three - 2 },
  active: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  activeChip: { borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  pressed: { opacity: 0.7 },
  list: { gap: GAP, paddingBottom: BottomTabInset + Spacing.four },
});
