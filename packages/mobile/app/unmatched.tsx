import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/controls';
import { CloseCross } from '@/components/glyphs';
import { Screen } from '@/components/screen';
import { plural } from '@/format';
import { useBasket } from '@/state/basket';
import { palette, radius, space, type } from '@/theme';

/**
 * Optional detail for lines that weren't in this week's promotions.
 * Kept as a route for deep links; the results screen no longer pushes people here.
 */
export default function NotOnSpecialScreen() {
  const router = useRouter();
  const { result, dismissUnmatched } = useBasket();

  if (!result) return <Redirect href="/" />;

  const { notOnSpecialLines } = result;

  const close = () => {
    dismissUnmatched();
    router.back();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={space.md}
          style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
        >
          <CloseCross color={palette.ink} size={14} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{plural(notOnSpecialLines.length, 'line')} not on special</Text>
        <Text style={styles.intro}>
          No special is listed for these at either store, so they sit outside both totals. That
          doesn&apos;t mean we failed to understand them — they may simply not be discounted.
        </Text>

        <View style={styles.card}>
          {notOnSpecialLines.map((line, index) => (
            <View key={line.id} style={[styles.row, index > 0 && styles.divided]}>
              <Text style={styles.rowText}>{line.raw}</Text>
              <Text style={styles.rowHint}>No special listed — left out of both totals</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label="Got it" onPress={close} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'flex-end',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceSunken,
  },
  closePressed: {
    opacity: 0.6,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    gap: space.md,
  },
  title: {
    ...type.title,
  },
  intro: {
    ...type.bodyLarge,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: 'hidden',
    marginTop: space.sm,
  },
  row: {
    paddingHorizontal: space.md,
    paddingVertical: space.md - 2,
    gap: 2,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  rowText: {
    ...type.bodyStrong,
    fontSize: 16,
  },
  rowHint: {
    ...type.caption,
    fontSize: 12,
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
});
