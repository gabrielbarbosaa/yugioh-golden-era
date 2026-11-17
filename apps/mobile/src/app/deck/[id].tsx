import type { Card, Deck, Schemas } from '@golden-era/api-client';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CARD_ASPECT } from '@/components/card-tile';
import { CardPicker } from '@/components/card-picker';
import { DeckSocial } from '@/components/deck-social';
import { StateMessage } from '@/components/state-message';
import { YdkExport } from '@/components/ydk-export';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useCards } from '@/hooks/use-cards';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useCollection } from '@/lib/collection';
import {
  addCard,
  allCardIds,
  banlistLabel,
  canAdd,
  copiesOf,
  emptyCards,
  LIMITS,
  MIN_MAIN_PUBLIC,
  removeCard,
  ZONE_LABEL,
  ZONES,
  zoneCount,
  type DeckCards,
  type Zone,
} from '@/lib/deck-rules';
import { describeError } from '@/lib/errors';
import { useSession } from '@/lib/session';

type Visibility = Schemas['DeckVisibility'];
type Draft = { name: string; description: string; visibility: Visibility; cards: DeckCards };

const THUMB = 40;

const emptyDraft: Draft = { name: '', description: '', visibility: 'private', cards: emptyCards() };

function CardRow({
  cardId,
  quantity,
  card,
  owned,
  needed,
  onAdd,
  onRemove,
}: {
  cardId: number;
  quantity: number;
  card?: Card;
  /** Cópias na coleção do jogador; `undefined` sem sessão ou enquanto a coleção carrega. */
  owned?: number;
  /** Total de cópias da carta no deck (somando as zonas), para comparar com `owned`. */
  needed: number;
  onAdd?: () => void;
  onRemove?: () => void;
}) {
  const short = owned !== undefined && needed > owned;
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      {card ? (
        <Image
          source={{ uri: card.imageSmallUrl }}
          style={{ width: THUMB, height: THUMB / CARD_ASPECT }}
          contentFit="cover"
          recyclingKey={String(cardId)}
        />
      ) : (
        <ThemedView type="backgroundSelected" style={{ width: THUMB, height: THUMB / CARD_ASPECT }} />
      )}
      <Pressable
        style={styles.rowName}
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(cardId) } })}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {card?.name ?? `Carta ${cardId}`}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {card?.type ?? ''}
          {card && banlistLabel(card) ? ` · ${banlistLabel(card)}` : ''}
          {owned !== undefined ? (
            <ThemedText type="small" style={short ? styles.error : undefined} themeColor={short ? undefined : 'textSecondary'}>
              {card ? ' · ' : ''}
              {short ? `faltam ${needed - owned} (tenho ${owned})` : `tenho ${owned}`}
            </ThemedText>
          ) : null}
        </ThemedText>
      </Pressable>
      {onRemove ? <StepButton label="−" a11y="Remover uma cópia" onPress={onRemove} /> : null}
      <ThemedText type="smallBold" style={styles.qty}>
        {quantity}
      </ThemedText>
      {onAdd ? <StepButton label="+" a11y="Adicionar uma cópia" onPress={onAdd} /> : null}
    </ThemedView>
  );
}

function StepButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.step, { backgroundColor: theme.backgroundSelected }, pressed && styles.dim]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

type Social = { likeCount: number; likedByMe: boolean };

