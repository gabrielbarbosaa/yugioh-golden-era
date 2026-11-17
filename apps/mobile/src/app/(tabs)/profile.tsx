import type { Profile } from '@golden-era/api-client';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthForm } from '@/components/auth-form';
import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useSession } from '@/lib/session';

// Só é montado com a sessão aberta, então o estado some junto com o logout (nada vaza entre contas).
function MyProfile() {
  const { signOut } = useSession();
  const [state, setState] = useState<{ profile?: Profile; error?: string }>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .GET('/me')
      .then(({ data, error }) => {
        if (active) setState(data ? { profile: data } : { error: describeError(error) });
      })
      .catch((e) => {
        if (active) setState({ error: describeError(e) });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const { profile, error } = state;
  if (!profile) {
    return error ? (
      <StateMessage
        message={error}
        onRetry={() => {
          setState({});
          setAttempt((n) => n + 1);
        }}
      />
    ) : (
      <StateMessage loading />
    );
  }

  return (
    <ThemedView style={styles.profile}>
      <ThemedText type="subtitle" style={styles.title}>
        @{profile.username}
      </ThemedText>
      {profile.bio ? <ThemedText>{profile.bio}</ThemedText> : null}
      <ThemedView type="backgroundElement" style={styles.stats}>
        <Stat label="Decks" value={profile.deckCount} />
        <Stat label="Seguidores" value={profile.followerCount} />
        <Stat label="Seguindo" value={profile.followingCount} />
      </ThemedView>
      <Pressable onPress={signOut} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="linkPrimary">Sair</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="smallBold">{value ?? 0}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

export default function ProfileScreen() {
  const { signedIn } = useSession();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {signedIn === null ? <StateMessage loading /> : signedIn ? <MyProfile /> : <AuthForm />}
        </ScrollView>
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
  },
  content: { paddingTop: Spacing.two, paddingBottom: BottomTabInset + Spacing.four },
  profile: { gap: Spacing.three, paddingTop: Spacing.two },
  title: { fontSize: 28, lineHeight: 34 },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, alignItems: 'center', borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
  pressed: { opacity: 0.7 },
});
