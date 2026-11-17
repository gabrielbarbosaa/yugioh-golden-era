import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { CollectionProvider } from '@/lib/collection';
import { SessionProvider, useSession } from '@/lib/session';

// A coleção é recriada a cada login/logout (key), então nunca mostra dados de outra conta.
function CollectionGate({ children }: { children: React.ReactNode }) {
  const { signedIn } = useSession();
  return (
    <CollectionProvider key={String(signedIn)} enabled={signedIn === true}>
      {children}
    </CollectionProvider>
  );
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <CollectionGate>
          <AnimatedSplashOverlay />
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="card/[id]" options={{ title: 'Carta', presentation: 'modal' }} />
            <Stack.Screen name="deck/[id]" options={{ title: 'Deck' }} />
            <Stack.Screen name="import" options={{ title: 'Importar deck' }} />
            <Stack.Screen name="user/[username]" options={{ title: 'Perfil' }} />
          </Stack>
        </CollectionGate>
      </SessionProvider>
    </ThemeProvider>
  );
}
