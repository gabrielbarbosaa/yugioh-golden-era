import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtBanner } from '@/components/art-banner';
import { DuelLobby, WaitingRoom } from '@/components/duel/lobby';
import { PressableScale } from '@/components/pressable-scale';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDuel } from '@/lib/duel';
import { useSession } from '@/lib/session';

/** Aba Duelo: lobby (baralho + modo de jogo), sala de espera e, com a partida em andamento, o caminho de volta a ela. */
export default function DuelScreen() {
  const theme = useTheme();
  const { signedIn } = useSession();
  const duel = useDuel();
  const previous = useRef(duel.phase);

  // Quando a partida começa, abre a mesa em tela cheia. (Voltando dela com a partida ainda rolando, não reabre sozinho.)
  useEffect(() => {
    if (previous.current !== 'playing' && duel.phase === 'playing') router.push('/duel-match');
    previous.current = duel.phase;
  }, [duel.phase]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ArtBanner cardId={46986414} title="Duelo" subtitle="Regras da casa inspiradas em Forbidden Memories" height={128} />
          {signedIn === null ? (
            <StateMessage loading />
          ) : !signedIn ? (
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Entre na sua conta (aba Perfil) para duelar.
            </ThemedText>
          ) : duel.phase === 'waiting' ? (
            <WaitingRoom />
          ) : duel.phase === 'playing' || duel.phase === 'closed' ? (
            <ThemedView type="backgroundElement" style={[styles.resume, { borderColor: theme.gold }]}>
              <ThemedText type="subtitle" style={{ fontSize: 22, lineHeight: 28 }}>
                {duel.phase === 'playing' ? 'Partida em andamento' : 'Conexão encerrada'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                {duel.phase === 'playing' ? `Contra ${duel.match?.opponent ?? 'o oponente'}.` : 'A conexão com o duelo foi encerrada.'}
              </ThemedText>
              <PressableScale feedback="thud" onPress={() => (duel.phase === 'playing' ? router.push('/duel-match') : duel.leave())} accessibilityRole="button" style={[styles.resumeBtn, { backgroundColor: theme.gold }]}>
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  {duel.phase === 'playing' ? 'Voltar à partida' : 'Voltar ao lobby'}
                </ThemedText>
              </PressableScale>
              {duel.phase === 'playing' ? (
                <PressableScale onPress={duel.leave} accessibilityRole="button">
                  <ThemedText type="linkPrimary">Abandonar a partida</ThemedText>
                </PressableScale>
              ) : null}
            </ThemedView>
          ) : (
            <DuelLobby />
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.three, paddingTop: TopTabInset },
  content: { gap: Spacing.three, paddingTop: Spacing.two, paddingBottom: BottomTabInset + Spacing.five },
  resume: { alignItems: 'center', gap: Spacing.three, padding: Spacing.four, borderRadius: 20, borderWidth: 1 },
  resumeBtn: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: Spacing.four },
});