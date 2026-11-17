import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

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

  return (
    <ThemedView
      type="backgroundElement"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.banner, { height, borderColor: theme.border }]}>
      {card && width > 0 ? (
        <Image
          source={{ uri: card.imageUrl }}
          style={{
            position: 'absolute',
            width: imageWidth,
            height: imageHeight,
            left: (width - imageWidth) / 2,
            top: height / 2 - imageHeight * ART_CENTER,
            opacity: 0.6,
          }}
          contentFit="cover"
          transition={300}
        />
      ) : null}
      <View style={styles.shade} />
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
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 9, 25, 0.45)' },
  text: { paddingHorizontal: Spacing.three, gap: Spacing.half },
  title: { fontSize: 26, lineHeight: 34 },
});
