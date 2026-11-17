import type { Card } from '@golden-era/api-client';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CARD_ASPECT } from '@/components/card-tile';
import { QuantityStepper } from '@/components/quantity-stepper';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useCards } from '@/hooks/use-cards';
import { useCollection } from '@/lib/collection';
import { useSession } from '@/lib/session';

const THUMB = 44;

function Row({ cardId, card, quantity, onChange }: { cardId: number; card?: Card; quantity: number; onChange: (q: number) => void }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      {card ? (
        <Image source={{ uri: card.imageSmallUrl }} style={{ width: THUMB, height: THUMB / CARD_ASPECT }} contentFit="cover" recyclingKey={String(cardId)} />
      ) : (
        <ThemedView type="backgroundSelected" style={{ width: THUMB, height: THUMB / CARD_ASPECT }} />
      )}
      <Pressable
        style={styles.name}
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(cardId) } })}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {card?.name ?? `Carta ${cardId}`}
        </ThemedText>
        {card ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {card.type}
          </ThemedText>
        ) : null}
      </Pressable>
      <QuantityStepper value={quantity} onChange={onChange} />
    </ThemedView>
  );
}

function Owned() {
  const collection = useCollection();
  const ids = Object.keys(collection.quantities).map(Number);
  const cards = useCards(ids);

  if (collection.status === 'loading') return <StateMessage loading />;
  if (collection.status === 'error') return <StateMessage message={collection.error ?? undefined} onRetry={collection.retry} />;

  // Com todos os nomes carregados ordenamos por nome; antes disso, pelo passcode (ordem estável).
  const sorted = [...ids].sort((a, b) =>
    cards[a] && cards[b] ? cards[a].name.localeCompare(cards[b].name) : a - b,
  );
  const copies = ids.reduce((sum, id) => sum + (collection.quantities[id] ?? 0), 0);

  return (
    <FlatList
      data={sorted}
      keyExtractor={(id) => String(id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <ThemedView style={styles.summary}>
          <ThemedText type="small" themeColor="textSecondary">
            {ids.length} {ids.length === 1 ? 'carta distinta' : 'cartas distintas'} · {copies} {copies === 1 ? 'cópia' : 'cópias'}
            {collection.saving ? ' · salvando…' : ''}
          </ThemedText>
          {collection.error ? <StateMessage message={collection.error} onRetry={collection.retry} /> : null}
        </ThemedView>
      }
      renderItem={({ item }) => (
        <Row cardId={item} card={cards[item]} quantity={collection.quantities[item] ?? 0} onChange={(q) => collection.setQuantity(item, q)} />
      )}
      ListEmptyComponent={
        <StateMessage message="Sua coleção está vazia. Abra uma carta na aba Cartas e toque em + para registrar suas cópias." />
      }
    />
  );
}

export default function CollectionScreen() {
  const { signedIn } = useSession();
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="subtitle" style={styles.title}>
          Coleção
        </ThemedText>
        {signedIn === null ? (
          <StateMessage loading />
        ) : signedIn ? (
          <Owned />
        ) : (
          <StateMessage message="Entre na sua conta (aba Perfil) para registrar suas cartas." />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: TopTabInset,
    gap: Spacing.two,
  },
  title: { fontSize: 28, lineHeight: 34, paddingTop: Spacing.two },
  summary: { paddingBottom: Spacing.two },
  list: { gap: Spacing.two, paddingBottom: BottomTabInset + Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Spacing.three, padding: Spacing.two },
  name: { flex: 1, gap: Spacing.half },
});
