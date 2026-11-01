import { Redirect, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen, ScreenHeader, SectionLabel } from '@/components/screen';
import { money, plural, retailerName } from '@/format';
import { useBasket } from '@/state/basket';
import { palette, radius, space, type } from '@/theme';

export default function SplitScreen() {
  const router = useRouter();
  const { result } = useBasket();

  if (!result) return <Redirect href="/" />;

  const { colesTotal, woolworthsTotal, split, lower } = result;
  const worthIt = split.savingVsBestSingle > 0;

  return (
    <Screen edges={['top']}>
      <ScreenHeader title="Split basket" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.explain}>
          A split basket buys each line wherever it&apos;s cheaper — the same items, across two
          shops instead of one. Only items with a listed price at both stores are included.
        </Text>

        <View>
          <SectionLabel>Three ways to buy this list</SectionLabel>
          <View style={styles.card}>
            <OptionRow label="All at Coles" amount={colesTotal} />
            <OptionRow label="All at Woolworths" amount={woolworthsTotal} divided />
            <OptionRow label="Split across both" amount={split.total} divided highlight />
          </View>
        </View>

        <View style={styles.outcome}>
          <Text style={styles.outcomeHeadline}>
            {worthIt
              ? `Splitting comes to ${money(split.savingVsBestSingle)} less`
              : 'Splitting makes no difference today'}
          </Text>
          <Text style={styles.outcomeDetail}>
            {worthIt
              ? `That's against ${lower ? retailerName(lower) : 'the cheaper store'} on its own, and it means two stops. Whether that's worth it is your call.`
              : 'Every line is already cheapest at the same store, so a second stop would buy you nothing.'}
          </Text>
        </View>

        <View style={styles.breakdown}>
          <Text style={styles.breakdownText}>
            {plural(split.colesLineCount, 'line')} would come from Coles and{' '}
            {plural(split.woolworthsLineCount, 'line')} from Woolworths. Lines that cost the same at
            both stay with the store you&apos;re already visiting.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function OptionRow({
  label,
  amount,
  divided = false,
  highlight = false,
}: {
  label: string;
  amount: number;
  divided?: boolean;
  highlight?: boolean;
}) {
  return (
    <View
      style={[styles.optionRow, divided && styles.divided, highlight && styles.optionHighlight]}
    >
      <Text style={[styles.optionLabel, highlight && styles.optionLabelHighlight]}>{label}</Text>
      <Text style={[styles.optionAmount, highlight && styles.optionAmountHighlight]}>
        {money(amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  explain: {
    ...type.bodyLarge,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  optionHighlight: {
    backgroundColor: palette.accentTint,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  optionLabel: {
    ...type.bodyStrong,
    fontSize: 16,
  },
  optionLabelHighlight: {
    color: palette.accentDeep,
  },
  optionAmount: {
    ...type.moneySmall,
    fontSize: 20,
    lineHeight: 26,
  },
  optionAmountHighlight: {
    color: palette.accentDeep,
  },
  outcome: {
    gap: space.sm,
  },
  outcomeHeadline: {
    ...type.title,
    fontSize: 24,
    lineHeight: 30,
  },
  outcomeDetail: {
    ...type.body,
  },
  breakdown: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceSunken,
  },
  breakdownText: {
    ...type.body,
    fontSize: 14,
    lineHeight: 21,
  },
});
