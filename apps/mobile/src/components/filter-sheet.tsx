import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StateMessage } from '@/components/state-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useFacets } from '@/hooks/use-facets';
import { useTheme } from '@/hooks/use-theme';

export type CardFilters = {
  type?: string;
  attribute?: string;
  race?: string;
  level?: number;
  archetype?: string;
};

export const EMPTY_FILTERS: CardFilters = {};

export const activeFilterCount = (f: CardFilters) => Object.values(f).filter((v) => v !== undefined).length;

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.text : theme.backgroundElement },
        pressed && styles.dim,
      ]}>
      <ThemedText type="small" style={selected ? { color: theme.background } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Section<T extends string | number>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: T[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  if (options.length === 0) return null;
  return (
    <ThemedView style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedView style={styles.chips}>
        {options.map((o) => (
          <Chip key={o} label={String(o)} selected={o === value} onPress={() => onChange(o === value ? undefined : o)} />
        ))}
      </ThemedView>
    </ThemedView>
  );
}

/**
 * Folha de filtros em tela cheia: escolher é opcional; tocar de novo no chip selecionado limpa o filtro.
 * Monte só enquanto estiver aberta: o rascunho nasce igual ao que está aplicado e cancelar o descarta.
 */
export function FilterSheet({
  value,
  onApply,
  onClose,
}: {
  value: CardFilters;
  onApply: (value: CardFilters) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(value);
  const { facets, error, retry } = useFacets(true);

  const set = <K extends keyof CardFilters>(key: K, v: CardFilters[K]) => setDraft((d) => ({ ...d, [key]: v }));

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedView style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>
              Filtros
            </ThemedText>
            <Pressable onPress={onClose} accessibilityRole="button">
              <ThemedText type="linkPrimary">Cancelar</ThemedText>
            </Pressable>
          </ThemedView>

          {error ? (
            <StateMessage message={error} onRetry={retry} />
          ) : !facets ? (
            <StateMessage loading />
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              <Section title="Tipo" options={facets.types} value={draft.type} onChange={(v) => set('type', v)} />
              <Section title="Atributo" options={facets.attributes} value={draft.attribute} onChange={(v) => set('attribute', v)} />
              <Section title="Espécie" options={facets.races} value={draft.race} onChange={(v) => set('race', v)} />
              <Section title="Nível" options={facets.levels} value={draft.level} onChange={(v) => set('level', v)} />
              <Section title="Arquétipo" options={facets.archetypes} value={draft.archetype} onChange={(v) => set('archetype', v)} />
            </ScrollView>
          )}

          <ThemedView style={styles.footer}>
            <Pressable onPress={() => setDraft(EMPTY_FILTERS)} accessibilityRole="button">
              <ThemedText type="linkPrimary">Limpar tudo</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onApply(draft)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.apply, { backgroundColor: theme.text }, pressed && styles.dim]}>
              <ApplyLabel count={activeFilterCount(draft)} />
            </Pressable>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

function ApplyLabel({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <ThemedText type="smallBold" style={{ color: theme.background }}>
      {count > 0 ? `Aplicar (${count})` : 'Aplicar'}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.three },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.three },
  title: { fontSize: 28, lineHeight: 34 },
  content: { gap: Spacing.three, paddingBottom: Spacing.four },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.three },
  apply: { borderRadius: Spacing.three, paddingHorizontal: Spacing.five, paddingVertical: Spacing.three },
  dim: { opacity: 0.6 },
});
