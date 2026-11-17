import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useSession } from '@/lib/session';

/** Importa um deck colando o conteúdo de um arquivo .ydk; vira um rascunho privado. */
export default function ImportScreen() {
  const { signedIn } = useSession();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (!text.trim()) {
      setError('Cole o conteúdo do arquivo .ydk.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: problem } = await api.POST('/decks/import', {
        body: text,
        headers: { 'Content-Type': 'text/plain' },
        bodySerializer: (body) => body as string, // o corpo é texto puro, não JSON
      });
      if (data) {
        router.replace({ pathname: '/deck/[id]', params: { id: data.id } });
        return;
      }
      setError(describeError(problem));
    } catch (e) {
      setError(describeError(e));
    }
    setBusy(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {signedIn === false ? (
          <StateMessage message="Entre na sua conta (aba Perfil) para importar decks." />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <ThemedText type="small" themeColor="textSecondary">
              Cole abaixo o conteúdo de um arquivo .ydk (YGOPro/EDOPro). O deck é criado como privado, com o nome
              “Deck importado”; você pode renomear e publicar depois.
            </ThemedText>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={'#created by ...\n#main\n46986414\n...\n#extra\n!side'}
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            />
            {error ? (
              <ThemedText type="small" style={styles.error} accessibilityRole="alert">
                {error}
              </ThemedText>
            ) : null}
            <Pressable
              onPress={submit}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, { backgroundColor: theme.gold }, (pressed || busy) && styles.dim]}>
              {busy ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  Importar deck
                </ThemedText>
              )}
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  content: { gap: Spacing.three, paddingBottom: Spacing.six },
  input: {
    minHeight: 220,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    fontSize: 14,
    fontFamily: 'monospace',
    textAlignVertical: 'top',
  },
  button: { borderRadius: Spacing.three, paddingVertical: Spacing.three, alignItems: 'center' },
  error: { color: '#D93025' },
  dim: { opacity: 0.5 },
});
