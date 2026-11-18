import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { Fx } from '@golden-era/duel-engine/present';

/** Barra de vida animada (a largura acompanha os LP com uma mola) e o número flutuante de dano ou cura. */
export function LpBar({ lp, max = 8000, fx }: { lp: number; max?: number; fx?: Fx }) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, lp / max));
  const width = useSharedValue(pct);
  const lift = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    width.set(withTiming(pct, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [pct, width]);

  useEffect(() => {
    if (!fx || (fx.kind !== 'damage' && fx.kind !== 'heal')) return;
    lift.set(0);
    fade.set(withSequence(withTiming(1, { duration: 120 }), withTiming(1, { duration: 700 }), withTiming(0, { duration: 400 })));
    lift.set(withTiming(-26, { duration: 1200, easing: Easing.out(Easing.quad) }));
  }, [fx, lift, fade]);

  const fill = useAnimatedStyle(() => ({ width: `${width.get() * 100}%` }));
  const floatStyle = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ translateY: lift.get() }] }));
  const low = pct < 0.25;
  const colors = low ? (['#ff7a7a', '#b3202a'] as const) : ([theme.goldLight, theme.goldDark] as const);

  return (
    <View style={[styles.track, { borderColor: theme.goldDark, backgroundColor: 'rgba(10,9,25,0.9)' }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: lp }}>
      <Animated.View style={[styles.fill, fill]}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <ThemedText type="smallBold" style={styles.text}>
        {lp} LP
      </ThemedText>
      {fx && (fx.kind === 'damage' || fx.kind === 'heal') ? (
        <Animated.View style={[styles.float, floatStyle]} pointerEvents="none">
          <ThemedText type="smallBold" style={{ color: fx.kind === 'damage' ? '#ff6b6b' : '#6be0a3', fontSize: 18 }}>
            {fx.text}
          </ThemedText>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 22, borderRadius: 11, borderWidth: 1, overflow: 'visible', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 11, overflow: 'hidden' },
  text: { textAlign: 'center', fontSize: 12, lineHeight: 16, color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  float: { position: 'absolute', right: 6, top: -6 },
});