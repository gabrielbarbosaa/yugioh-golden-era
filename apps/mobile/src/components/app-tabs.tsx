import { NativeTabs } from 'expo-router/native-tabs';
import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const colors = Colors.dark;

  return (
    <NativeTabs
      backgroundColor={colors.backgroundElement}
      indicatorColor={colors.backgroundSelected}
      labelStyle={{ default: { color: colors.textSecondary }, selected: { color: colors.goldLight } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Cartas</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="decks">
        <NativeTabs.Trigger.Label>Decks</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="banlist">
        <NativeTabs.Trigger.Label>Lista</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="collection">
        <NativeTabs.Trigger.Label>Coleção</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="duel">
        <NativeTabs.Trigger.Label>Duelo</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
