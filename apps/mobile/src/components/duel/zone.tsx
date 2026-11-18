import type { MonsterView, TrapView } from '@golden-era/duel-engine';
import type { Fx } from '@golden-era/duel-engine/present';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { CARD_ASPECT } from '@/components/card-tile';
import { DuelCard } from '@/components/duel/duel-card';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';

/**
 * Zona de monstro: vazia (tracejada), com a carta em pé (ataque), deitada (defesa) ou virada (verso). Os efeitos
 * (ataque, invocação, destruição) vêm de `fx` e rodam uma vez a cada novo `fx.id`.
 */
export function MonsterZone({
  m,
  width,
  mine,
  fx,
  selected,
  stats,
  label,
  disabled,
  onPress,
  onLongPress,
}: {
  m: MonsterView | null;
  width: number;
  mine: boolean;
  fx?: Fx;
  selected: boolean;
  /** Texto curto sob a carta (ex.: "2500/2100"). */
  stats?: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const height = width / CARD_ASPECT;
  const shift = useSharedValue(0);
  const pop = useSharedValue(1);
  const ghost = useSharedValue(0);
  const fxId = fx?.id;
  const fxKind = fx?.kind;

  useEffect(() => {
    if (fxId === undefined) return;
    if (fxKind === 'attack') {
      haptic.thud();
      shift.set(withSequence(withTiming(mine ? -34 : 34, { duration: 150 }), withTiming(0, { duration: 280 })));
    } else if (fxKind === 'summon') {
      haptic.tap();
      pop.set(withSequence(withTiming(0.5, { duration: 0 }), withSpring(1, { damping: 7, stiffness: 170 })));
    } else if (fxKind === 'ghost') {
      ghost.set(withSequence(withTiming(1, { duration: 0 }), withTiming(0, { duration: 900 })));
    }
  }, [fxId, fxKind, mine, shift, pop, ghost]);

  const body = useAnimatedStyle(() => ({ transform: [{ translateY: shift.get() }, { scale: pop.get() }] }));
  const ghostStyle = useAnimatedStyle(() => ({ opacity: ghost.get(), transform: [{ scale: 1 + (1 - ghost.get()) * 0.25 }] }));
  const faceDown = m?.position === 'facedown' || m?.position === 'setattack';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      disabled={disabled && !m}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width, height, zIndex: fxKind === 'attack' ? 10 : 0 }}>
      {m ? (
        <Animated.View style={[{ width, height }, body]}>
          <DuelCard id={m.cardId} width={width} faceDown={faceDown} rotated={m.position === 'defense' || m.position === 'facedown'} selected={selected} />
          {stats ? (
            <View style={styles.stats} pointerEvents="none">
              <ThemedText type="smallBold" style={styles.statsText}>
                {stats}
              </ThemedText>
            </View>
          ) : null}
        </Animated.View>
      ) : (
        <View style={[styles.empty, { width, height, borderColor: theme.border }]} />
      )}
      {!m && fx?.kind === 'ghost' && fx.cardId !== undefined ? (
        <Animated.View style={[StyleSheet.absoluteFill, ghostStyle]} pointerEvents="none">
          <DuelCard id={fx.cardId} width={width} />
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

/** Espaço de armadilha: tracejado, ou uma carta virada (você vê a sua; o oponente só o verso). */
export function TrapSlot({ t, width, mine, onLongPress }: { t: TrapView | null; width: number; mine: boolean; onLongPress: () => void }) {
  const theme = useTheme();
  const height = width / CARD_ASPECT;
  if (!t) return <View style={[styles.empty, { width, height, borderColor: theme.border, borderRadius: 4 }]} />;
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={280} accessibilityRole="button" accessibilityLabel={mine ? 'Sua armadilha virada' : 'Armadilha do oponente'}>
      <DuelCard id={mine ? t.cardId : null} faceDown={!mine} width={width} radius={4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 6, backgroundColor: 'rgba(10, 9, 25, 0.45)' },
  stats: { position: 'absolute', left: 0, right: 0, bottom: -2, alignItems: 'center' },
  statsText: { fontSize: 10, lineHeight: 13, color: '#fff', backgroundColor: 'rgba(10, 9, 25, 0.88)', paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden' },
});