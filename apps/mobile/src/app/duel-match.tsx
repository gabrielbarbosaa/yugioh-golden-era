import { router } from 'expo-router';
import { View } from 'react-native';

import { DuelBoard } from '@/components/duel/board';
import { PressableScale } from '@/components/pressable-scale';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDuel } from '@/lib/duel';

/** Mesa de duelo em tela cheia. Sair encerra a partida e volta ao lobby. */
export default function DuelMatchScreen() {
  const theme = useTheme();
  const duel = useDuel();

  function leave() {
    duel.leave();
    if (router.canGoBack()) router.back();
    else router.replace('/duel');
  }

  if (duel.phase === 'closed') {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four }}>
        <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
          Conexão encerrada
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          A conexão com o duelo foi encerrada.
        </ThemedText>
        <PressableScale feedback="thud" onPress={leave} accessibilityRole="button" style={{ backgroundColor: theme.gold, borderRadius: 14, paddingVertical: 12, paddingHorizontal: Spacing.four }}>
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            Voltar
          </ThemedText>
        </PressableScale>
      </ThemedView>
    );
  }
  if (duel.phase !== 'playing') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StateMessage loading />
      </View>
    );
  }
  return <DuelBoard onLeave={leave} />;
}