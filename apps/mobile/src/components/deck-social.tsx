import type { Schemas } from '@golden-era/api-client';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { usePagedList } from '@/hooks/use-paged-list';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useSession } from '@/lib/session';

type Comment = Schemas['Comment'];

/** Curtida e comentários de um deck público. */
export function DeckSocial({
  deckId,
  likeCount: initialLikes,
  likedByMe: initialLiked,
}: {
  deckId: string;
  likeCount: number;
  likedByMe: boolean;
}) {
  const { signedIn } = useSession();
  const theme = useTheme();
  const [likes, setLikes] = useState({ count: initialLikes, liked: initialLiked });
  const [likeError, setLikeError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const comments = usePagedList<Comment>(
    (cursor) => api.GET('/decks/{deckId}/comments', { params: { path: { deckId }, query: { cursor, limit: 20 } } }),
    [deckId],
  );

  async function toggleLike() {
    const was = likes;
    const liked = !was.liked;
    setLikeError(null);
    setLikes({ liked, count: Math.max(0, was.count + (liked ? 1 : -1)) }); // otimista; volta se falhar
    try {
      const params = { params: { path: { deckId } } };
      const { error, response } = liked ? await api.PUT('/decks/{deckId}/like', params) : await api.DELETE('/decks/{deckId}/like', params);
      if (!response.ok) {
        setLikes(was);
        setLikeError(describeError(error));
      }
    } catch (e) {
      setLikes(was);
      setLikeError(describeError(e));
    }
  }

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const { data, error } = await api.POST('/decks/{deckId}/comments', {
        params: { path: { deckId } },
        body: { body: text },
      });
      if (data) {
        setBody('');
        comments.reload();
      } else {
        setSendError(describeError(error));
      }
    } catch (e) {
      setSendError(describeError(e));
    }
    setSending(false);
  }

  return (
    <ThemedView style={styles.box}>
      <Pressable
        onPress={toggleLike}
        disabled={!signedIn}
        accessibilityRole="button"
        accessibilityState={{ selected: likes.liked }}
        style={({ pressed }) => [styles.like, { backgroundColor: theme.backgroundElement }, pressed && styles.dim]}>
        <ThemedText type="smallBold">
          {likes.liked ? '♥' : '♡'} {likes.count} {likes.count === 1 ? 'curtida' : 'curtidas'}
        </ThemedText>
      </Pressable>
      {!signedIn ? (
        <ThemedText type="small" themeColor="textSecondary">
          Entre na sua conta (aba Perfil) para curtir e comentar.
        </ThemedText>
      ) : null}
      {likeError ? (
        <ThemedText type="small" style={styles.error}>
          {likeError}
        </ThemedText>
      ) : null}

      <ThemedText type="smallBold">Comentários</ThemedText>
      {comments.items.map((c) => (
        <ThemedView key={c.id} type="backgroundElement" style={styles.comment}>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/user/[username]', params: { username: c.author.username } })}>
            <ThemedText type="smallBold">@{c.author.username}</ThemedText>
          </Pressable>
          <ThemedText type="small">{c.body}</ThemedText>
        </ThemedView>
      ))}
      {comments.items.length === 0 ? (
        comments.loading ? (
          <StateMessage loading />
        ) : comments.error ? (
          <StateMessage message={comments.error} onRetry={comments.reload} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Ainda não há comentários.
          </ThemedText>
        )
      ) : comments.hasMore ? (
        <Pressable onPress={comments.loadMore} accessibilityRole="button">
          <ThemedText type="linkPrimary">Carregar mais</ThemedText>
        </Pressable>
      ) : null}

      {signedIn ? (
        <ThemedView style={styles.form}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Escreva um comentário"
            placeholderTextColor={theme.textSecondary}
            maxLength={1000}
            multiline
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          />
          {sendError ? (
            <ThemedText type="small" style={styles.error} accessibilityRole="alert">
              {sendError}
            </ThemedText>
          ) : null}
          <Pressable
            onPress={send}
            disabled={sending || !body.trim()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.send,
              { backgroundColor: theme.text },
              (pressed || sending || !body.trim()) && styles.dim,
            ]}>
            {sending ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                Comentar
              </ThemedText>
            )}
          </Pressable>
        </ThemedView>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  like: { alignSelf: 'flex-start', borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  comment: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  form: { gap: Spacing.two },
  input: { minHeight: 64, borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16, textAlignVertical: 'top' },
  send: { borderRadius: Spacing.three, paddingVertical: Spacing.three, alignItems: 'center' },
  error: { color: '#D93025' },
  dim: { opacity: 0.5 },
});
