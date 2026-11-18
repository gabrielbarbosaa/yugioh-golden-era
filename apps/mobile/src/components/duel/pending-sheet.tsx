import type { Action, GameView } from '@golden-era/duel-engine';
import { CHOOSE_TITLES, factsOf, POSITION_NAMES, type Match } from '@golden-era/duel-engine/present';
import { StyleSheet, View } from 'react-native';

import { DuelCard } from '@/components/duel/duel-card';
import { Sheet } from '@/components/duel/sheet';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function Choice({ id, label, extra, onPress }: { id: number | null; label: string; extra?: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.choice, { borderColor: theme.goldDark, backgroundColor: theme.backgroundSelected }]}>
      <DuelCard id={id} width={78} />
      {id === null ? (
        <ThemedText type="smallBold" style={styles.center}>
          Monstro virado
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary" style={[styles.center, styles.small]}>
        {label}
      </ThemedText>
      {extra ? (
        <ThemedText type="small" themeColor="textSecondary" style={[styles.center, styles.small]}>
          {extra}
        </ThemedText>
      ) : null}
    </PressableScale>
  );
}

/**
 * Resposta ou escolha pendente, com as cartas à vista: reagir a um ataque (armadilha virada ou Kuriboh) ou escolher o
 * alvo de um efeito (Monster Reborn mostra os cemitérios; Man-Eater Bug e Hane-Hane, os monstros em campo).
 */
export function PendingSheet({ view, match, legal, onAct }: { view: GameView; match: Match; legal: Action[]; onAct: (a: Action) => void }) {
  const pend = view.pending;
  if (!pend || view.actor !== match.you || view.winner !== null) return null;
  const me = view.players[match.you];
  const hand = me.hand ?? [];

  let heading: string;
  if (pend.type === 'respond') {
    const atk = view.players[pend.attacker.side].field[pend.attacker.zone];
    const atkCard = atk?.cardId != null ? match.cards[atk.cardId] : null;
    heading = `${match.opponent} ataca com ${atk?.cardId != null ? factsOf(match, atk.cardId).name : 'um monstro'}${atkCard ? ` (ATK ${atkCard.atk})` : ''} ${
      pend.target === 'direct' ? 'direto nos seus pontos de vida' : `o seu monstro da zona ${pend.target + 1}`
    }. Quer responder?`;
  } else {
    heading = CHOOSE_TITLES[pend.effect] ?? 'Escolha o alvo do efeito';
  }

  const named = (id: number | null, label: string, extra: string | undefined, onPress: () => void, key: number) => (
    <View key={key} style={styles.cell}>
      <Choice id={id} label={label} extra={extra} onPress={onPress} />
      {id !== null ? (
        <ThemedText type="smallBold" numberOfLines={2} style={[styles.center, styles.nameUnder]}>
          {factsOf(match, id).name}
        </ThemedText>
      ) : null}
    </View>
  );

  return (
    <Sheet visible onClose={() => {}} title={pend.type === 'respond' ? 'Responder ao ataque' : 'Escolha o alvo'}>
      <ThemedText style={styles.center}>{heading}</ThemedText>
      <View style={styles.grid}>
        {pend.type === 'respond'
          ? legal.map((a, i) => {
              if (a.type === 'pass') {
                return (
                  <PressableScale key={i} onPress={() => onAct(a)} accessibilityRole="button" style={styles.pass}>
                    <ThemedText type="linkPrimary">Deixar o ataque passar</ThemedText>
                  </PressableScale>
                );
              }
              if (a.type !== 'respond') return null;
              const id = a.from === 'trap' ? (me.traps[a.index]?.cardId ?? null) : (hand[a.index] ?? null);
              return named(id, a.from === 'trap' ? 'Ativar armadilha' : 'Descartar da mão', undefined, () => onAct(a), i);
            })
          : pend.options?.map((o, index) => {
              if (o.kind === 'grave') {
                const id = view.players[o.side].graveyard[o.index] ?? null;
                return named(id, o.side === match.you ? 'Seu cemitério' : 'Cemitério do oponente', undefined, () => onAct({ type: 'choose', index }), index);
              }
              const m = view.players[o.side].field[o.zone];
              return named(m?.cardId ?? null, `${o.side === match.you ? 'Seu' : 'Do oponente'} · zona ${o.zone + 1}`, m ? POSITION_NAMES[m.position] : undefined, () => onAct({ type: 'choose', index }), index);
            })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  small: { fontSize: 11, lineHeight: 14 },
  nameUnder: { fontSize: 12, lineHeight: 15, maxWidth: 100 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'center' },
  cell: { alignItems: 'center', gap: 4 },
  choice: { alignItems: 'center', gap: 2, padding: Spacing.two, borderRadius: 14, borderWidth: 1, minWidth: 100 },
  pass: { alignSelf: 'stretch', alignItems: 'center', padding: Spacing.two },
});