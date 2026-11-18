import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Folha que sobe de baixo (padrão de celular) para escolhas e detalhes. Toque fora ou voltar fecha. */
export function Sheet({ visible, onClose, title, children, tall = false }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; tall?: boolean }) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" accessibilityRole="button">
          <View style={styles.backdrop} />
        </Pressable>
        <SafeAreaView edges={['bottom']} style={[styles.sheet, tall && styles.tall, { backgroundColor: theme.backgroundElement, borderColor: theme.goldDark }]}>
          <View style={[styles.handle, { backgroundColor: theme.goldDark }]} />
          {title ? (
            <ThemedText type="subtitle" style={styles.title}>
              {title}
            </ThemedText>
          ) : null}
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(3, 2, 12, 0.72)' },
  sheet: { maxHeight: '82%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, paddingTop: Spacing.two, width: '100%', maxWidth: 640, alignSelf: 'center' },
  tall: { height: '82%' },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, opacity: 0.7, marginBottom: Spacing.two },
  title: { fontSize: 20, lineHeight: 26, textAlign: 'center', paddingHorizontal: Spacing.three },
  body: { padding: Spacing.three, gap: Spacing.three },
});