function Editor({
  deckId: initialId,
  initial,
  readOnly,
  owner,
  social,
}: {
  deckId?: string;
  initial: Draft;
  readOnly: boolean;
  owner?: string;
  /** Presente só para decks já publicados: habilita curtidas e comentários. */
  social?: Social;
}) {
  const theme = useTheme();
  const { signedIn } = useSession();
  const [deckId, setDeckId] = useState(initialId);
  const [draft, setDraft] = useState(initial);
  const [known, setKnown] = useState<Record<number, Card>>({}); // cartas escolhidas na busca (já com detalhes)
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const collection = useCollection();
  const owned = collection.status === 'ready' ? collection.quantities : null;
  const missing = owned
    ? allCardIds(draft.cards).reduce((sum, id) => sum + Math.max(0, copiesOf(draft.cards, id) - (owned[id] ?? 0)), 0)
    : 0;
  const fetched = useCards(allCardIds(draft.cards));
  const cardOf = (id: number): Card | undefined => known[id] ?? fetched[id];
  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setMessage(null);
  };

  async function save() {
    if (saving) return;
    if (!draft.name.trim()) {
      setMessage({ text: 'Dê um nome ao deck.', ok: false });
      return;
    }
    setSaving(true);
    setMessage(null);
    const body = {
      name: draft.name.trim(),
      description: draft.description,
      visibility: draft.visibility,
      cards: draft.cards,
    };
    try {
      const { data, error } = deckId
        ? await api.PUT('/decks/{deckId}', { params: { path: { deckId } }, body })
        : await api.POST('/decks', { body });
      if (!data) {
        setMessage({ text: describeError(error), ok: false });
      } else {
        setDeckId(data.id);
        setMessage({ text: 'Deck salvo.', ok: true });
      }
    } catch (e) {
      setMessage({ text: describeError(e), ok: false });
    }
    setSaving(false);
  }

  // Decks públicos de outras pessoas: cria uma cópia privada na conta do jogador e abre o editor.
  async function copyToMine() {
    if (!deckId || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const { data, error } = await api.POST('/decks/{deckId}/copy', { params: { path: { deckId } } });
      if (data) {
        router.replace({ pathname: '/deck/[id]', params: { id: data.id } });
        return;
      }
      setMessage({ text: describeError(error), ok: false });
    } catch (e) {
      setMessage({ text: describeError(e), ok: false });
    }
    setSaving(false);
  }

  async function remove() {
    if (!deckId || saving) return;
    setSaving(true);
    try {
      const { error, response } = await api.DELETE('/decks/{deckId}', { params: { path: { deckId } } });
      if (response.ok) {
        router.back();
        return;
      }
      setMessage({ text: describeError(error), ok: false });
    } catch (e) {
      setMessage({ text: describeError(e), ok: false });
    }
    setSaving(false);
  }

  if (picking) {
    return (
      <CardPicker
        cards={draft.cards}
        onAdd={(card, zone) => {
          setKnown((k) => ({ ...k, [card.id]: card }));
          edit({ cards: addCard(draft.cards, zone, card.id) });
        }}
        onClose={() => setPicking(false)}
      />
    );
  }

  const main = zoneCount(draft.cards, 'main');
  const inputStyle = [styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }];

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {readOnly ? (
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.title}>
            {draft.name}
          </ThemedText>
          {owner ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/user/[username]', params: { username: owner } })}>
              <ThemedText type="small" themeColor="textSecondary">
                por @{owner}
              </ThemedText>
            </Pressable>
          ) : null}
          {draft.description ? <ThemedText>{draft.description}</ThemedText> : null}
        </ThemedView>
      ) : (
        <ThemedView style={styles.section}>
          <TextInput
            style={inputStyle}
            value={draft.name}
            onChangeText={(name) => edit({ name })}
            placeholder="Nome do deck"
            placeholderTextColor={theme.textSecondary}
            maxLength={80}
          />
          <TextInput
            style={[...inputStyle, styles.multiline]}
            value={draft.description}
            onChangeText={(description) => edit({ description })}
            placeholder="Descrição (opcional)"
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={2000}
          />
          <ThemedView style={styles.toggle}>
            {(['private', 'public'] as const).map((v) => (
              <Pressable
                key={v}
                onPress={() => edit({ visibility: v })}
                accessibilityRole="button"
                accessibilityState={{ selected: draft.visibility === v }}
                style={styles.toggleItem}>
                <ThemedView
                  type={draft.visibility === v ? 'backgroundSelected' : 'backgroundElement'}
                  style={styles.toggleBox}>
                  <ThemedText type="smallBold" themeColor={draft.visibility === v ? 'text' : 'textSecondary'}>
                    {v === 'private' ? 'Privado' : 'Público'}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            ))}
          </ThemedView>
          {draft.visibility === 'public' && main < MIN_MAIN_PUBLIC ? (
            <ThemedText type="small" themeColor="textSecondary">
              Para publicar, o deck principal precisa ter pelo menos {MIN_MAIN_PUBLIC} cartas (tem {main}).
            </ThemedText>
          ) : null}
        </ThemedView>
      )}

      {owned && allCardIds(draft.cards).length > 0 ? (
        <ThemedText type="small" style={missing > 0 ? styles.error : styles.ok}>
          {missing > 0
            ? `Faltam ${missing} ${missing === 1 ? 'cópia' : 'cópias'} na sua coleção para montar este deck.`
            : 'Você tem todas as cartas deste deck.'}
        </ThemedText>
      ) : null}

      {ZONES.map((zone: Zone) => (
        <ThemedView key={zone} style={styles.section}>
          <ThemedText type="smallBold">
            {ZONE_LABEL[zone]} · {zoneCount(draft.cards, zone)}/{LIMITS[zone]}
          </ThemedText>
          {draft.cards[zone].length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nenhuma carta.
            </ThemedText>
          ) : (
            draft.cards[zone].map((e) => (
              <CardRow
                key={e.cardId}
                cardId={e.cardId}
                quantity={e.quantity}
                card={cardOf(e.cardId)}
                owned={owned ? (owned[e.cardId] ?? 0) : undefined}
                needed={copiesOf(draft.cards, e.cardId)}
                onRemove={readOnly ? undefined : () => edit({ cards: removeCard(draft.cards, zone, e.cardId) })}
                onAdd={
                  readOnly || !cardOf(e.cardId)
                    ? undefined
                    : () => {
                        if (canAdd(draft.cards, zone, cardOf(e.cardId)!) === null)
                          edit({ cards: addCard(draft.cards, zone, e.cardId) });
                      }
                }
              />
            ))
          )}
        </ThemedView>
      ))}

      {readOnly && deckId && signedIn ? (
        <ThemedView style={styles.section}>
          <Pressable
            onPress={copyToMine}
            disabled={saving}
            accessibilityRole="button"
            style={({ pressed }) => [styles.save, { backgroundColor: theme.gold }, (pressed || saving) && styles.dim]}>
            {saving ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                Copiar para minha conta
              </ThemedText>
            )}
          </Pressable>
          {message ? (
            <ThemedText type="small" style={styles.error} accessibilityRole="alert">
              {message.text}
            </ThemedText>
          ) : null}
        </ThemedView>
      ) : null}

      {deckId ? <YdkExport deckId={deckId} /> : null}

      {social && deckId ? (
        <DeckSocial deckId={deckId} likeCount={social.likeCount} likedByMe={social.likedByMe} />
      ) : null}

      {readOnly ? null : (
        <ThemedView style={styles.section}>
          {message ? (
            <ThemedText type="small" style={message.ok ? styles.ok : styles.error} accessibilityRole="alert">
              {message.text}
            </ThemedText>
          ) : null}
          <Pressable onPress={() => setPicking(true)} accessibilityRole="button">
            <ThemedText type="linkPrimary">+ Adicionar cartas</ThemedText>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={saving}
            accessibilityRole="button"
            style={({ pressed }) => [styles.save, { backgroundColor: theme.gold }, (pressed || saving) && styles.dim]}>
            {saving ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                Salvar deck
              </ThemedText>
            )}
          </Pressable>
          {deckId ? (
            <Pressable onPress={remove} accessibilityRole="button">
              <ThemedText type="small" style={styles.error}>
                Excluir deck
              </ThemedText>
            </Pressable>
          ) : null}
        </ThemedView>
      )}
    </ScrollView>
  );
}

