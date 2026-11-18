import type { Reveal } from '@golden-era/duel-engine/present';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, Extrapolation, FadeIn, FadeOut, ZoomIn, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import { cardBig } from '@/lib/duel';

const BORDER: Record<string, string> = { spell: '#3caa78', trap: '#c04a9a' };

/** Anúncio, grande e no centro, da carta usada (magia, armadilha, efeito, fusão...) para os dois jogadores. */
export function RevealOverlay({ reveal }: { reveal: Reveal }) {
  return reveal.kind === 'fusion' ? <FusionOverlay reveal={reveal} /> : <CardReveal reveal={reveal} />;
}

function CardReveal({ reveal }: { reveal: Reveal }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const color = BORDER[reveal.kind] ?? theme.gold;
  const imageWidth = Math.min(width * 0.52, 230);

  useEffect(() => {
    haptic.success();
  }, []);

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(300)} style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: reveal.kind === 'flip' ? 'transparent' : 'rgba(5,4,15,0.62)' }]} pointerEvents="none">
      <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.card, { borderColor: color, shadowColor: color, backgroundColor: 'rgba(15,13,38,0.96)' }]}>
        <ThemedText type="smallBold" style={{ color: theme.gold, fontSize: 15 }}>
          {reveal.title}
        </ThemedText>
        <Image source={{ uri: cardBig(reveal.id) }} style={{ width: imageWidth, height: imageWidth * (86 / 59), borderRadius: 8 }} contentFit="cover" />
        <ThemedText type="subtitle" style={styles.name}>
          {reveal.name}
        </ThemedText>
        {reveal.text ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.text} numberOfLines={5}>
            {reveal.text}
          </ThemedText>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Fusão no estilo do Forbidden Memories do PS1 (3,8 s): as cartas-material entram, giram dentro de um redemoinho de
 * luz, um clarão toma a tela e o monstro resultante surge no meio de raios dourados.
 */
function FusionOverlay({ reveal }: { reveal: Reveal }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(withTiming(1, { duration: 3800, easing: Easing.linear }));
    const id = setTimeout(() => haptic.thud(), 2200); // o clarão
    return () => clearTimeout(id);
  }, [t]);

  return <FusionScene reveal={reveal} t={t} />;
}

