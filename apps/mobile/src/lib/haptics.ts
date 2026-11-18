import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const run = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web') return; // sem vibração na prévia web
  fn().catch(() => {});
};

/** Pequenas vibrações de resposta ao toque; não fazem nada na web nem em aparelhos sem suporte. */
export const haptic = {
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  thud: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  select: () => run(() => Haptics.selectionAsync()),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};