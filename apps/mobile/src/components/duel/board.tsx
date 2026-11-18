import type { Action, MonsterView, PlayerView } from '@golden-era/duel-engine';
import { factsOf, POSITION_NAMES } from '@golden-era/duel-engine/present';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { DuelCard } from '@/components/duel/duel-card';
import { DetailSheet, GraveSheet, LogSheet } from '@/components/duel/info-sheets';
import { LpBar } from '@/components/duel/lp-bar';
import { PendingSheet } from '@/components/duel/pending-sheet';
import { RevealOverlay } from '@/components/duel/reveal-overlay';
import { SummonSheet } from '@/components/duel/summon-sheet';
import { MonsterZone, TrapSlot } from '@/components/duel/zone';
import { PressableScale } from '@/components/pressable-scale';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDuel } from '@/lib/duel';
import { haptic } from '@/lib/haptics';

type PlayAct = Extract<Action, { type: 'play' }>;
type Sel = { v: number; picked: number[]; zone: number | null; sac: number | null };

/** Mesa de duelo: campo do oponente em cima, o seu embaixo, mão e ações na base. Toque longo em qualquer carta abre o detalhe. */
export function DuelBoard({ onLeave }: { onLeave: () => void }) {
  const theme = useTheme();
  const { width: screenW } = useWindowDimensions();
  const duel = useDuel();
  const { match, view, legal, log, foeOnline, version, reveal, fx, act, error } = duel;

  // A seleção vale só para o estado do servidor em que foi feita; chegou um novo, ela some (sem efeito colateral).
  const [raw, setRaw] = useState<Sel>({ v: -1, picked: [], zone: null, sac: null });
  const sel: Sel = raw.v === version ? raw : { v: version, picked: [], zone: null, sac: null };
  const update = (patch: Partial<Omit<Sel, 'v'>>) => setRaw({ ...sel, ...patch, v: version });
  const [summonOpen, setSummonOpen] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);
  const [grave, setGrave] = useState<0 | 1 | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  if (!match || !view) return <StateMessage loading />;

  const foeIdx: 0 | 1 = match.you === 0 ? 1 : 0;
  const me = view.players[match.you];
  const foe = view.players[foeIdx];
  const pend = view.pending;
  const canAct = view.actor === match.you && view.winner === null;
  const myTurn = canAct && pend === null;
  const nameOf = (id: number | null) => (id === null ? 'carta virada' : factsOf(match, id).name);

  const boardW = Math.min(screenW, 560);
  const gap = 6;
  const zoneW = Math.floor((boardW - Spacing.two * 2 - gap * 4) / 5);
  const hand = me.hand ?? [];

  // ---- jogadas legais a partir da seleção (mesmas regras do site)
  const plays = legal.filter((a): a is PlayAct => a.type === 'play');
  const prefixOf = (a: PlayAct) => sel.picked.every((p, i) => a.hand[i] === p);
  const nextOk = new Set(plays.filter((a) => prefixOf(a) && a.hand.length > sel.picked.length).map((a) => a.hand[sel.picked.length]!));
  const supportActionFor = (i: number) => legal.find((a): a is Extract<Action, { type: 'spell' | 'setTrap' }> => (a.type === 'spell' || a.type === 'setTrap') && hand[a.hand] === hand[i]);
  const supportPicked = sel.picked.length === 1 && match.support[hand[sel.picked[0]!]!] ? supportActionFor(sel.picked[0]!) : undefined;
  const exactAll = plays.filter((a) => a.hand.length === sel.picked.length && sel.picked.every((p, i) => a.hand[i] === p));
  const needsSacrifice = exactAll.some((a) => a.sacrifice !== undefined);
  const exact = needsSacrifice ? (sel.sac === null ? [] : exactAll.filter((a) => a.sacrifice === sel.sac)) : exactAll;
  const zoneActions = sel.zone === null ? [] : legal.filter((a) => (a.type === 'attack' || a.type === 'changePosition') && a.zone === sel.zone);

  const statusText = pend ? (canAct ? 'Sua resposta' : `Aguardando ${match.opponent}…`) : myTurn ? 'Sua vez' : `Vez de ${match.opponent}`;

  // ---- peças
  const monsterRow = (p: PlayerView, abs: 0 | 1) => (
    <View style={[styles.row, { gap }]}>
      {p.field.map((m: MonsterView | null, i) => {
        const mine = abs === match.you;
        const c = m && m.cardId !== null ? match.cards[m.cardId] : null;
        const selected = mine && (needsSacrifice ? sel.sac === i : sel.zone === i);
        return (
          <MonsterZone
            key={i}
            m={m}
            width={zoneW}
            mine={mine}
            fx={fx[`${abs}:${i}`]}
            selected={selected}
            stats={c ? `${c.atk}/${c.def}` : undefined}
            label={m ? `${mine ? 'Seu' : 'Do oponente'} monstro, zona ${i + 1}` : `Zona ${i + 1} vazia`}
            disabled={mine ? !myTurn : true}
            onLongPress={() => m?.cardId != null && setDetail(m.cardId)}
            onPress={() => {
              if (mine) {
                if (!m || !myTurn) return;
                haptic.select();
                if (needsSacrifice) update({ sac: selected ? null : i });
                else update({ zone: selected ? null : i });
              } else {
                // Com um monstro seu selecionado, tocar no do oponente ataca.
                const attack = sel.zone !== null ? legal.find((a) => a.type === 'attack' && a.zone === sel.zone && a.target === i) : undefined;
                if (attack) act(attack);
                else if (m?.cardId != null) setDetail(m.cardId);
              }
            }}
          />
        );
      })}
    </View>
  );

  const trapRow = (p: PlayerView, abs: 0 | 1) => (
    <View style={[styles.row, { gap: 10, justifyContent: 'center' }]}>
      {p.traps.map((t, i) => (
        <TrapSlot key={i} t={t} width={30} mine={abs === match.you} onLongPress={() => t?.cardId != null && setDetail(t.cardId)} />
      ))}
    </View>
  );

  const playerBar = (p: PlayerView, abs: 0 | 1) => {
    const mine = abs === match.you;
    const name = mine ? 'Você' : match.opponent;
    return (
      <View style={styles.bar}>
        <View style={styles.barTop}>
          <Avatar url={null} name={name} size={30} />
          <ThemedText type="smallBold" style={{ flex: 1 }}>
            {name}
            {!mine && !foeOnline ? <ThemedText type="small" themeColor="textSecondary"> (desconectado)</ThemedText> : null}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ✋ {p.handCount}  ·  🂠 {p.deckCount}
          </ThemedText>
          <PressableScale onPress={() => setGrave(abs)} accessibilityRole="button" accessibilityLabel={`Ver o cemitério ${mine ? 'seu' : `de ${match.opponent}`}`} style={[styles.graveBtn, { borderColor: theme.goldDark }]}>
            {p.graveyard.length > 0 ? <DuelCard id={p.graveyard[p.graveyard.length - 1]!} width={16} radius={2} /> : <ThemedText type="small">☠</ThemedText>}
            <ThemedText type="smallBold" style={{ fontSize: 12 }}>
              {p.graveyard.length}
            </ThemedText>
          </PressableScale>
        </View>
        <LpBar lp={p.lp} fx={fx[`lp:${abs}`]} />
      </View>
    );
  };

  const pillColors = canAct && !pend ? ([theme.goldDark, theme.gold, theme.goldDark] as const) : ([theme.backgroundSelected, theme.backgroundElement, theme.backgroundSelected] as const);

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0A0919', '#17123f', '#0A0919']} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <View style={styles.header}>
          <PressableScale onPress={onLeave} accessibilityRole="button" accessibilityLabel="Sair da partida" style={styles.headBtn}>
            <ThemedText type="smallBold">✕ Sair</ThemedText>
          </PressableScale>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
            Sala {match.room} · contra {match.opponent}
          </ThemedText>
          <PressableScale onPress={() => setLogOpen(true)} accessibilityRole="button" accessibilityLabel="Ver o histórico" style={styles.headBtn}>
            <ThemedText type="smallBold">📜 Histórico</ThemedText>
          </PressableScale>
        </View>
        {error ? (
          <ThemedText type="small" style={styles.error} accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}

        <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: boardW }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.mat, { borderColor: 'rgba(200,80,90,0.35)' }]}>
            {playerBar(foe, foeIdx)}
            <View style={styles.foeHand}>
              {Array.from({ length: Math.min(foe.handCount, 8) }, (_, i) => (
                <View key={i} style={{ marginLeft: i === 0 ? 0 : -14 }}>
                  <DuelCard id={null} width={26} radius={3} />
                </View>
              ))}
            </View>
            {trapRow(foe, foeIdx)}
            {monsterRow(foe, foeIdx)}
          </View>

          <LinearGradient colors={pillColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.pill}>
            {view.winner !== null ? (
              <ThemedText type="smallBold" style={styles.pillText}>
                {view.winner === 'draw' ? 'Empate' : view.winner === match.you ? 'Você venceu!' : `${match.opponent} venceu.`}
              </ThemedText>
            ) : (
              <ThemedText type="smallBold" style={[styles.pillText, { color: canAct && !pend ? theme.background : theme.goldLight }]}>
                {statusText} · turno {view.turn}
                {myTurn && view.spellUsed ? ' · magia usada' : ''}
              </ThemedText>
            )}
          </LinearGradient>

          <View style={[styles.mat, { borderColor: 'rgba(120,90,200,0.4)' }]}>
            {monsterRow(me, match.you)}
            {trapRow(me, match.you)}
            {playerBar(me, match.you)}
          </View>
        </ScrollView>

        {/* mão */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hand} style={styles.handScroll}>
          {hand.map((id, i) => {
            const on = sel.picked.includes(i);
            const sup = match.support[id];
            const usable = myTurn && (on || (sel.picked.length === 0 ? plays.some((a) => a.hand[0] === i) || supportActionFor(i) !== undefined : nextOk.has(i)));
            const c = match.cards[id];
            return (
              <Animated.View key={`${i}-${id}`} entering={FadeInDown.delay(i * 40).springify()}>
                <PressableScale
                  feedback="none"
                  disabled={!usable}
                  scaleTo={0.94}
                  onPress={() => {
                    haptic.select();
                    update({ sac: null, picked: on ? sel.picked.filter((p) => p !== i) : [...sel.picked, i] });
                  }}
                  onLongPress={() => setDetail(id)}
                  delayLongPress={280}
                  accessibilityRole="button"
                  accessibilityLabel={nameOf(id)}
                  accessibilityState={{ selected: on, disabled: !usable }}
                  style={[styles.handCard, on && styles.handLift]}>
                  <DuelCard id={id} width={68} selected={on} dim={!usable} />
                  <ThemedText type="small" style={[styles.handTag, { color: sup ? (sup.kind === 'spell' ? '#6be0a3' : '#ff8ad0') : theme.textSecondary }]}>
                    {sup ? (sup.kind === 'spell' ? 'Magia' : 'Armadilha') : `${c?.atk}/${c?.def}`}
                  </ThemedText>
                </PressableScale>
              </Animated.View>
            );
          })}
        </ScrollView>

        {/* ações */}
        {myTurn ? (
          <View style={styles.actions}>
            {needsSacrifice && sel.sac === null ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Campo cheio: toque num monstro seu para sacrificá-lo e dar lugar à carta.
              </ThemedText>
            ) : null}
            {sel.picked.length === 1 && nextOk.size > 0 && exact.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Dica: toque em outra carta da mão para tentar uma fusão.
              </ThemedText>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow} keyboardShouldPersistTaps="handled">
              {exact.length > 0 ? (
                <ActionButton primary label={exact[0]!.hand.length > 1 ? 'Fundir' : 'Invocar'} onPress={() => setSummonOpen(true)} />
              ) : null}
              {supportPicked ? <ActionButton primary label={supportPicked.type === 'spell' ? 'Usar magia' : 'Pôr a armadilha'} onPress={() => act(supportPicked)} /> : null}
              {zoneActions.map((a, i) => (
                <ActionButton
                  key={i}
                  primary={a.type === 'attack'}
                  label={
                    a.type === 'attack'
                      ? a.target === 'direct'
                        ? '⚔ Atacar direto'
                        : `⚔ Atacar ${nameOf(foe.field[a.target]?.cardId ?? null)}`
                      : `Mudar para ${POSITION_NAMES[(a as Extract<Action, { type: 'changePosition' }>).position]}`
                  }
                  onPress={() => act(a)}
                />
              ))}
              {sel.picked.length > 0 || sel.zone !== null || sel.sac !== null ? <ActionButton label="Limpar" onPress={() => update({ picked: [], zone: null, sac: null })} /> : null}
              <ActionButton label="Encerrar turno" onPress={() => act({ type: 'endTurn' })} />
            </ScrollView>
          </View>
        ) : null}
      </SafeAreaView>

      {/* anúncios e resultado */}
      {reveal ? <RevealOverlay key={reveal.key} reveal={reveal} /> : null}
      {view.winner !== null ? (
        <Animated.View entering={FadeInDown.delay(900).springify()} style={styles.endWrap} pointerEvents="box-none">
          <View style={[styles.end, { borderColor: theme.gold, backgroundColor: 'rgba(15,13,38,0.96)' }]}>
            <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
              {view.winner === 'draw' ? 'Empate' : view.winner === match.you ? 'Você venceu!' : `${match.opponent} venceu`}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {view.reason}
            </ThemedText>
            <ActionButton primary label="Voltar ao lobby" onPress={onLeave} />
          </View>
        </Animated.View>
      ) : null}

      {summonOpen && exact.length > 0 ? (
        <SummonSheet
          key={`${sel.picked.join(',')}-${sel.sac}`}
          plays={exact}
          hand={hand}
          match={match}
          sacrificeName={sel.sac !== null ? nameOf(me.field[sel.sac]?.cardId ?? null) : null}
          onAct={(a) => {
            setSummonOpen(false);
            act(a);
          }}
          onClose={() => setSummonOpen(false)}
        />
      ) : null}
      <PendingSheet view={view} match={match} legal={legal} onAct={act} />
      {grave !== null ? <GraveSheet view={view} match={match} initial={grave} onClose={() => setGrave(null)} onInspect={(id) => { setGrave(null); setDetail(id); }} /> : null}
      {logOpen ? <LogSheet log={log} onClose={() => setLogOpen(false)} /> : null}
      <DetailSheet id={detail} match={match} onClose={() => setDetail(null)} />
    </View>
  );
}