/** A cena da fusão em função do progresso `t` (0 a 1). Separada do relógio para poder mostrar quadros fixos. */
export function FusionScene({ reveal, t }: { reveal: Reveal; t: SharedValue<number> }) {
  const theme = useTheme();
  const { width: W, height: H } = useWindowDimensions();
  const mats = reveal.materials ?? [];
  const cardW = Math.min(W * 0.3, 130);
  const resultW = Math.min(W * 0.6, 250);
  const span = Math.max(W, H);
  const ringSizes = [Math.min(W, H) * 1.05, Math.min(W, H) * 0.78, Math.min(W, H) * 0.52];

  const bg = useAnimatedStyle(() => ({ opacity: interpolate(t.get(), [0, 0.06, 0.93, 1], [0, 1, 1, 0], Extrapolation.CLAMP) }));
  const flash = useAnimatedStyle(() => ({
    opacity: interpolate(t.get(), [0, 0.5, 0.58, 0.72, 0.86, 1], [0, 0, 1, 0.9, 0, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(t.get(), [0.5, 0.58, 0.72, 0.86], [0.1, 0.6, 1, 1.1], Extrapolation.CLAMP) }],
  }));
  const rays = useAnimatedStyle(() => ({
    opacity: interpolate(t.get(), [0, 0.58, 0.7, 0.92, 1], [0, 0, 1, 0.9, 0], Extrapolation.CLAMP),
    transform: [{ rotate: `${interpolate(t.get(), [0.58, 1], [0, 70], Extrapolation.CLAMP)}deg` }, { scale: interpolate(t.get(), [0.58, 0.92], [0.4, 1], Extrapolation.CLAMP) }],
  }));
  const result = useAnimatedStyle(() => ({
    opacity: interpolate(t.get(), [0, 0.56, 0.64, 0.92, 1], [0, 0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(t.get(), [0.56, 0.72, 0.8, 1], [0.1, 1.12, 1, 1.04], Extrapolation.CLAMP) },
      { rotate: `${interpolate(t.get(), [0.56, 0.72], [-200, 0], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const title = useAnimatedStyle(() => ({ opacity: interpolate(t.get(), [0, 0.1, 0.85, 1], [0, 1, 1, 0], Extrapolation.CLAMP) }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, bg]}>
        <LinearGradient colors={['#0b0724', '#02010a', '#0b0724']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {ringSizes.map((size, i) => (
        <Ring key={i} t={t} size={size} index={i} gold={theme.gold} />
      ))}

      {mats.map((id, i) => (
        <Material key={`${id}-${i}`} t={t} id={id} index={i} count={mats.length} width={cardW} />
      ))}

      <Animated.View style={[styles.flash, { width: span * 1.8, height: span * 1.8, borderRadius: span * 0.9 }, flash]} />

      <Animated.View style={[styles.origin, rays]}>
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={[styles.ray, { height: span * 1.2, top: -span * 0.6, transform: [{ rotate: `${i * 15}deg` }] }]} />
        ))}
      </Animated.View>

      <Animated.View style={[styles.resultBox, result]}>
        <Image source={{ uri: cardBig(reveal.id) }} style={{ width: resultW, height: resultW * (86 / 59), borderRadius: 10, shadowColor: '#ffe08c', shadowOpacity: 0.9, shadowRadius: 24 }} contentFit="cover" />
        <ThemedText type="subtitle" style={styles.resultName}>
          {reveal.name}
        </ThemedText>
      </Animated.View>

      <Animated.View style={[styles.titleBox, title]}>
        <ThemedText type="subtitle" style={styles.title}>
          {reveal.title}
        </ThemedText>
      </Animated.View>
    </View>
  );
}

type Progress = { get: () => number };

/** Um anel do redemoinho: arcos coloridos que giram e crescem até o clarão. */
function Ring({ t, size, index, gold }: { t: Progress; size: number; index: number; gold: string }) {
  const dir = index % 2 === 0 ? 1 : -1;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.get(), [0, 0.18, 0.35, 0.58, 0.72], [0, 0, 0.95, 1, 0], Extrapolation.CLAMP),
    transform: [
      { rotate: `${t.get() * 1300 * (index + 1) * 0.6 * dir}deg` },
      { scale: interpolate(t.get(), [0, 0.18, 0.35, 0.58, 0.72], [0.1, 0.15, 0.7, 1.1, 1.5], Extrapolation.CLAMP) },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2, borderTopColor: index === 1 ? '#8a4cff' : gold, borderRightColor: index === 1 ? gold : '#8a4cff', borderLeftColor: 'rgba(80,40,200,0.25)', borderBottomColor: 'transparent' },
        style,
      ]}
    />
  );
}

/** Carta-material: entra, sobe um pouco, vai ao centro girando e some no clarão. */
function Material({ t, id, index, count, width }: { t: Progress; id: number; index: number; count: number; width: number }) {
  const dx = (index - (count - 1) / 2) * width * 1.25;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.get(), [0, 0.12, 0.58, 0.62], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(t.get(), [0, 0.12, 0.3, 0.46, 0.58, 0.62], [dx, dx, dx, dx * 0.45, 0, 0], Extrapolation.CLAMP) },
      { translateY: interpolate(t.get(), [0, 0.12, 0.3, 0.46, 0.58], [30, 0, -8, 0, 0], Extrapolation.CLAMP) },
      { rotate: `${interpolate(t.get(), [0.3, 0.46, 0.58, 0.62], [0, 360, 900, 1080], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(t.get(), [0, 0.12, 0.46, 0.58, 0.62], [0.85, 1, 0.9, 0.25, 0], Extrapolation.CLAMP) },
    ],
  }));
  return (
    <Animated.View style={[styles.mat, { width, height: width * (86 / 59), marginLeft: -width / 2, marginTop: -(width * (86 / 59)) / 2 }, style]}>
      <Image source={{ uri: cardBig(id) }} style={{ width: '100%', height: '100%', borderRadius: 8 }} contentFit="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  card: { alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: 18, borderWidth: 2, maxWidth: 330, shadowOpacity: 0.7, shadowRadius: 22, elevation: 12 },
  name: { fontSize: 20, lineHeight: 26, textAlign: 'center' },
  text: { textAlign: 'center', fontSize: 13, lineHeight: 18 },
  flash: { position: 'absolute', backgroundColor: '#fff' },
  origin: { position: 'absolute', width: 0, height: 0 },
  ray: { position: 'absolute', left: -3, width: 6, backgroundColor: 'rgba(255, 224, 140, 0.5)' },
  ring: { position: 'absolute', borderWidth: 16, borderColor: 'transparent' },
  mat: { position: 'absolute', left: '50%', top: '50%', shadowColor: '#a078ff', shadowOpacity: 0.9, shadowRadius: 18, elevation: 10 },
  resultBox: { position: 'absolute', alignItems: 'center', gap: Spacing.two },
  resultName: { fontSize: 24, lineHeight: 30, textAlign: 'center', textShadowColor: 'rgba(230,180,34,0.9)', textShadowRadius: 12 },
  titleBox: { position: 'absolute', top: '9%', alignSelf: 'center' },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: 3, textTransform: 'uppercase', textShadowColor: 'rgba(160,120,255,0.95)', textShadowRadius: 14 },
});