import { createApiClient } from '@golden-era/api-client';
import { Platform } from 'react-native';

/**
 * URL da API (com o prefixo /v1). Em celular físico `localhost` não funciona:
 * defina EXPO_PUBLIC_API_URL com o IP da máquina, ex.: http://192.168.1.4:8080/v1 (veja .env.example).
 * O emulador Android enxerga a máquina hospedeira em 10.0.2.2.
 */
const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:8080/v1' : 'http://localhost:8080/v1';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? fallback;

export const api = createApiClient({ baseUrl: API_URL });
