import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, type PressableProps, ScrollView, View, StyleSheet, useWindowDimensions } from 'react-native';

import { DisplayFont, MaxContentWidth, Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Cartas</TabButton>
          </TabTrigger>
          <TabTrigger name="decks" href="/decks" asChild>
            <TabButton>Decks</TabButton>
          </TabTrigger>
          <TabTrigger name="banlist" href="/banlist" asChild>
            <TabButton>Lista da era</TabButton>
          </TabTrigger>
          <TabTrigger name="collection" href="/collection" asChild>
            <TabButton>Coleção</TabButton>
          </TabTrigger>
          <TabTrigger name="duel" href="/duel" asChild>
            <TabButton>Duelo</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton>Perfil</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    // O tipo de `ref` do TabTrigger não casa com o do Pressable, embora funcione em runtime.
    <Pressable {...(props as unknown as PressableProps)} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={[styles.tabButtonView, isFocused && styles.tabButtonFocused]}>
        <ThemedText type="smallBold" themeColor={isFocused ? 'goldLight' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const { width } = useWindowDimensions();
  const compact = width < 720; // no celular a marca some e as abas rolam para o lado
  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={[styles.innerContainer, compact && styles.innerCompact]}>
        {compact ? null : (
          <ThemedText type="smallBold" themeColor="goldLight" style={styles.brandText}>
            GOLDEN ERA
          </ThemedText>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {props.children}
        </ScrollView>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    borderWidth: 1,
    borderColor: '#3A3220',
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  innerCompact: { paddingHorizontal: Spacing.two },
  tabsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  brandText: {
    marginRight: 'auto',
    fontFamily: DisplayFont.bold,
    fontSize: 16,
    letterSpacing: 3,
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabButtonFocused: {
    borderColor: '#A87B0A',
  },
});
