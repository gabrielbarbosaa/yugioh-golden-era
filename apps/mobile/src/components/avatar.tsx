import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

// A carta pequena tem proporção 118:172. A caixa de arte (~74% da largura) fica centrada a ~47% da altura:
// a imagem é ampliada para que ela preencha o círculo.
const ZOOM = 1 / 0.74;
const ASPECT = 172 / 118;
const ART_CENTER = 0.47;

/**
 * Foto de perfil: a ilustração da carta escolhida recortada em círculo. `url` é a imagem pequena da carta
 * (`avatarUrl` da API); sem ela mostra a inicial do nome.
 */
export function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  const theme = useTheme();
  const frame = { width: size, height: size, borderRadius: size / 2, borderColor: theme.goldDark, backgroundColor: theme.backgroundSelected };
  if (!url) {
    return (
      <View style={[styles.frame, styles.initial, frame]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ThemedText type="smallBold" style={{ color: theme.goldLight, fontSize: size * 0.42, lineHeight: size * 0.5 }}>
          {name.slice(0, 1).toUpperCase()}
        </ThemedText>
      </View>
    );
  }
  const width = size * ZOOM;
  const height = width * ASPECT;
  return (
    <View style={[styles.frame, frame]} accessibilityRole="image" accessibilityLabel={`Foto de perfil de ${name}`}>
      <Image
        source={{ uri: url }}
        contentFit="cover"
        style={{ position: 'absolute', width, height, left: (size - width) / 2, top: size / 2 - ART_CENTER * height }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 2, overflow: 'hidden' },
  initial: { alignItems: 'center', justifyContent: 'center' },
});