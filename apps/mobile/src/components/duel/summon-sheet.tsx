import type { Action, Position } from '@golden-era/duel-engine';
import { POSITION_NAMES, STAR_NAMES, type Match } from '@golden-era/duel-engine/present';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DuelCard } from '@/components/duel/duel-card';
import { Sheet } from '@/components/duel/sheet';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

type PlayAct = Extract<Action, { type: 'play' }>;

const POSITION_HELP: Record<Position, { title: string; help: string }> = {
  attack: { title: 'Ataque', help: 'Em pé, aberta. Ataca a partir do próximo turno.' },
  setattack: { title: 'Ataque virado', help: 'Em pé, virada. Ataca a partir do próximo turno; é revelada ao atacar ou ser atacada.' },
  defense: { title: 'Defesa', help: 'De lado, aberta. Defende com a DEF e não ataca.' },
  facedown: { title: 'Defesa virada', help: 'De lado, virada. O oponente só vê a carta quando ela é atacada.' },
};

/**
 * Painel de invocação: com a carta (ou a fusão) escolhida na mão, decide como colocá-la: posição (ataque, ataque
 * virado, defesa, defesa virada), estrela e, se a fusão tiver mais de um resultado, qual. `plays` são as jogadas
 * legais que usam exatamente as cartas selecionadas.
 */
export function SummonSheet({
  plays,
  hand,
  match,
  sacrificeName,
  onAct,
  onClose,
}: {
  plays: PlayAct[];
  hand: number[];
  match: Match;
  sacrificeName: string | null;
  onAct: (a: Action) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const first = plays[0]!;
  const [position, setPosition] = useState<Position>(first.position);
  const [star, setStar] = useState<0 | 1>(first.star);
  const [result, setResult] = useState<number | undefined>(first.result);

  const positions = (['attack', 'setattack', 'defense', 'facedown'] as const).filter((p) => plays.some((a) => a.position === p));
  const stars = ([0, 1] as const).filter((s) => plays.some((a) => a.star === s));
  const results = [...new Set(plays.map((a) => a.result).filter((r): r is number => r !== undefined))];
  const chosen = plays.find((a) => a.position === position && a.star === star && a.result === result) ?? plays.find((a) => a.position === position) ?? first;

  const fusion = first.hand.length > 1;
  const materials = first.hand.map((i) => hand[i]!);
  const previewId = fusion ? (chosen.result ?? null) : (materials[0] ?? null);
  const info = previewId !== null ? match.cards[previewId] : undefined;
  const name = (id: number) => match.cards[id]?.name ?? `#${id}`;
  const starName = (s: 0 | 1) => {
    const k = info?.stars[s];
    return k ? STAR_NAMES[k] : `Estrela ${s + 1}`;
  };

  return (
    <Sheet visible onClose={onClose} title={fusion ? 'Fundir cartas' : 'Invocar monstro'} tall>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={{ textAlign: 'center', color: theme.goldLight }}>
          {fusion ? materials.map(name).join(' + ') : name(materials[0]!)}
        </ThemedText>
        {info ? (
          <ThemedText type="small" themeColor="textSecondary">
            ATK {info.atk} / DEF {info.def}
          </ThemedText>
        ) : fusion ? (
          <ThemedText type="small" themeColor="textSecondary">
            O resultado depende da receita
          </ThemedText>
        ) : null}
      </View>

      {results.length > 1 ? (
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Qual fusão?
          </ThemedText>
          <View style={styles.row}>
            {results.map((r) => (
              <PressableScale key={r} onPress={() => setResult(r)} accessibilityRole="button" accessibilityState={{ selected: result === r }} style={[styles.tile, { borderColor: result === r ? theme.gold : theme.border, backgroundColor: theme.backgroundSelected }]}>
                <DuelCard id={r} width={64} selected={result === r} />
                <ThemedText type="small" numberOfLines={2} style={styles.tileText}>
                  {name(r)}
                </ThemedText>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.block}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          Como colocar a carta
        </ThemedText>
        <View style={styles.grid}>
          {positions.map((p) => (
            <PressableScale
              key={p}
              feedback="none"
              onPress={() => {
                haptic.select();
                setPosition(p);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: position === p }}
              style={[styles.opt, { borderColor: position === p ? theme.gold : theme.border, backgroundColor: position === p ? theme.backgroundSelected : 'rgba(10,9,25,0.6)' }, position === p && styles.optOn]}>
              <DuelCard id={previewId} width={46} faceDown={p === 'facedown' || p === 'setattack' || previewId === null} rotated={p === 'defense' || p === 'facedown'} />
              <ThemedText type="smallBold" style={styles.center}>
                {POSITION_HELP[p].title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={[styles.center, { fontSize: 11, lineHeight: 14 }]}>
                {POSITION_HELP[p].help}
              </ThemedText>
            </PressableScale>
          ))}
        </View>
      </View>

      {stars.length > 1 ? (
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Estrela de guarda (vantagem só na batalha)
          </ThemedText>
          <View style={styles.row}>
            {stars.map((s) => (
              <PressableScale key={s} feedback="none" onPress={() => { haptic.select(); setStar(s); }} accessibilityRole="radio" accessibilityState={{ selected: star === s }} style={[styles.pill, { borderColor: star === s ? theme.gold : theme.border, backgroundColor: star === s ? theme.gold : 'transparent' }]}>
                <ThemedText type="smallBold" style={{ color: star === s ? theme.background : theme.text }}>
                  ★ {starName(s)}
                </ThemedText>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}

      {sacrificeName ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Campo cheio: {sacrificeName} será sacrificado para dar lugar à carta.
        </ThemedText>
      ) : null}

      <PressableScale feedback="thud" onPress={() => onAct(chosen)} accessibilityRole="button" style={styles.confirmWrap}>
        <LinearGradient colors={[theme.goldLight, theme.gold, theme.goldDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.confirm}>
          <ThemedText type="smallBold" style={{ color: theme.background, fontSize: 16 }}>
            {fusion ? 'Fundir' : 'Invocar'} em {POSITION_NAMES[position]}
          </ThemedText>
        </LinearGradient>
      </PressableScale>
      <PressableScale onPress={onClose} accessibilityRole="button" style={styles.cancel}>
        <ThemedText type="linkPrimary">Cancelar</ThemedText>
      </PressableScale>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 2 },
  block: { gap: Spacing.two },
  label: { textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  opt: { width: '47.5%', alignItems: 'center', gap: 4, padding: Spacing.two, borderRadius: 14, borderWidth: 1 },
  optOn: { shadowColor: '#E6B422', shadowOpacity: 0.55, shadowRadius: 10, elevation: 6 },
  center: { textAlign: 'center' },
  tile: { width: 92, alignItems: 'center', gap: 4, padding: Spacing.two, borderRadius: 12, borderWidth: 1 },
  tileText: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
  pill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999, borderWidth: 1 },
  confirmWrap: { alignSelf: 'stretch' },
  confirm: { borderRadius: 16, paddingVertical: Spacing.three, alignItems: 'center' },
  cancel: { alignItems: 'center', padding: Spacing.two },
});