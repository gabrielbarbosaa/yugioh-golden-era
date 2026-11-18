import { useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Campo de busca com lupa e um brilho dourado que acende no foco. */
export function SearchInput(props: TextInputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const glow = useSharedValue(0);
  const ring = useAnimatedStyle(() => ({ shadowOpacity: glow.get() * 0.7, borderColor: glow.get() > 0.5 ? '#E6B422' : '#3A3220' }));

  return (
    <Animated.View style={[styles.wrap, { backgroundColor: theme.backgroundElement, shadowColor: theme.gold }, ring, focused && styles.elev]}>
      <ThemedText style={{ fontSize: 16 }} accessibilityElementsHidden>
        🔍
      </ThemedText>
      <TextInput
        {...props}
        placeholderTextColor={theme.textSecondary}
        onFocus={(e) => {
          setFocused(true);
          glow.set(withTiming(1, { duration: 200 }));
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          glow.set(withTiming(0, { duration: 200 }));
          props.onBlur?.(e);
        }}
        style={[styles.input, { color: theme.text }, props.style, { outlineStyle: 'none' } as object]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Spacing.three, borderWidth: 1, paddingHorizontal: Spacing.three, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  elev: { elevation: 4 },
  input: { flex: 1, paddingVertical: Spacing.two + 2, fontSize: 16 },
});
