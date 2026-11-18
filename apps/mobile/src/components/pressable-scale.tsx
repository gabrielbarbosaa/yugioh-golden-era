import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Botão que "afunda" com uma mola ao toque e dá uma vibração leve. Substitui o Pressable simples nas ações principais. */
export function PressableScale({
  scaleTo = 0.96,
  feedback = 'tap',
  style,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style'> & { scaleTo?: number; feedback?: 'tap' | 'thud' | 'select' | 'none'; style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animated]}
      onPressIn={(e: GestureResponderEvent) => {
        scale.set(withSpring(scaleTo, { damping: 16, stiffness: 320 }));
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        scale.set(withSpring(1, { damping: 12, stiffness: 260 }));
        onPressOut?.(e);
      }}
      onPress={(e: GestureResponderEvent) => {
        if (feedback === 'tap') haptic.tap();
        else if (feedback === 'thud') haptic.thud();
        else if (feedback === 'select') haptic.select();
        onPress?.(e);
      }}
    />
  );
}