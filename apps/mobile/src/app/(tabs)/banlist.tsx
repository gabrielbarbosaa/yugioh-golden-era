import type { Schemas } from '@golden-era/api-client';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtBanner } from '@/components/art-banner';
import { CardTile } from '@/components/card-tile';
import { LimitBadge } from '@/components/limit-badge';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useCards } from '@/hooks/use-cards';
import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';

type Banlist = Schemas['Banlist'];

const GAP = Spacing.two;
const GROUPS = [
  { max: 0, title: 'Proibidas', rule: 'não podem entrar no deck' },
  { max: 1, title: 'Limitadas', rule: 'no máximo 1 cópia' },
  { max: 2, title: 'Semilimitadas', rule: 'no máximo 2 cópias' },
] as const;

/** Quantas colunas cabem: cartas de ~100 px, de 3 (celular estreito) até 7 (web). */
const columnsFor = (width: number) => Math.max(3, Math.min(7, Math.floor((width + GAP) / (100 + GAP))));

export default function BanlistScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const [state, setState] = useState<{ list?: Banlist; error?: string }>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      let next: { list?: Banlist; error?: string };
      try {
        const { data, error } = await api.GET('/banlist');
        next = data ? { list: data } : { error: describeError(error) };
      } catch (e) {
        next = { error: describeError(e) };
      }
      if (active) setState(next);
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  const { list, error } = state;
  const cards = useCards(list?.cards.map((c) => c.cardId) ?? []);

  const contentWidth = Math.min(windowWidth, MaxContentWidth) - Spacing.three * 2;
  const columns = columnsFor(contentWidth);
  const tileWidth = Math.floor((contentWidth - GAP * (columns - 1)) / columns);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ArtBanner
            cardId={33396948}
            title="Lista da era"
            subtitle={list ? `${list.name} · desde ${list.effectiveFrom}` : 'Proibidas, limitadas e semilimitadas'}
          />
          {error ? (
            <StateMessage
              message={error}
              onRetry={() => {
                setState({});
                setAttempt((n) => n + 1);
              }}
            />
          ) : !list ? (
            <StateMessage loading />
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Vale para o deck inteiro (principal, Extra e Side somados). As demais cartas podem ter até 3 cópias.
              </ThemedText>
              {GROUPS.map((g) => {
                const entries = list.cards.filter((c) => c.maxCopies === g.max);
                return (
                  <ThemedView key={g.max} style={styles.group}>
                    <ThemedView style={styles.groupTitle}>
                      <LimitBadge maxCopies={g.max} size={26} />
                      <ThemedText type="smallBold">
                        {g.title} · {entries.length}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        ({g.rule})
                      </ThemedText>
                    </ThemedView>
                    {entries.length === 0 ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        Nenhuma carta.
                      </ThemedText>
                    ) : (
                      <ThemedView style={styles.grid}>
                        {entries.map((e) =>
                          cards[e.cardId] ? (
                            <CardTile key={e.cardId} card={cards[e.cardId]} width={tileWidth} />
                          ) : (
                            <ThemedView key={e.cardId} type="backgroundElement" style={{ width: tileWidth, height: tileWidth * 1.46 }} />
                          ),
                        )}
                      </ThemedView>
                    )}
                  </ThemedView>
                );
              })}
            </>
          )}
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
  content: { gap: Spacing.three, paddingTop: Spacing.two, paddingBottom: BottomTabInset + Spacing.five },
  group: { gap: Spacing.two },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});