import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { useTheme } from '@/hooks/use-theme';

/** Entrar / criar conta. A API valida tudo de novo; aqui só evitamos idas e vindas óbvias. */
export function AuthForm() {
  const { signIn, signUp } = useSession();
  const theme = useTheme();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const register = mode === 'register';

  async function submit() {
    if (busy) return;
    if (!email.trim() || !password || (register && !username.trim())) {
      setError('Preencha todos os campos.');
      return;
    }
    if (register && password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    const message = register
      ? await signUp(email.trim(), username.trim(), password)
      : await signIn(email.trim(), password);
    setBusy(false);
    if (message) setError(message);
  }

  const inputStyle = [styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }];

  return (
    <ThemedView style={styles.form}>
      <ThemedText type="subtitle" style={styles.title}>
        {register ? 'Criar conta' : 'Entrar'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {register
          ? 'Monte decks, publique no marketplace e acompanhe sua coleção.'
          : 'Entre para montar decks, curtir e comentar.'}
      </ThemedText>

      <TextInput
        style={inputStyle}
        placeholder="E-mail"
        placeholderTextColor={theme.textSecondary}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
      />
      {register ? (
        <TextInput
          style={inputStyle}
          placeholder="Nome de usuário (letras, números e _)"
          placeholderTextColor={theme.textSecondary}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="username-new"
        />
      ) : null}
      <TextInput
        style={inputStyle}
        placeholder="Senha"
        placeholderTextColor={theme.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType={register ? 'newPassword' : 'password'}
        autoComplete={register ? 'password-new' : 'password'}
        onSubmitEditing={submit}
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
        style={({ pressed }) => [styles.button, { backgroundColor: theme.text }, (pressed || busy) && styles.pressed]}>
        {busy ? (
          <ActivityIndicator color={theme.background} />
        ) : (
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            {register ? 'Criar conta' : 'Entrar'}
          </ThemedText>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          setMode(register ? 'login' : 'register');
          setError(null);
        }}
        accessibilityRole="button">
        <ThemedText type="linkPrimary">
          {register ? 'Já tenho conta' : 'Ainda não tenho conta'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three, paddingVertical: Spacing.three },
  title: { fontSize: 28, lineHeight: 34 },
  input: { borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16 },
  error: { color: '#D93025' },
  button: { borderRadius: Spacing.three, paddingVertical: Spacing.three, alignItems: 'center' },
  pressed: { opacity: 0.7 },
});
