import { useEffect, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

const MAX_DEGREES = 16;

/**
 * Deixa o conteúdo "flutuando" em 3D: balança de leve sozinho e inclina seguindo o dedo (ou o mouse arrastando),
 * voltando com uma mola ao soltar. Usa só a API Animated do React Native, então vale no celular e na web.
 */
export function TiltView({ children }: { children: ReactNode }) {
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [pan] = useState(() => ({ x: new Animated.Value(0), y: new Animated.Value(0) }));
  const [sway] = useState(() => new Animated.Value(0));

  // Balanço ocioso: -1 → 1 → -1, devagar.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 2600, useNativeDriver: false }),
        Animated.timing(sway, { toValue: -1, duration: 2600, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sway]);

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, g) => {
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        pan.x.setValue(clamp(g.dx / 120));
        pan.y.setValue(clamp(g.dy / 160));
      },
      onPanResponderRelease: () => {
        Animated.spring(pan.x, { toValue: 0, useNativeDriver: false, friction: 5 }).start();
        Animated.spring(pan.y, { toValue: 0, useNativeDriver: false, friction: 5 }).start();
      },
    }),
  );

  const rotateY = Animated.add(Animated.multiply(pan.x, 1), Animated.multiply(sway, 0.35)).interpolate({
    inputRange: [-1.5, 1.5],
    outputRange: [`${-MAX_DEGREES * 1.5}deg`, `${MAX_DEGREES * 1.5}deg`],
  });
  const rotateX = pan.y.interpolate({ inputRange: [-1, 1], outputRange: [`${MAX_DEGREES}deg`, `${-MAX_DEGREES}deg`] });

  return (
    <View
      style={styles.stage}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      {...responder.panHandlers}
      accessible={false}>
      <Animated.View
        style={{
          width: size.width,
          alignItems: 'center',
          transform: [{ perspective: 900 }, { rotateX }, { rotateY }],
        }}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
});
