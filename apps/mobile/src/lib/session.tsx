import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { api } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { loadTokens, subscribeTokens, tokenStore } from '@/lib/token-store';

type Session = {
  /** `null` enquanto a sessão salva ainda está sendo lida. */
  signedIn: boolean | null;
  /** Cada função devolve `null` se deu certo, ou a mensagem de erro. */
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, username: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    loadTokens().then((tokens) => {
      if (active) setSignedIn(tokens !== null);
    });
    const unsubscribe = subscribeTokens((tokens) => setSignedIn(tokens !== null));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const session: Session = {
    signedIn,
    async signIn(email, password) {
      try {
        const { data, error } = await api.POST('/auth/login', { body: { email, password } });
        if (!data) return describeError(error);
        await tokenStore.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return null;
      } catch (e) {
        return describeError(e);
      }
    },
    async signUp(email, username, password) {
      try {
        const { data, error } = await api.POST('/auth/register', { body: { email, username, password } });
        if (!data) return describeError(error);
        await tokenStore.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return null;
      } catch (e) {
        return describeError(e);
      }
    },
    async signOut() {
      const refreshToken = await tokenStore.getRefreshToken();
      try {
        // Revoga o refresh token no servidor; se a rede falhar, sai localmente do mesmo jeito.
        if (refreshToken) await api.POST('/auth/logout', { body: { refreshToken } });
      } catch {}
      await tokenStore.setTokens(null);
    },
  };

  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error('useSession precisa estar dentro de <SessionProvider>');
  return session;
}
