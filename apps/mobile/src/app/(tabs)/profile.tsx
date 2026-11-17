import type { DeckSummary, Profile } from '@golden-era/api-client';
import { router, useFocusEffect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthForm } from '@/components/auth-form';
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
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .GET('/me')
      .then(({ data, error }) => {
        if (active) setState(data ? { profile: data } : { error: describeError(error) });
      })
      .catch((e) => {
        if (active) setState({ error: describeError(e) });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const { profile, error } = state;
  if (!profile) {
    return error ? (
      <StateMessage
        message={error}
        onRetry={() => {
          setState({});
          setAttempt((n) => n + 1);
        }}
      />
    ) : (
      <StateMessage loading />
    );
  }

  return (
    <ThemedView style={styles.profile}>
      <ThemedText type="subtitle" style={styles.title}>
        @{profile.username}
      </ThemedText>
      {profile.bio ? <ThemedText>{profile.bio}</ThemedText> : null}
      <ThemedView type="backgroundElement" style={styles.stats}>
        <Stat label="Decks" value={profile.deckCount} />
        <Stat label="Seguidores" value={profile.followerCount} />
        <Stat label="Seguindo" value={profile.followingCount} />
      </ThemedView>
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
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, alignItems: 'center', borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  decks: { gap: Spacing.two },
  decksActions: { flexDirection: 'row', gap: Spacing.three },
  decksHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pressed: { opacity: 0.7 },
});
