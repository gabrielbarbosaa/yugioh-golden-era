import type { components } from '@golden-era/api-client';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CARD_ASPECT } from '@/components/card-tile';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useSession } from '@/lib/session';

type AnimeDeck = components['schemas']['AnimeDeck'];

const COVER = 72;

/** Decks de personagens do anime: cada um pode ser copiado para a conta como rascunho privado. */
export default function AnimeDecksScreen() {
  const { signedIn } = useSession();
  const theme = useTheme();
  const [state, setState] = useState<{ decks?: AnimeDeck[]; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .GET('/anime-decks')
      .then(({ data, error: problem }) => {
        if (active) setState(data ? { decks: data } : { error: describeError(problem) });
      })
      .catch((e) => {
        if (active) setState({ error: describeError(e) });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  async function importDeck(slug: string) {
    if (importing) return;
    setImporting(slug);
    setError(null);
    try {
      const { data, error: problem } = await api.POST('/anime-decks/{slug}/import', { params: { path: { slug } } });
      if (data) {
        router.replace({ pathname: '/deck/[id]', params: { id: data.id } });
        return;
      }
      setError(describeError(problem));
    } catch (e) {
      setError(describeError(e));
    }
    setImporting(null);
  }

  const { decks } = state;
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {signedIn === false ? (
          <StateMessage message="Entre na sua conta (aba Perfil) para importar decks." />
        ) : !decks ? (
          state.error ? (
            <StateMessage
              message={state.error}
              onRetry={() => {
                setState({});
                setAttempt((n) => n + 1);
              }}
            />
          ) : (
            <StateMessage loading />
          )
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText type="small" themeColor="textSecondary">
              Listas aproximadas da era Duel Monsters. O deck é criado como rascunho privado; cartas que a era não tem ou
              que passam do limite da lista são ajustadas e anotadas na descrição.
            </ThemedText>
            {error ? (
              <ThemedText type="small" style={styles.error} accessibilityRole="alert">
                {error}
              </ThemedText>
            ) : null}
            {decks.map((d) => (
              <ThemedView key={d.slug} type="backgroundElement" style={styles.card}>
                {d.coverImageUrl ? (
                  <Image
                    source={{ uri: d.coverImageUrl }}
                    style={{ width: COVER, height: COVER / CARD_ASPECT }}
                    contentFit="cover"
                    recyclingKey={d.slug}
                  />
                ) : null}
                <ThemedView type="backgroundElement" style={styles.info}>
                  <ThemedText type="smallBold">{d.character}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {d.series}
                  </ThemedText>
                  <ThemedText type="small">{d.description}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {d.cardCount} cartas{d.missing.length ? ` · ${d.missing.length} fora da era` : ''}
                  </ThemedText>
                  <Pressable
                    onPress={() => importDeck(d.slug)}
                    disabled={importing !== null}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.button,
                      { backgroundColor: theme.gold },
                      (pressed || importing !== null) && styles.dim,
                    ]}>
                    {importing === d.slug ? (
                      <ActivityIndicator color={theme.background} />
                    ) : (
                      <ThemedText type="smallBold" style={{ color: theme.background }}>
                        Importar para meus decks
                      </ThemedText>
                    )}
                  </Pressable>
                </ThemedView>
              </ThemedView>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  content: { gap: Spacing.three, paddingBottom: Spacing.six },
  card: { flexDirection: 'row', gap: Spacing.three, borderRadius: Spacing.three, padding: Spacing.three, borderWidth: 1, borderColor: '#3A3220' },
  info: { flex: 1, gap: Spacing.one },
  button: { borderRadius: Spacing.three, paddingVertical: Spacing.two, alignItems: 'center', marginTop: Spacing.one },
  error: { color: '#D93025' },
  dim: { opacity: 0.5 },
});