function toDraft(deck: Deck): Draft {
  return { name: deck.name, description: deck.description, visibility: deck.visibility, cards: deck.cards };
}

export default function DeckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { signedIn } = useSession();
  const isNew = id === 'new';
  const [state, setState] = useState<{ id: string; deck?: Deck; mine?: boolean; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (isNew || signedIn === null) return;
    let active = true;
    void (async () => {
      try {
        const [deckRes, meRes] = await Promise.all([
          api.GET('/decks/{deckId}', { params: { path: { deckId: id } } }),
          signedIn ? api.GET('/me') : Promise.resolve(null),
        ]);
        if (!active) return;
        setState(
          deckRes.data
            ? { id, deck: deckRes.data, mine: !!meRes?.data && meRes.data.id === deckRes.data.owner.id }
            : { id, error: describeError(deckRes.error) },
        );
      } catch (e) {
        if (active) setState({ id, error: describeError(e) });
      }
    })();
    return () => {
      active = false;
    };
  }, [id, isNew, signedIn, attempt]);

  let body;
  if (isNew) {
    body = signedIn === false ? (
      <StateMessage message="Entre na sua conta (aba Perfil) para criar decks." />
    ) : signedIn === null ? (
      <StateMessage loading />
    ) : (
      <Editor initial={emptyDraft} readOnly={false} />
    );
  } else if (!state || state.id !== id) {
    body = <StateMessage loading />;
  } else if (!state.deck) {
    body = <StateMessage message={state.error} onRetry={() => { setState(null); setAttempt((n) => n + 1); }} />;
  } else {
    body = (
      <Editor
        deckId={state.deck.id}
        initial={toDraft(state.deck)}
        social={
          state.deck.visibility === 'public'
            ? { likeCount: state.deck.likeCount, likedByMe: state.deck.likedByMe ?? false }
            : undefined
        }
        readOnly={!state.mine}
        owner={state.deck.owner.username}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: isNew ? 'Novo deck' : 'Deck' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {body}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  content: { gap: Spacing.three, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  title: { fontSize: 28, lineHeight: 34 },
  input: { borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  toggle: { flexDirection: 'row', gap: Spacing.two },
  toggleItem: { flex: 1 },
  toggleBox: { borderRadius: Spacing.three, paddingVertical: Spacing.two, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Spacing.three, padding: Spacing.two },
  rowName: { flex: 1, gap: Spacing.half },
  qty: { minWidth: 18, textAlign: 'center' },
  step: { width: 32, height: 32, borderRadius: Spacing.two, alignItems: 'center', justifyContent: 'center' },
  save: { borderRadius: Spacing.three, paddingVertical: Spacing.three, alignItems: 'center' },
  ok: { color: '#1E8E3E' },
  error: { color: '#D93025' },
  dim: { opacity: 0.5 },
});
