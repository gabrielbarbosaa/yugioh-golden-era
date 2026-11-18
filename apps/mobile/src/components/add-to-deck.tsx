import type { Card, DeckSummary } from '@golden-era/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { addCard, canAdd, copiesOf, homeZone, ZONE_LABEL } from '@/lib/deck-rules';
import { describeError } from '@/lib/errors';
import { useSession } from '@/lib/session';

/** Caixa "Adicionar a um baralho" da tela da carta: escolhe um dos decks da conta e soma uma cópia. */
export function AddToDeck({ card }: { card: Card }) {
  const theme = useTheme();
  const router = useRouter();
  const { signedIn } = useSession();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean; deckId: string } | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await api.GET('/me/decks', { params: { query: { limit: 50 } } });
        if (cancelled) return;
        if (data) {
          setDecks(data.items);
          setLoadError(null);
        } else {
          setLoadError(describeError(error));
        }
      } catch (e) {
        if (!cancelled) setLoadError(describeError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, attempt]);

  if (!signedIn) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Entre na sua conta (aba Perfil) para adicionar esta carta a um dos seus baralhos.
      </ThemedText>
    );
  }
  if (loadError) return <StateMessage message={loadError} onRetry={() => setAttempt((n) => n + 1)} />;
  if (!decks) return <ActivityIndicator />;
  if (decks.length === 0) {
    return (
      <ThemedView style={styles.box}>
        <ThemedText type="smallBold">Adicionar a um baralho</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Você ainda não tem decks. Crie um na aba Decks.
        </ThemedText>
      </ThemedView>
    );
  }

  const selected = deckId ?? decks[0]!.id;

  async function add() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const target = selected;
    try {
      // O deck completo traz as cartas; as regras são as do editor e a API valida de novo ao salvar.
      const full = await api.GET('/decks/{deckId}', { params: { path: { deckId: target } } });
      if (!full.data) {
        setMessage({ text: describeError(full.error), ok: false, deckId: target });
        return;
      }
      const deck = full.data;
      const zone = homeZone(card);
      const refusal = canAdd(deck.cards, zone, card);
      if (refusal) {
        setMessage({ text: refusal, ok: false, deckId: target });
        return;
      }
      const cards = addCard(deck.cards, zone, card.id);
      const res = await api.PUT('/decks/{deckId}', {
        params: { path: { deckId: target } },
        body: { name: deck.name, description: deck.description, visibility: deck.visibility, cards },
      });
      if (!res.data) {
        setMessage({ text: describeError(res.error), ok: false, deckId: target });
        return;
      }
      const copies = copiesOf(cards, card.id);
      setMessage({
        text: `Adicionada a "${deck.name}" (${ZONE_LABEL[zone]}): agora ${copies} ${copies === 1 ? 'cópia' : 'cópias'}.`,
        ok: true,
        deckId: target,
      });
    } catch (e) {
      setMessage({ text: describeError(e), ok: false, deckId: target });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.box}>
      <ThemedText type="smallBold">Adicionar a um baralho</ThemedText>
      <ThemedView style={styles.chips}>
        {decks.map((d) => (
          <Pressable
            key={d.id}
            onPress={() => {
              setDeckId(d.id);
              setMessage(null);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === d.id }}>
            <ThemedView
              type={selected === d.id ? 'backgroundSelected' : 'backgroundElement'}
              style={[styles.chip, { borderColor: selected === d.id ? theme.gold : theme.border }]}>
              <ThemedText type="small" themeColor={selected === d.id ? 'text' : 'textSecondary'}>
                {d.name}
                {d.visibility === 'private' ? ' (privado)' : ''}
              </ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </ThemedView>
      <Pressable
        onPress={add}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, { backgroundColor: theme.gold }, (pressed || busy) && styles.dim]}>
        {busy ? (
          <ActivityIndicator color={theme.background} />
        ) : (
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            Adicionar ao baralho
          </ThemedText>
        )}
      </Pressable>
      {message ? (
        <ThemedView style={styles.result}>
          <ThemedText type="small" style={message.ok ? { color: theme.goldLight } : { color: '#ff6b6b' }} accessibilityRole={message.ok ? 'text' : 'alert'}>
            {message.text}
          </ThemedText>
          {message.ok ? (
            <Pressable onPress={() => router.push({ pathname: '/deck/[id]', params: { id: message.deckId } })} accessibilityRole="link">
              <ThemedText type="linkPrimary">Abrir o deck</ThemedText>
            </Pressable>
          ) : null}
        </ThemedView>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', alignItems: 'center', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.three },
  button: { alignSelf: 'stretch', borderRadius: Spacing.three, paddingVertical: Spacing.three, alignItems: 'center' },
  dim: { opacity: 0.5 },
  result: { alignItems: 'center', gap: Spacing.one },
});
