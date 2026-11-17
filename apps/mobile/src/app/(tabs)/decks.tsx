import type { DeckSummary } from '@golden-era/api-client';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { usePagedList } from '@/hooks/use-paged-list';
import { api } from '@/lib/api';

function DeckRow({ deck }: { deck: DeckSummary }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedText type="smallBold" numberOfLines={1}>
        {deck.name}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        por @{deck.owner.username}
        {deck.archetype ? ` · ${deck.archetype}` : ''}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        ♥ {deck.likeCount} · 💬 {deck.commentCount}
      </ThemedText>
    </ThemedView>
  );
}

export default function DecksScreen() {
  const { items, loading, error, loadMore, reload } = usePagedList<DeckSummary>(
    (cursor) => api.GET('/decks', { params: { query: { sort: 'popular', cursor, limit: 20 } } }),
    [],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="subtitle" style={styles.title}>
          Decks
        </ThemedText>
        <FlatList
          data={items}
          keyExtractor={(deck) => deck.id}
          renderItem={({ item }) => <DeckRow deck={item} />}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          refreshing={loading && items.length === 0}
          onRefresh={reload}
          ListEmptyComponent={
            loading ? (
              <StateMessage loading />
            ) : error ? (
              <StateMessage message={error} onRetry={reload} />
            ) : (
              <StateMessage message="Ainda não há decks públicos. Os decks publicados pela comunidade aparecem aqui." />
            )
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
  list: { gap: Spacing.two, paddingBottom: BottomTabInset + Spacing.four },
  row: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
});
