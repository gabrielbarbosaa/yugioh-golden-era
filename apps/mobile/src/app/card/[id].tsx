import type { Card } from '@golden-era/api-client';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { AddToDeck } from '@/components/add-to-deck';
import { CARD_ASPECT } from '@/components/card-tile';
import { LimitBadge } from '@/components/limit-badge';
import { TiltView } from '@/components/tilt-view';
import { QuantityStepper } from '@/components/quantity-stepper';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { useTheme } from '@/hooks/use-theme';
import { useCollection } from '@/lib/collection';
import { banlistLabel } from '@/lib/deck-rules';
import { describeError } from '@/lib/errors';
import { useSession } from '@/lib/session';

/** Cada bloco da tela sobe e aparece em sequência (`i` é a posição). */
function Rise({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(80 + i * 70).springify().damping(18)} style={styles.rise}>
      {children}
    </Animated.View>
  );
}

function Stat({ label, value }: { label: string; value?: number | null }) {
  return (
    <LinearGradient colors={['#2a2658', '#15132E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
        {label}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.statValue}>
        {value ?? '?'}
      </ThemedText>
    </LinearGradient>
  );
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <ThemedView type="backgroundElement" style={styles.fact}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{String(value)}</ThemedText>
    </ThemedView>
  );
}

/** Quantas cópias o jogador tem (coleção pessoal); só com sessão aberta. */
function Owned({ cardId }: { cardId: number }) {
  const { signedIn } = useSession();
  const collection = useCollection();
  if (!signedIn) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Entre na sua conta (aba Perfil) para registrar quantas cópias você tem.
      </ThemedText>
    );
  }
  if (collection.status === 'loading') return <ActivityIndicator />;
  if (collection.status === 'error') return <StateMessage message={collection.error ?? undefined} onRetry={collection.retry} />;
  return (
    <ThemedView style={styles.owned}>
      <ThemedText type="smallBold">Na minha coleção</ThemedText>
      <QuantityStepper value={collection.quantities[cardId] ?? 0} onChange={(q) => collection.setQuantity(cardId, q)} />
      {collection.error ? (
        <StateMessage message={collection.error} onRetry={collection.retry} />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {collection.saving ? 'Salvando…' : 'Salvo'}
        </ThemedText>
      )}
    </ThemedView>
  );
}

export default function CardDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  // O resultado guarda para qual `id` vale; enquanto não bater, a tela mostra o carregamento.
  const [result, setResult] = useState<{ id: string; card?: Card; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let next: { id: string; card?: Card; error?: string };
      try {
        const { data, error } = await api.GET('/cards/{cardId}', { params: { path: { cardId: Number(id) } } });
        next = data ? { id, card: data } : { id, error: describeError(error) };
      } catch (e) {
        next = { id, error: describeError(e) };
      }
      if (!cancelled) setResult(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const current = result?.id === id ? result : null;
  const card = current?.card ?? null;
  const error = current?.error ?? null;
  const load = () => setAttempt((n) => n + 1);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: card?.name ?? 'Carta' }} />
      {!card ? (
        <StateMessage loading={!error} message={error ?? undefined} onRetry={error ? load : undefined} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Animated.View entering={ZoomIn.duration(450).springify().damping(14)} style={styles.rise}>
          <TiltView>
            <ThemedView style={[styles.artFrame, { shadowColor: theme.gold }]}>
              <Image
                source={{ uri: card.imageUrl }}
                style={styles.art}
                contentFit="contain"
                transition={200}
                accessibilityLabel={card.name}
              />
            </ThemedView>
          </TiltView>
          </Animated.View>
          <Rise i={0}>
            <ThemedText type="subtitle" style={styles.name}>
              {card.name}
            </ThemedText>
          </Rise>
          {banlistLabel(card) ? (
            <ThemedView type="backgroundElement" style={[styles.pill, { borderColor: theme.border }]}>
              <LimitBadge maxCopies={card.maxCopies} />
              <ThemedText type="small">
                {banlistLabel(card)} na lista da era
                {card.maxCopies === 0 ? '' : `: no máximo ${card.maxCopies} ${card.maxCopies === 1 ? 'cópia' : 'cópias'}`}
              </ThemedText>
            </ThemedView>
          ) : null}
          {card.atk != null || card.def != null ? (
            <Rise i={1}>
              <ThemedView style={styles.plate}>
                <Stat label="ATK" value={card.atk} />
                <Stat label="DEF" value={card.def} />
                {card.level != null ? <Stat label="Nível" value={card.level} /> : null}
              </ThemedView>
            </Rise>
          ) : null}
          <Rise i={2}>
            <Owned cardId={card.id} />
          </Rise>
          <Rise i={3}>
            <AddToDeck card={card} />
          </Rise>
          <Rise i={4}>
          <ThemedView style={styles.facts}>
            <Fact label="Tipo" value={card.type} />
            <Fact label="Atributo" value={card.attribute} />
            <Fact label="Espécie" value={card.race} />
            <Fact label="Arquétipo" value={card.archetype} />
            <Fact label="Lançamento (OCG)" value={card.ocgDate} />
          </ThemedView>
          </Rise>
          <Rise i={5}>
            <ThemedView type="backgroundElement" style={[styles.desc, { borderLeftColor: theme.gold }]}>
              <ThemedText>{card.desc}</ThemedText>
            </ThemedView>
          </Rise>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    alignItems: 'center',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  artFrame: { width: '70%', maxWidth: 360, shadowOpacity: 0.45, shadowRadius: 28, shadowOffset: { width: 0, height: 0 } },
  art: { width: '100%', aspectRatio: CARD_ASPECT, borderRadius: 6 },
  name: { fontSize: 24, lineHeight: 30, textAlign: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: 999, paddingVertical: Spacing.one, paddingLeft: Spacing.one, paddingRight: Spacing.three },
  plate: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch' },
  rise: { alignSelf: 'stretch', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', borderRadius: Spacing.three, paddingVertical: Spacing.two, borderWidth: 1, borderColor: '#3A3220' },
  statLabel: { letterSpacing: 2, fontSize: 11, lineHeight: 14 },
  statValue: { fontSize: 24, lineHeight: 30 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  fact: { borderRadius: 999, paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.three },
  desc: { alignSelf: 'stretch', borderRadius: Spacing.three, borderLeftWidth: 3, padding: Spacing.three },
  owned: { alignItems: 'center', gap: Spacing.two },
});
