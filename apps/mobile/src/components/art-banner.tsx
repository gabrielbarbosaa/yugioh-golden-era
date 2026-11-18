import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { CARD_ASPECT } from '@/components/card-tile';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCards } from '@/hooks/use-cards';
import { useTheme } from '@/hooks/use-theme';

// A ilustração fica no quadro central da carta: o centro dela fica a ~47,5% da altura; usamos 40% para enquadrar mais o topo, onde costumam ficar os rostos.
const ART_CENTER = 0.4;

/**
 * Cabeçalho de tela com um "papel de parede" feito da arte de uma carta do catálogo: a imagem é ampliada para
 * mostrar só o quadro da ilustração e escurecida para o texto continuar legível.
 */
export function ArtBanner({
  cardId,
  title,
  subtitle,
  height = 120,
}: {
  cardId: number;
  title: string;
  subtitle?: string;
  height?: number;
}) {
  const theme = useTheme();
  const card = useCards([cardId])[cardId];
  const [width, setWidth] = useState(0);

  const imageWidth = width * 1.35;
  const imageHeight = imageWidth / CARD_ASPECT;

  // Movimento lento de aproximação e recuo da arte (um respiro, sem distrair).
  const drift = useSharedValue(1);
  useEffect(() => {
    drift.set(withRepeat(withTiming(1.09, { duration: 9000, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [drift]);
  const driftStyle = useAnimatedStyle(() => ({ transform: [{ scale: drift.get() }] }));

  return (
    <ThemedView
      type="backgroundElement"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.banner, { height, borderColor: theme.border }]}>
      {card && width > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, driftStyle]} pointerEvents="none">
          <Image
            source={{ uri: card.imageUrl }}
            style={{
              position: 'absolute',
              width: imageWidth,
              height: imageHeight,
              left: (width - imageWidth) / 2,
              top: height / 2 - imageHeight * ART_CENTER,
              opacity: 0.7,
            }}
            contentFit="cover"
            transition={600}
          />
        </Animated.View>
      ) : null}
      <LinearGradient colors={['rgba(10,9,25,0.25)', 'rgba(10,9,25,0.82)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['transparent', theme.gold, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.hair} />
      <View style={styles.text}>
        <ThemedText type="subtitle" style={styles.title}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: Spacing.three, borderWidth: 1, overflow: 'hidden', justifyContent: 'center' },
  hair: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, opacity: 0.8 },
  text: { paddingHorizontal: Spacing.three, gap: Spacing.half },
  title: { fontSize: 26, lineHeight: 34, textShadowColor: 'rgba(230,180,34,0.55)', textShadowRadius: 12 },
});
