import type { ConfidenceBand } from '@basketgap/shared/matching/types';
import type { Retailer } from '@basketgap/shared/pricing/types';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { retailerName } from '@/format';
import { fonts, palette, radius, space } from '@/theme';

export const RETAILER_COLOUR: Record<Retailer, string> = {
  coles: palette.coles,
  woolworths: palette.woolworths,
};

/**
 * Retailer identity lives here and nowhere else — a small dot in the store's
 * own colour, on a neutral chip. Never used as a background or app chrome.
 */
export function RetailerChip({
  retailer,
  size = 'md',
}: {
  retailer: Retailer;
  size?: 'sm' | 'md';
}) {
  const small = size === 'sm';
  return (
    <View style={styles.retailerChip}>
      <View
        style={{
          width: small ? 6 : 8,
          height: small ? 6 : 8,
          borderRadius: 4,
          backgroundColor: RETAILER_COLOUR[retailer],
        }}
      />
      <Text style={[styles.retailerLabel, small && styles.retailerLabelSmall]}>
        {retailerName(retailer)}
      </Text>
    </View>
  );
}

const BAND_COPY: Record<ConfidenceBand, { label: string; fg: string; bg: string }> = {
  matched: { label: 'On special', fg: palette.accentDeep, bg: palette.accentTint },
  assumed: { label: 'Assumed size', fg: palette.caution, bg: palette.cautionTint },
  // Not a matching failure — the line simply isn't in this week's promotions.
  needs_attention: { label: 'Not on special', fg: palette.inkMuted, bg: palette.surfaceSunken },
};

export function BandBadge({ band }: { band: ConfidenceBand }) {
  const { label, fg, bg } = BAND_COPY[band];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeLabel, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function PostcodeChip({ postcode, onPress }: { postcode: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Postcode ${postcode}, tap to change` : undefined}
      style={({ pressed }) => [styles.postcodeChip, pressed && styles.pressed]}
    >
      <Text style={styles.postcodeText}>{postcode}</Text>
      {onPress ? <Text style={styles.postcodeAction}>Change</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  retailerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
  },
  retailerLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    lineHeight: 18,
    color: palette.inkMuted,
  },
  retailerLabelSmall: {
    fontSize: 12,
    lineHeight: 16,
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  badgeLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.3,
  },
  postcodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md - 2,
    paddingRight: space.md - 4,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  postcodeText: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: 0.8,
    color: palette.ink,
    fontVariant: ['tabular-nums'],
  },
  postcodeAction: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    lineHeight: 17,
    color: palette.accent,
  },
  pressed: {
    opacity: 0.6,
  },
});
