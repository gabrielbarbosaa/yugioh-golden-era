import type { DeckSummary, Profile } from '@golden-era/api-client';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DeckRow } from '@/components/deck-row';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { usePagedList } from '@/hooks/use-paged-list';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useSession } from '@/lib/session';

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="smallBold">{value ?? 0}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

/** Seguir/deixar de seguir com atualização otimista; o botão some no próprio perfil. */
function Header({ profile, isMe }: { profile: Profile; isMe: boolean }) {
  const { signedIn } = useSession();
  const theme = useTheme();
  const [follow, setFollow] = useState({ following: profile.followedByMe ?? false, followers: profile.followerCount ?? 0 });
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const was = follow;
    const following = !was.following;
    setError(null);
    setFollow({ following, followers: Math.max(0, was.followers + (following ? 1 : -1)) });
    try {
      const params = { params: { path: { username: profile.username } } };
      const { error: problem, response } = following
        ? await api.PUT('/users/{username}/follow', params)
        : await api.DELETE('/users/{username}/follow', params);
      if (!response.ok) {
        setFollow(was);
        setError(describeError(problem));
      }
    } catch (e) {
      setFollow(was);
      setError(describeError(e));
    }
  }

  return (
    <ThemedView style={styles.header}>
      <ThemedText type="subtitle" style={styles.title}>
        @{profile.username}
      </ThemedText>
      {profile.bio ? <ThemedText>{profile.bio}</ThemedText> : null}
      <ThemedView style={styles.stats}>
        <Stat label="Decks" value={profile.deckCount} />
        <Stat label="Seguidores" value={follow.followers} />
        <Stat label="Seguindo" value={profile.followingCount} />
      </ThemedView>
      {isMe ? null : signedIn ? (
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityState={{ selected: follow.following }}
          style={({ pressed }) => [
            styles.follow,
            { backgroundColor: follow.following ? theme.backgroundSelected : theme.gold },
            pressed && styles.dim,
          ]}>
          <ThemedText type="smallBold" style={follow.following ? undefined : { color: theme.background }}>
            {follow.following ? 'Seguindo' : 'Seguir'}
          </ThemedText>
        </Pressable>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Entre na sua conta (aba Perfil) para seguir.
        </ThemedText>
      )}
      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
      <ThemedText type="smallBold" style={styles.decksTitle}>
        Decks públicos
      </ThemedText>
    </ThemedView>
  );
}

export default function UserScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { signedIn } = useSession();
  const [state, setState] = useState<{ username: string; profile?: Profile; meName?: string; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (signedIn === null) return;
    let active = true;
    void (async () => {
      let next: NonNullable<typeof state>;
      try {
        const [res, me] = await Promise.all([
          api.GET('/users/{username}', { params: { path: { username } } }),
          signedIn ? api.GET('/me') : Promise.resolve(null),
        ]);
        next = res.data
          ? { username, profile: res.data, meName: me?.data?.username }
          : { username, error: describeError(res.error) };
      } catch (e) {
        next = { username, error: describeError(e) };
      }
      if (active) setState(next);
    })();
    return () => {
      active = false;
    };
  }, [username, signedIn, attempt]);

  const decks = usePagedList<DeckSummary>(
    (cursor) => api.GET('/users/{username}/decks', { params: { path: { username }, query: { cursor, limit: 20 } } }),
    [username],
  );

  const current = state?.username === username ? state : null;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: `@${username}` }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {!current ? (
          <StateMessage loading />
        ) : !current.profile ? (
          <StateMessage
            message={current.error}
            onRetry={() => {
              setState(null);
              setAttempt((n) => n + 1);
            }}
          />
        ) : (
          <FlatList
            data={decks.items}
            keyExtractor={(deck) => deck.id}
            renderItem={({ item }) => <DeckRow deck={item} />}
            contentContainerStyle={styles.list}
            onEndReached={decks.loadMore}
            onEndReachedThreshold={0.6}
            ListHeaderComponent={<Header profile={current.profile} isMe={current.meName === current.profile.username} />}
            ListEmptyComponent={
              decks.loading ? (
                <StateMessage loading />
              ) : decks.error ? (
                <StateMessage message={decks.error} onRetry={decks.reload} />
              ) : (
                <StateMessage message="Este usuário ainda não publicou decks." />
              )
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  list: { gap: Spacing.two, paddingBottom: Spacing.six },
  header: { gap: Spacing.three, paddingBottom: Spacing.two },
  title: { fontSize: 28, lineHeight: 34 },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, alignItems: 'center', borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  follow: { borderRadius: Spacing.three, paddingVertical: Spacing.three, alignItems: 'center' },
  decksTitle: { paddingTop: Spacing.two },
  error: { color: '#D93025' },
  dim: { opacity: 0.5 },
});
