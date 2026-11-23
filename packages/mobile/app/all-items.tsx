import { Redirect, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BandBadge } from '@/components/chips';
import { Screen, ScreenHeader } from '@/components/screen';
import { money, plural } from '@/format';
import type { ComparedLine } from '@/mock/compare';
import { useBasket } from '@/state/basket';
import { palette, radius, space, type } from '@/theme';

export default function AllItemsScreen() {
  const router = useRouter();
  const { result } = useBasket();

  if (!result) return <Redirect href="/" />;

  const matched = result.lines.filter((line) => line.band === 'matched').length;
  const assumed = result.lines.filter((line) => line.band === 'assumed').length;
  const notOnSpecial = result.notOnSpecialLines.length;
  const singleStore = result.singlePriceLines.length;

  return (
    <Screen edges={['top']}>
      <ScreenHeader title="All items" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.summary}>
          {plural(matched, 'line')} with a clear match and {assumed} with an assumed match.{' '}
          {singleStore} had a special at one store only and {notOnSpecial} had none listed. Totals
          only cover items with a listed price at both stores.
        </Text>

        <View style={styles.card}>
          {result.lines.map((line, index) => (
            <ItemRow key={line.id} line={line} first={index === 0} />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

function ItemRow({ line, first }: { line: ComparedLine; first: boolean }) {
  const priced = line.coles !== null && line.woolworths !== null;
  const unpriced = line.coles === null && line.woolworths === null;
  const colesLower = priced && line.cheaper === 'coles';
  const wooliesLower = priced && line.cheaper === 'woolworths';

  return (
    <View style={[styles.row, !first && styles.divided]}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {line.productName ?? line.raw}
        </Text>
        <BandBadge band={line.band} />
      </View>

      {/* An unplaced line already shows the shopper's own words as its title. */}
      {line.productName ? (
        <Text style={styles.rowMeta} numberOfLines={1}>
          {line.quantity > 1 ? `${line.quantity} × ` : ''}
          {line.sizeText ? `${line.sizeText} · ` : ''}you typed &ldquo;{line.raw}&rdquo;
        </Text>
      ) : null}

      {line.assumption ? <Text style={styles.rowAssumption}>{line.assumption}</Text> : null}

      {unpriced ? (
        <Text style={styles.notCounted}>
          No special listed at either store — left out of both totals.
        </Text>
      ) : (
        <>
          <View style={styles.prices}>
            <PriceCell label="Coles" amount={line.coles} lower={colesLower} />
            <PriceCell label="Woolworths" amount={line.woolworths} lower={wooliesLower} />
          </View>
          {priced ? null : (
            <Text style={styles.notCounted}>
              Special listed at one store only — left out of both totals.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

/** A null amount means no special is listed at that store. It is never shown as $0.00. */
function PriceCell({
  label,
  amount,
  lower,
}: {
  label: string;
  amount: number | null;
  lower: boolean;
}) {
  return (
    <View style={[styles.priceCell, lower && styles.priceCellLower]}>
      <Text style={styles.priceLabel}>{label}</Text>
      {amount === null ? (
        <Text style={styles.priceMissing}>No special listed</Text>
      ) : (
        <Text style={[styles.priceAmount, lower && styles.priceAmountLower]}>{money(amount)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  summary: {
    ...type.body,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: 'hidden',
  },
  row: {
    padding: space.md,
    gap: space.sm - 2,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  rowTitle: {
    ...type.bodyStrong,
    fontSize: 16,
    flex: 1,
  },
  rowMeta: {
    ...type.caption,
    fontSize: 12,
  },
  rowAssumption: {
    ...type.caption,
    fontSize: 12,
    color: palette.caution,
  },
  prices: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  priceCell: {
    flex: 1,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceSunken,
    gap: 1,
  },
  priceCellLower: {
    backgroundColor: palette.accentTint,
  },
  priceLabel: {
    ...type.caption,
    fontSize: 11,
  },
  priceAmount: {
    ...type.moneySmall,
    color: palette.inkMuted,
  },
  priceMissing: {
    ...type.caption,
    fontSize: 13,
    lineHeight: 22,
  },
  priceAmountLower: {
    color: palette.accentDeep,
  },
  notCounted: {
    ...type.caption,
    fontSize: 12,
    marginTop: space.xs,
  },
});
