import { Redirect, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PostcodeChip, RetailerChip, RETAILER_COLOUR } from '@/components/chips';
import { ActionRow } from '@/components/controls';
import { Screen, ScreenHeader, SectionLabel } from '@/components/screen';
import { freshness, money, plural, retailerName } from '@/format';
import { CATALOGUE_COVERAGE } from '@/mock/catalogue';
import type { ComparedLine } from '@/mock/compare';
import { useBasket } from '@/state/basket';
import { fonts, palette, radius, space, type } from '@/theme';

export default function ResultsScreen() {
  const router = useRouter();
  const { result } = useBasket();

  if (!result) return <Redirect href="/" />;

  const {
    colesTotal,
    woolworthsTotal,
    lower,
    difference,
    drivers,
    lines,
    notOnSpecialLines,
    split,
    singlePriceLines,
    pricedLines,
  } = result;
  const pricedCount = pricedLines.length;

  return (
    <Screen edges={['top']}>
      <ScreenHeader
        title="Your basket"
        onBack={() => router.back()}
        right={<PostcodeChip postcode={result.postcode} />}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {CATALOGUE_COVERAGE.isSample ? null : (
          <Text style={styles.freshness}>{freshness(result.pricedAt)}</Text>
        )}

        <View style={styles.totals}>
          <TotalColumn retailer="coles" total={colesTotal} />
          <View style={styles.totalsDivider} />
          <TotalColumn retailer="woolworths" total={woolworthsTotal} />
        </View>

        <View style={styles.disclosure} accessibilityRole="summary">
          <Text style={styles.disclosureText}>
            {CATALOGUE_COVERAGE.isSample ? (
              <Text style={styles.disclosureStrong}>Sample data, not real prices. </Text>
            ) : null}
            Compares Coles and Woolworths using published catalogue promotions only. Totals cover
            only items with a listed price at both stores. Where a store has no special listed, the
            item shows &ldquo;No special listed&rdquo; and is left out of both totals.
          </Text>
        </View>

        <View style={styles.difference}>
          <Text style={styles.differenceHeadline}>
            {pricedCount === 0
              ? 'No items have a listed price at both stores'
              : lower
                ? `${retailerName(lower)} lower by ${money(difference)} on the items counted`
                : 'Both baskets come to the same total on the items counted'}
          </Text>
          <Text style={styles.differenceDetail}>
            {pricedCount} of {plural(lines.length, 'line')} had a listed price at both stores.
            {singlePriceLines.length > 0
              ? ` ${plural(singlePriceLines.length, 'line')} had a special at one store only.`
              : ''}
            {notOnSpecialLines.length > 0
              ? ` ${plural(notOnSpecialLines.length, 'line')} had no special listed.`
              : ''}
            {lines.length > pricedCount ? ' Those lines are left out of both totals.' : ''}
          </Text>
        </View>

        {drivers.length > 0 ? (
          <View>
            <SectionLabel>What&apos;s driving the difference</SectionLabel>
            <View style={styles.card}>
              {drivers.map((line, index) => (
                <DriverRow key={line.id} line={line} first={index === 0} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <ActionRow
            label="View all items"
            detail={`${plural(pricedCount, 'line')} with a listed price at both stores`}
            onPress={() => router.push('/all-items')}
          />
          <ActionRow
            label="Split the basket"
            detail={
              split.savingVsBestSingle > 0
                ? `Shopping both stores comes to ${money(split.total)}`
                : 'One store is already the cheaper way to shop'
            }
            onPress={() => router.push('/split')}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function TotalColumn({ retailer, total }: { retailer: 'coles' | 'woolworths'; total: number }) {
  return (
    <View style={styles.totalColumn}>
      <RetailerChip retailer={retailer} />
      <Text style={styles.totalAmount}>{money(total)}</Text>
    </View>
  );
}

function DriverRow({ line, first }: { line: ComparedLine; first: boolean }) {
  const cheaper = line.cheaper;

  return (
    <View style={[styles.driverRow, !first && styles.divided]}>
      <View style={styles.driverText}>
        <Text style={styles.driverName} numberOfLines={1}>
          {line.productName}
        </Text>
        <Text style={styles.driverPrices} numberOfLines={1}>
          {line.quantity > 1 ? `${line.quantity} × ` : ''}Coles{' '}
          {line.coles === null ? 'no special listed' : money(line.coles)} · Woolies{' '}
          {line.woolworths === null ? 'no special listed' : money(line.woolworths)}
        </Text>
      </View>
      <View style={styles.driverDelta}>
        <Text style={styles.deltaAmount}>{money(line.delta)}</Text>
        {cheaper ? (
          <View style={styles.deltaCaptionRow}>
            <View style={[styles.dot, { backgroundColor: RETAILER_COLOUR[cheaper] }]} />
            <Text style={styles.deltaCaption}>{retailerName(cheaper)} lower</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  freshness: {
    ...type.caption,
  },
  totals: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    paddingVertical: space.lg,
  },
  totalsDivider: {
    width: 1,
    backgroundColor: palette.line,
  },
  totalColumn: {
    flex: 1,
    alignItems: 'center',
    gap: space.sm,
  },
  totalAmount: {
    ...type.money,
  },
  disclosure: {
    backgroundColor: palette.accentTint,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md - 2,
  },
  disclosureText: {
    ...type.body,
    fontSize: 14,
    lineHeight: 20,
    color: palette.ink,
  },
  disclosureStrong: {
    fontFamily: fonts.bodyBold,
  },
  difference: {
    gap: space.sm,
  },
  differenceHeadline: {
    ...type.title,
  },
  differenceDetail: {
    ...type.body,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: 'hidden',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md - 2,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  driverText: {
    flex: 1,
    gap: 2,
  },
  driverName: {
    ...type.bodyStrong,
  },
  driverPrices: {
    ...type.caption,
    fontSize: 12,
  },
  driverDelta: {
    alignItems: 'flex-end',
    gap: 3,
  },
  deltaAmount: {
    ...type.moneySmall,
    fontFamily: fonts.displayBold,
    fontSize: 18,
    lineHeight: 22,
  },
  deltaCaptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  deltaCaption: {
    ...type.caption,
    fontSize: 11,
  },
  actions: {
    gap: space.sm + 2,
  },
});
