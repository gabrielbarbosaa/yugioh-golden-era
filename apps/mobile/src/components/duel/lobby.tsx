import type { DeckSummary } from '@golden-era/api-client';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useDuel } from '@/lib/duel';
import { haptic } from '@/lib/haptics';

const BACK = require('@/assets/images/card-back.jpg');

type Chosen = { id: string; name: string } | null;

function DeckTile({ name, subtitle, cover, selected, index, onPress }: { name: string; subtitle: string; cover?: string | null; selected: boolean; index: number; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(index * 45).springify()}>
      <PressableScale
        feedback="select"
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        style={[styles.deck, { borderColor: selected ? theme.gold : theme.border, backgroundColor: selected ? theme.backgroundSelected : 'rgba(10,9,25,0.65)' }, selected && styles.deckOn]}>
        <Image source={cover ? { uri: cover } : BACK} style={styles.deckArt} contentFit="cover" transition={150} />
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ fontSize: 12 }}>
            {subtitle}
          </ThemedText>
        </View>
        {selected ? (
          <View style={[styles.check, { backgroundColor: theme.gold }]}>
            <ThemedText type="smallBold" style={{ color: theme.background, fontSize: 12, lineHeight: 16 }}>
              ✓
            </ThemedText>
          </View>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
}

function ModeCard({ icon, title, text, primary, disabled, onPress }: { icon: string; title: string; text: string; primary?: boolean; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  const body = (
    <>
      <View style={[styles.modeIcon, { borderColor: theme.goldDark }]}>
        <ThemedText style={{ fontSize: 22, lineHeight: 28, color: theme.goldLight }}>{icon}</ThemedText>
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText type="subtitle" style={styles.modeTitle}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {text}
        </ThemedText>
      </View>
    </>
  );
  return (
    <PressableScale feedback="thud" disabled={disabled} onPress={onPress} accessibilityRole="button" style={[{ opacity: disabled ? 0.55 : 1 }]}>
      {primary ? (
        <LinearGradient colors={['rgba(230,180,34,0.38)', 'rgba(48,38,110,0.75)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.mode, { borderColor: theme.gold }]}>
          {body}
        </LinearGradient>
      ) : (
        <View style={[styles.mode, { borderColor: theme.border, backgroundColor: 'rgba(10,9,25,0.65)' }]}>{body}</View>
      )}
    </PressableScale>
  );
}

/** Tela inicial do duelo: escolher o baralho e como jogar (contra o bot, criando uma sala ou entrando com um código). */
export function DuelLobby() {
  const theme = useTheme();
  const duel = useDuel();
  const busy = duel.phase === 'connecting';
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [chosen, setChosen] = useState<Chosen>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    let active = true;
    api
      .GET('/me/decks', { params: { query: { limit: 50 } } })
      .then(({ data }) => {
        if (active) setDecks(data?.items ?? []);
      })
      .catch(() => {
        if (active) setDecks([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const start = (extra: { room?: string; bot?: boolean }) => duel.connect({ deckId: chosen?.id, deckName: chosen?.name, ...extra });

  return (
    <View style={styles.wrap}>
      {duel.error ? (
        <ThemedText type="small" style={styles.error} accessibilityRole="alert">
          {duel.error}
        </ThemedText>
      ) : null}

      <View style={styles.step}>
        <View style={[styles.stepNum, { backgroundColor: theme.gold }]}>
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            1
          </ThemedText>
        </View>
        <ThemedText type="subtitle" style={styles.stepTitle}>
          Escolha o seu baralho
        </ThemedText>
      </View>
      <View style={{ gap: Spacing.two }}>
        <DeckTile name="Aleatório" subtitle="40 cartas sorteadas da era" selected={chosen === null} index={0} onPress={() => setChosen(null)} />
        {(decks ?? []).map((d, i) => (
          <DeckTile
            key={d.id}
            name={d.name}
            subtitle={`${d.visibility === 'private' ? 'Privado' : 'Público'}${d.archetype ? ` · ${d.archetype}` : ''}`}
            cover={d.coverImageUrl}
            selected={chosen?.id === d.id}
            index={i + 1}
            onPress={() => setChosen({ id: d.id, name: d.name })}
          />
        ))}
        {decks && decks.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Você ainda não tem decks (aba Decks no Perfil). Jogue com um baralho aleatório.
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, lineHeight: 17 }}>
          O duelo usa os monstros e as magias/armadilhas que o modo conhece; fusões, Extra Deck e Side Deck ficam de fora, e o que faltar para 40 cartas é completado ao acaso.
        </ThemedText>
      </View>

      <View style={styles.step}>
        <View style={[styles.stepNum, { backgroundColor: theme.gold }]}>
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            2
          </ThemedText>
        </View>
        <ThemedText type="subtitle" style={styles.stepTitle}>
          Como você quer jogar?
        </ThemedText>
      </View>
      <ModeCard primary icon="⚔" title="Jogar contra o bot" text="Partida na hora, sem esperar ninguém." disabled={busy} onPress={() => start({ bot: true })} />
      <ModeCard icon="✦" title="Criar sala" text="Gera um código para um amigo entrar." disabled={busy} onPress={() => start({})} />
      <View style={[styles.join, { borderColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary">
          Já tem um código?
        </ThemedText>
        <View style={styles.joinRow}>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ABCD"
            placeholderTextColor={theme.textSecondary}
            maxLength={4}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            style={[styles.code, { color: theme.goldLight, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
          />
          <PressableScale feedback="thud" disabled={busy || code.length === 0} onPress={() => start({ room: code })} accessibilityRole="button" style={{ opacity: busy || code.length === 0 ? 0.5 : 1 }}>
            <LinearGradient colors={[theme.goldLight, theme.gold, theme.goldDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.joinBtn}>
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                Entrar na sala
              </ThemedText>
            </LinearGradient>
          </PressableScale>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        {busy ? 'Conectando ao duelo…' : `Baralho escolhido: ${chosen ? chosen.name : 'Aleatório'}`}
      </ThemedText>
    </View>
  );
}

/** Sala criada, aguardando o oponente: código grande, botão de copiar e o baralho escolhido. */
export function WaitingRoom() {
  const theme = useTheme();
  const duel = useDuel();
  const [copied, setCopied] = useState(false);
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.set(withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.35, { duration: 700 })), -1));
  }, [pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.get(), transform: [{ scale: 0.8 + pulse.get() * 0.5 }] }));

  async function copy() {
    try {
      await Clipboard.setStringAsync(duel.room ?? '');
      haptic.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sem acesso à área de transferência: o código continua visível na tela.
    }
  }

  return (
    <View style={[styles.waiting, { borderColor: theme.goldDark }]}>
      <ThemedText type="small" themeColor="textSecondary">
        Sala criada
      </ThemedText>
      <View style={styles.codeRow}>
        {(duel.room ?? '').split('').map((ch, i) => (
          <Animated.View key={i} entering={FadeInDown.delay(i * 90).springify()} style={[styles.codeBox, { borderColor: theme.gold, backgroundColor: 'rgba(10,9,25,0.85)' }]}>
            <ThemedText type="subtitle" style={{ fontSize: 30, lineHeight: 38 }}>
              {ch}
            </ThemedText>
          </Animated.View>
        ))}
      </View>
      <ThemedText>Passe esse código para o seu oponente.</ThemedText>
      <View style={styles.status}>
        <Animated.View style={[styles.dot, { backgroundColor: theme.gold }, dot]} />
        <ThemedText type="small" themeColor="textSecondary">
          Aguardando o oponente entrar…
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Baralho: {duel.deckName}
      </ThemedText>
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <PressableScale feedback="thud" onPress={copy} accessibilityRole="button">
          <LinearGradient colors={[theme.goldLight, theme.gold, theme.goldDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.joinBtn}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {copied ? 'Copiado!' : 'Copiar código'}
            </ThemedText>
          </LinearGradient>
        </PressableScale>
        <PressableScale onPress={duel.leave} accessibilityRole="button" style={[styles.joinBtn, { borderWidth: 1, borderColor: theme.goldDark }]}>
          <ThemedText type="smallBold">Cancelar</ThemedText>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  error: { color: '#ff7a7a', padding: Spacing.two, borderRadius: 10, borderWidth: 1, borderColor: '#ff7a7a', backgroundColor: 'rgba(220,70,80,0.12)' },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 20, lineHeight: 26 },
  deck: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: 14, borderWidth: 1 },
  deckOn: { shadowColor: '#E6B422', shadowOpacity: 0.55, shadowRadius: 12, elevation: 6 },
  deckArt: { width: 44, height: 64, borderRadius: 5 },
  check: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  mode: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 16, borderWidth: 1 },
  modeIcon: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,9,25,0.7)' },
  modeTitle: { fontSize: 18, lineHeight: 24 },
  join: { gap: Spacing.two, padding: Spacing.three, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed' },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  code: { width: 110, textAlign: 'center', fontFamily: 'Cinzel_700Bold', fontSize: 22, letterSpacing: 6, borderRadius: 12, borderWidth: 1, paddingVertical: Spacing.two },
  joinBtn: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: Spacing.three, alignItems: 'center' },
  waiting: { alignItems: 'center', gap: Spacing.three, padding: Spacing.four, borderRadius: 20, borderWidth: 1, backgroundColor: 'rgba(21,19,46,0.8)' },
  codeRow: { flexDirection: 'row', gap: Spacing.two },
  codeBox: { width: 56, height: 72, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', shadowColor: '#E6B422', shadowOpacity: 0.4, shadowRadius: 14, elevation: 6 },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5 },
});