import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Chevron } from '@/components/glyphs';
import { palette, radius, space, type } from '@/theme';

export function Screen({
  children,
  edges = ['top', 'bottom'],
  style,
}: {
  children: React.ReactNode;
  edges?: readonly Edge[];
  style?: ViewStyle;
}) {
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]}>
      {children}
    </SafeAreaView>
  );
}

/**
 * One header shape across every screen below Home: a back control, the screen's
 * single job as a title, and room for one piece of context on the right.
 */
export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={space.sm}
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          >
            <Chevron direction="left" color={palette.ink} size={9} />
          </Pressable>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md - 4,
  },
  back: {
    width: 36,
    height: 36,
    marginLeft: -space.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPressed: {
    backgroundColor: palette.surfaceSunken,
  },
  title: {
    ...type.title,
    fontSize: 24,
    lineHeight: 30,
    flexShrink: 1,
  },
  sectionLabel: {
    ...type.label,
    marginBottom: space.sm + 2,
  },
});
