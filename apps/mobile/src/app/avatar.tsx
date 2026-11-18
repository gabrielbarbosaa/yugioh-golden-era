import type { Card } from '@golden-era/api-client';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CARD_ASPECT } from '@/components/card-tile';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagedList } from '@/hooks/use-paged-list';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';

const THUMB = 52;

/** Escolhe a carta da foto de perfil: busca por nome e toque na carta; "Remover foto" volta à inicial. */
export default function AvatarScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { items, loading, error: loadError, loadMore, reload } = usePagedList<Card>(
    (cursor) => api.GET('/cards', { params: { query: { q: q || undefined, cursor, limit: 30 } } }),
    [q],
  );

  async function choose(cardId: number) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const { data, error: problem } = await api.PATCH('/me', { body: { avatarCardId: cardId } });
      if (data) {
        router.back();
        return;
      }
      setError(describeError(problem));
    } catch (e) {
      setError(describeError(e));
    }
    setSaving(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ThemedView style={styles.header}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar a carta da sua foto de perfil"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <Pressable onPress={() => choose(0)} disabled={saving} accessibilityRole="button">
            <ThemedText type="linkPrimary">Remover foto</ThemedText>
          </Pressable>
        </ThemedView>
        {error ? (
          <ThemedText type="small" style={{ color: '#ff6b6b' }} accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}
        <FlatList
          data={items}
          keyExtractor={(card) => String(card.id)}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => choose(item.id)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`Usar ${item.name} como foto de perfil`}
              style={({ pressed }) => (pressed || saving) && styles.dim}>
              <ThemedView type="backgroundElement" style={styles.row}>
                <Image
                  source={{ uri: item.imageSmallUrl }}
                  style={{ width: THUMB, height: THUMB / CARD_ASPECT }}
                  contentFit="cover"
                  recyclingKey={String(item.id)}
                />
                <ThemedView type="backgroundElement" style={styles.info}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {item.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {item.type}
                  </ThemedText>
                </ThemedView>
              </ThemedView>
            </Pressable>
          )}
          ListEmptyComponent={
            loading ? <StateMessage loading /> : loadError ? <StateMessage message={loadError} onRetry={reload} /> : <StateMessage message="Nenhuma carta encontrada." />
          }
          ListFooterComponent={items.length > 0 && loading ? <StateMessage loading /> : undefined}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.three, gap: Spacing.two, paddingTop: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  search: { flex: 1, borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16 },
  list: { gap: Spacing.two, paddingBottom: Spacing.five },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Spacing.three, padding: Spacing.two },
  info: { flex: 1, gap: Spacing.half },
  dim: { opacity: 0.5 },
});