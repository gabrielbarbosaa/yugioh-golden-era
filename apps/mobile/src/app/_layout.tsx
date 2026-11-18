import { Cinzel_600SemiBold, Cinzel_700Bold, useFonts } from '@expo-google-fonts/cinzel';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors, DisplayFont } from '@/constants/theme';
import { CollectionProvider } from '@/lib/collection';
import { SessionProvider, useSession } from '@/lib/session';

const palette = Colors.dark;

// Tema de navegação no estilo "Millennium": fundo meia-noite, cabeçalhos e destaques em ouro.
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: palette.gold,
    background: palette.background,
    card: palette.background,
    text: palette.text,
    border: palette.border,
  },
};

const headerOptions = {
  headerStyle: { backgroundColor: palette.background },
  headerTintColor: palette.goldLight,
  headerTitleStyle: { fontFamily: DisplayFont.bold },
  headerShadowVisible: false,
} as const;

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
  // A fonte dos títulos vem empacotada (@expo-google-fonts/cinzel); a splash fica até ela carregar.
  const [fontsLoaded] = useFonts({ Cinzel_600SemiBold, Cinzel_700Bold });
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <SessionProvider>
        <CollectionGate>
          <AnimatedSplashOverlay />
          <Stack screenOptions={headerOptions}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="card/[id]" options={{ title: 'Carta', presentation: 'modal' }} />
            <Stack.Screen name="deck/[id]" options={{ title: 'Deck' }} />
            <Stack.Screen name="import" options={{ title: 'Importar deck' }} />
            <Stack.Screen name="anime-decks" options={{ title: 'Decks do anime' }} />
            <Stack.Screen name="avatar" options={{ title: 'Foto de perfil' }} />
            <Stack.Screen name="people" options={{ title: 'Jogadores' }} />
            <Stack.Screen name="user/[username]" options={{ title: 'Perfil' }} />
          </Stack>
        </CollectionGate>
      </SessionProvider>
    </ThemeProvider>
  );
}