function ActionButton({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  const theme = useTheme();
  return (
    <PressableScale feedback={primary ? 'thud' : 'tap'} onPress={onPress} accessibilityRole="button" style={styles.actionWrap}>
      {primary ? (
        <LinearGradient colors={[theme.goldLight, theme.gold, theme.goldDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionBtn}>
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            {label}
          </ThemedText>
        </LinearGradient>
      ) : (
        <View style={[styles.actionBtn, { borderWidth: 1, borderColor: theme.goldDark, backgroundColor: 'rgba(10,9,25,0.7)' }]}>
          <ThemedText type="smallBold">{label}</ThemedText>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0919' },
  safe: { flex: 1, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, width: '100%', maxWidth: 560 },
  headBtn: { paddingVertical: 6, paddingHorizontal: Spacing.two, borderRadius: 999, backgroundColor: 'rgba(33,30,69,0.8)' },
  error: { color: '#ff7a7a', textAlign: 'center', paddingHorizontal: Spacing.two },
  scroll: { width: '100%', alignSelf: 'center', paddingHorizontal: Spacing.two, gap: Spacing.two, paddingVertical: Spacing.one },
  mat: { gap: Spacing.two, padding: Spacing.two, borderRadius: 16, borderWidth: 1, backgroundColor: 'rgba(21,19,46,0.72)' },
  row: { flexDirection: 'row', justifyContent: 'center' },
  bar: { gap: 6 },
  barTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  graveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, backgroundColor: 'rgba(10,9,25,0.7)' },
  foeHand: { flexDirection: 'row', justifyContent: 'center', height: 38 },
  pill: { alignSelf: 'center', borderRadius: 999, paddingVertical: 6, paddingHorizontal: Spacing.four },
  pillText: { textAlign: 'center', fontSize: 14 },
  handScroll: { flexGrow: 0, width: '100%' },
  hand: { paddingHorizontal: Spacing.two, paddingTop: 16, paddingBottom: 4, gap: Spacing.two, alignItems: 'flex-end' },
  handCard: { alignItems: 'center', gap: 2 },
  handLift: { transform: [{ translateY: -12 }] },
  handTag: { fontSize: 10, lineHeight: 13 },
  actions: { width: '100%', maxWidth: 560, gap: 4, paddingBottom: Spacing.one },
  actionRow: { paddingHorizontal: Spacing.two, gap: Spacing.two },
  actionWrap: {},
  actionBtn: { borderRadius: 14, paddingVertical: 11, paddingHorizontal: Spacing.three, alignItems: 'center' },
  hint: { textAlign: 'center', paddingHorizontal: Spacing.three, fontSize: 12, lineHeight: 16 },
  endWrap: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  end: { alignItems: 'center', gap: Spacing.two, padding: Spacing.four, borderRadius: 20, borderWidth: 2, maxWidth: 360, width: '100%' },
});

