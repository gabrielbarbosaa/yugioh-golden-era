import type { DeckSummary, Profile } from '@golden-era/api-client';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthForm } from '@/components/auth-form';
import { Avatar } from '@/components/avatar';
import { DeckRow } from '@/components/deck-row';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { usePagedList } from '@/hooks/use-paged-list';
import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useSession } from '@/lib/session';

// Só é montado com a sessão aberta, então o estado some junto com o logout (nada vaza entre contas).
function MyProfile() {
  const { signOut } = useSession();
  const [state, setState] = useState<{ profile?: Profile; error?: string }>({});

  const load = useCallback(() => {
    api
      .GET('/me')
      .then(({ data, error }) => setState(data ? { profile: data } : { error: describeError(error) }))
      .catch((e) => setState({ error: describeError(e) }));
  }, []);
  // Carrega ao abrir e recarrega ao voltar da tela de escolha da foto de perfil.
  useFocusEffect(load);

  const { profile, error } = state;
  if (!profile) {
    return error ? (
      <StateMessage
        message={error}
        onRetry={() => {
          setState({});
          load();
        }}
      />
    ) : (
      <StateMessage loading />
    );
  }

  return (
    <ThemedView style={styles.profile}>
      <ThemedView style={styles.head}>
        <Avatar url={profile.avatarUrl} name={profile.username} size={72} />
        <ThemedView style={styles.headText}>
          <ThemedText type="subtitle" style={styles.title}>
            @{profile.username}
          </ThemedText>
          <Pressable onPress={() => router.push('/avatar')} accessibilityRole="button">
            <ThemedText type="linkPrimary">{profile.avatarCardId != null ? 'Trocar foto de perfil' : 'Escolher foto de perfil'}</ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>
      {profile.bio ? <ThemedText>{profile.bio}</ThemedText> : null}
      <ThemedView type="backgroundElement" style={styles.stats}>
        <Stat label="Decks" value={profile.deckCount} />
        <Stat
          label="Seguidores"
          value={profile.followerCount}
          onPress={() => router.push({ pathname: '/people', params: { kind: 'followers', username: profile.username } })}
        />
        <Stat
          label="Seguindo"
          value={profile.followingCount}
          onPress={() => router.push({ pathname: '/people', params: { kind: 'following', username: profile.username } })}
        />
      </ThemedView>
      <Pressable onPress={() => router.push({ pathname: '/people', params: { kind: 'search' } })} accessibilityRole="button">
        <ThemedText type="linkPrimary">Buscar jogadores</ThemedText>
      </Pressable>
      <MyDecks />
      <Pressable onPress={signOut} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="linkPrimary">Sair</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function MyDecks() {
  const { items, loading, error, hasMore, loadMore, reload } = usePagedList<DeckSummary>(
    (cursor) => api.GET('/me/decks', { params: { query: { cursor, limit: 20 } } }),
    [],
  );
  // Ao voltar do editor a lista pode ter mudado (deck novo, editado ou excluído).
  useFocusEffect(reload);

  return (
    <ThemedView style={styles.decks}>
      <ThemedView style={styles.decksHeader}>
        <ThemedText type="smallBold">Meus decks</ThemedText>
        <ThemedView style={styles.decksActions}>
          <Pressable onPress={() => router.push('/anime-decks')} accessibilityRole="button">
            <ThemedText type="linkPrimary">Decks do anime</ThemedText>
          </Pressable>
          <Pressable onPress={() => router.push('/import')} accessibilityRole="button">
            <ThemedText type="linkPrimary">Importar .ydk</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/deck/[id]', params: { id: 'new' } })}
            accessibilityRole="button">
            <ThemedText type="linkPrimary">+ Novo deck</ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>
      {items.map((deck) => (
        <DeckRow key={deck.id} deck={deck} showVisibility />
      ))}
      {items.length === 0 ? (
        loading ? (
          <StateMessage loading />
        ) : error ? (
          <StateMessage message={error} onRetry={reload} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Você ainda não tem decks.
          </ThemedText>
        )
      ) : hasMore ? (
        <Pressable onPress={loadMore} accessibilityRole="button">
          <ThemedText type="linkPrimary">Carregar mais</ThemedText>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

function Stat({ label, value, onPress }: { label: string; value?: number; onPress?: () => void }) {
  const body = (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="smallBold">{value ?? 0}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Ver ${label.toLowerCase()}`} style={styles.statTap}>
      {body}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { signedIn } = useSession();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {signedIn === null ? <StateMessage loading /> : signedIn ? <MyProfile /> : <AuthForm />}
        </ScrollView>
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
  },
  content: { paddingTop: Spacing.two, paddingBottom: BottomTabInset + Spacing.four },
  profile: { gap: Spacing.three, paddingTop: Spacing.two },
  title: { fontSize: 28, lineHeight: 34 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headText: { flex: 1, gap: Spacing.one },
  stats: { flexDirection: 'row', gap: Spacing.two },
  statTap: { flex: 1 },
  stat: { flex: 1, alignItems: 'center', borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  decks: { gap: Spacing.two },
  decksActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1, gap: Spacing.three },
  decksHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pressed: { opacity: 0.7 },
});
