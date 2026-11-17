import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';

/** Exporta a versão salva do deck em .ydk (formato do YGOPro/EDOPro) e permite copiar o texto. */
export function YdkExport({ deckId }: { deckId: string }) {
  const theme = useTheme();
  const [state, setState] = useState<{ text?: string; error?: string; loading?: boolean; copied?: boolean }>({});

  async function load() {
    setState({ loading: true });
    try {
      const { data, error } = await api.GET('/decks/{deckId}/export', {
        params: { path: { deckId } },
        parseAs: 'text',
      });
      setState(typeof data === 'string' ? { text: data } : { error: describeError(error) });
    } catch (e) {
      setState({ error: describeError(e) });
    }
  }

  async function copy() {
    if (!state.text) return;
    try {
      await Clipboard.setStringAsync(state.text);
      setState((s) => ({ ...s, copied: true }));
    } catch {
      setState((s) => ({ ...s, error: 'Não foi possível copiar. Selecione o texto e copie manualmente.' }));
    }
  }

  return (
    <ThemedView style={styles.box}>
      <Pressable onPress={load} disabled={state.loading} accessibilityRole="button">
        <ThemedText type="linkPrimary">Exportar .ydk (versão salva)</ThemedText>
      </Pressable>
      {state.loading ? <ActivityIndicator /> : null}
      {state.error ? (
        <ThemedText type="small" style={styles.error} accessibilityRole="alert">
          {state.error}
        </ThemedText>
      ) : null}
      {state.text ? (
        <>
          <TextInput
            value={state.text}
            multiline
            editable={false}
            selectTextOnFocus
            accessibilityLabel="Conteúdo do arquivo YDK"
            style={[styles.text, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          />
          <Pressable onPress={copy} accessibilityRole="button">
            <ThemedText type="linkPrimary">{state.copied ? 'Copiado!' : 'Copiar'}</ThemedText>
          </Pressable>
        </>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  text: { borderRadius: Spacing.three, padding: Spacing.three, fontSize: 13, fontFamily: 'monospace', maxHeight: 240 },
  error: { color: '#D93025' },
});
