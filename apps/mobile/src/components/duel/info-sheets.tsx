import type { GameView } from '@golden-era/duel-engine';
import { factsOf, type Match } from '@golden-era/duel-engine/present';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CARD_ASPECT } from '@/components/card-tile';
import { DuelCard } from '@/components/duel/duel-card';
import { Sheet } from '@/components/duel/sheet';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { cardBig } from '@/lib/duel';

/** Detalhe de uma carta (imagem grande, tipo, números e texto do efeito). Abre com o toque longo em qualquer carta. */
export function DetailSheet({ id, match, onClose }: { id: number | null; match: Match; onClose: () => void }) {
  const f = id !== null ? factsOf(match, id) : null;
  return (
    <Sheet visible={id !== null} onClose={onClose} title={f?.name} tall>
      {f ? (
        <View style={styles.detail}>
          <Image source={{ uri: cardBig(f.id) }} style={{ width: 210, height: 210 / CARD_ASPECT, borderRadius: 8 }} contentFit="cover" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {f.kind}
            {f.stats ? ` · ${f.stats}` : ''}
          </ThemedText>
          {f.text ? <ThemedText style={styles.center}>{f.text}</ThemedText> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** Cemitérios dos dois jogadores, em abas, da carta mais recente para a mais antiga. Toque numa carta para ver o detalhe. */
export function GraveSheet({ view, match, initial, onClose, onInspect }: { view: GameView; match: Match; initial: 0 | 1; onClose: () => void; onInspect: (id: number) => void }) {
  const theme = useTheme();
  const [side, setSide] = useState<0 | 1>(initial);
  const foe: 0 | 1 = match.you === 0 ? 1 : 0;
  const cards = view.players[side].graveyard;
  const ordered = cards.map((id, i) => ({ id, i })).reverse();

  return (
    <Sheet visible onClose={onClose} title="Cemitério" tall>
      <View style={styles.tabs}>
        {([match.you, foe] as const).map((s) => (
          <PressableScale key={s} feedback="select" onPress={() => setSide(s)} accessibilityRole="tab" accessibilityState={{ selected: side === s }} style={[styles.tab, { borderColor: side === s ? theme.gold : theme.border, backgroundColor: side === s ? theme.gold : 'transparent' }]}>
            <ThemedText type="smallBold" style={{ color: side === s ? theme.background : theme.text }}>
              {s === match.you ? 'Seu cemitério' : `De ${match.opponent}`} ({view.players[s].graveyard.length})
            </ThemedText>
          </PressableScale>
        ))}
      </View>
      {ordered.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Vazio.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={[styles.center, { fontSize: 12 }]}>
            Da mais recente para a mais antiga.
          </ThemedText>
          <View style={styles.grid}>
            {ordered.map(({ id, i }, n) => (
              <PressableScale key={i} feedback="tap" onPress={() => onInspect(id)} accessibilityRole="button" accessibilityLabel={factsOf(match, id).name} style={styles.graveCell}>
                <DuelCard id={id} width={74} />
                <ThemedText type="small" numberOfLines={2} style={styles.graveName}>
                  {factsOf(match, id).name}
                </ThemedText>
                {n === 0 ? (
                  <ThemedText type="small" style={{ color: theme.goldLight, fontSize: 10 }}>
                    mais recente
                  </ThemedText>
                ) : null}
              </PressableScale>
            ))}
          </View>
        </>
      )}
    </Sheet>
  );
}

/** Histórico da partida, do lance mais recente para o mais antigo. */
export function LogSheet({ log, onClose }: { log: string[]; onClose: () => void }) {
  const theme = useTheme();
  return (
    <Sheet visible onClose={onClose} title="Histórico" tall>
      {log.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Nada aconteceu ainda.
        </ThemedText>
      ) : (
        log
          .slice()
          .reverse()
          .map((line, i) => (
            <View key={i} style={[styles.logRow, { borderLeftColor: i === 0 ? theme.gold : theme.border }]}>
              <ThemedText type="small" themeColor={i === 0 ? 'text' : 'textSecondary'}>
                {line}
              </ThemedText>
            </View>
          ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  detail: { alignItems: 'center', gap: Spacing.two },
  tabs: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'center', flexWrap: 'wrap' },
  tab: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'center' },
  graveCell: { width: 78, alignItems: 'center', gap: 3 },
  graveName: { fontSize: 10, lineHeight: 13, textAlign: 'center' },
  logRow: { borderLeftWidth: 3, paddingLeft: Spacing.two, paddingVertical: 2 },
});