import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { CARD_ASPECT } from '@/components/card-tile';
import { useTheme } from '@/hooks/use-theme';
import { cardArt } from '@/lib/duel';

const BACK = require('@/assets/images/card-back.jpg');

/**
 * Carta do duelo. `id` nulo ou `faceDown` mostram o verso. Em defesa (`rotated`) a carta fica deitada, com a mesma
 * proporção, dentro de um espaço retrato de largura `width` (como na mesa do site).
 */
export function DuelCard({
  id,
  width,
  faceDown = false,
  rotated = false,
  selected = false,
  dim = false,
  radius = 5,
}: {
  id: number | null;
  width: number;
  faceDown?: boolean;
  rotated?: boolean;
  selected?: boolean;
  dim?: boolean;
  radius?: number;
}) {
  const theme = useTheme();
  const slotHeight = width / CARD_ASPECT;
  const showBack = id === null || faceDown;
  // Deitada, a largura visível (a altura da carta) precisa caber em `width`.
  const w = rotated ? width * CARD_ASPECT : width;
  const h = w / CARD_ASPECT;

  return (
    <View style={{ width, height: slotHeight, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={[
          styles.card,
          { width: w, height: h, borderRadius: radius, borderColor: selected ? theme.gold : 'rgba(0,0,0,0.5)', shadowColor: selected ? theme.gold : '#000' },
          selected && styles.glow,
          rotated && { transform: [{ rotate: '90deg' }] },
          dim && { opacity: 0.45 },
        ]}>
        <Image
          source={showBack ? BACK : { uri: cardArt(id!) }}
          style={{ width: '100%', height: '100%', borderRadius: radius - 1 }}
          contentFit="cover"
          transition={120}
          recyclingKey={showBack ? 'back' : String(id)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, overflow: 'hidden', shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  glow: { borderWidth: 2, shadowOpacity: 0.95, shadowRadius: 10, elevation: 8 },
});