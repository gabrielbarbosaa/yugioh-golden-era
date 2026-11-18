import type { Schemas } from '@golden-era/api-client';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { PressableScale } from '@/components/pressable-scale';
import { SearchInput } from '@/components/search-input';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagedList } from '@/hooks/use-paged-list';
import { api } from '@/lib/api';

type UserSummary = Schemas['UserSummary'];
type Kind = 'search' | 'followers' | 'following';

const TITLES: Record<Kind, string> = { search: 'Jogadores', followers: 'Seguidores', following: 'Seguindo' };
const EMPTY: Record<Kind, string> = {
  search: 'Nenhum jogador encontrado.',
  followers: 'Ninguém segue este jogador ainda.',
  following: 'Este jogador ainda não segue ninguém.',
};

/** Busca jogadores pelo nome (`kind=search`) ou lista os seguidores / quem o jogador segue (`username` + `kind`). */
export default function PeopleScreen() {
  const params = useLocalSearchParams<{ kind?: string; username?: string }>();
  const kind: Kind = params.kind === 'followers' || params.kind === 'following' ? params.kind : 'search';
  const username = params.username ?? '';
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim());

  const { items, loading, error, loadMore, reload } = usePagedList<UserSummary>(
    async (cursor) => {
      if (kind === 'search') {
        if (!q) return { data: { items: [] } }; // sem texto não há o que buscar
        return api.GET('/users', { params: { query: { q, cursor, limit: 30 } } });
      }
      const path = { username };
      const query = { cursor, limit: 40 };
      return kind === 'followers'
        ? api.GET('/users/{username}/followers', { params: { path, query } })
        : api.GET('/users/{username}/following', { params: { path, query } });
    },
    [kind, username, q],
  );

  const hint = kind === 'search' && !q;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: kind === 'search' ? TITLES.search : `${TITLES[kind]} de @${username}` }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {kind === 'search' ? (
          <SearchInput value={query} onChangeText={setQuery} placeholder="Buscar jogador pelo nome" autoCapitalize="none" autoCorrect={false} maxLength={24} autoFocus />
        ) : null}
        <FlatList
          data={items}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).springify().damping(18)}>
              <PressableScale
                scaleTo={0.97}
                onPress={() => router.push({ pathname: '/user/[username]', params: { username: item.username } })}
                accessibilityRole="button"
                accessibilityLabel={`Abrir o perfil de ${item.username}`}>
                <ThemedView type="backgroundElement" style={styles.row}>
                  <Avatar url={item.avatarUrl} name={item.username} size={44} />
                  <ThemedText type="smallBold">@{item.username}</ThemedText>
                </ThemedView>
              </PressableScale>
            </Animated.View>
          )}
          ListEmptyComponent={
            hint ? (
              <StateMessage message="Digite um nome (ou parte dele) para buscar." />
            ) : loading ? (
              <StateMessage loading />
            ) : error ? (
              <StateMessage message={error} onRetry={reload} />
            ) : (
              <StateMessage message={EMPTY[kind]} />
            )
          }
          ListFooterComponent={items.length > 0 && loading ? <StateMessage loading /> : undefined}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.three, gap: Spacing.two, paddingTop: Spacing.two },
  list: { gap: Spacing.two, paddingBottom: Spacing.five },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Spacing.three, padding: Spacing.two },
  dim: { opacity: 0.6 },
});