import type { TokenStore } from '@golden-era/api-client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

type Tokens = { accessToken: string; refreshToken: string };

const KEY = 'golden-era.session';

// No celular os tokens ficam no Keychain/Keystore (SecureStore); na web, que é só prévia, em localStorage.
async function readStorage(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function writeStorage(value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(KEY);
      else globalThis.localStorage?.setItem(KEY, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, value);
  } catch {
    // Sem armazenamento a sessão vale só até fechar o app; não é motivo para quebrar o login.
  }
}

let cache: Tokens | null = null;
let loading: Promise<Tokens | null> | null = null;
const listeners = new Set<(tokens: Tokens | null) => void>();

/** Lê a sessão salva (uma vez) e a mantém em memória. */
export function loadTokens(): Promise<Tokens | null> {
  loading ??= readStorage().then((raw) => {
    try {
      cache = raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      cache = null;
    }
    return cache;
  });
  return loading;
}

/** Avisa quando a sessão muda (login, refresh, logout ou refresh recusado). */
export function subscribeTokens(listener: (tokens: Tokens | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const tokenStore: TokenStore = {
  async getAccessToken() {
    await loadTokens();
    return cache?.accessToken ?? null; // lê `cache`, não o retorno de loadTokens (que é só o valor inicial)
  },
  async getRefreshToken() {
    await loadTokens();
    return cache?.refreshToken ?? null;
  },
  async setTokens(tokens) {
    await loadTokens();
    cache = tokens;
    listeners.forEach((listener) => listener(tokens));
    await writeStorage(tokens ? JSON.stringify(tokens) : null);
  },
};
