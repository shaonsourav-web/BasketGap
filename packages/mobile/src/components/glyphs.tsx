import { View } from 'react-native';

import { palette } from '@/theme';

/**
 * Chevrons and the close cross are drawn rather than set in a font, so they
 * stay identical whatever the loaded typefaces do with arrow glyphs.
 */
export function Chevron({
  direction = 'right',
  color = palette.inkFaint,
  size = 9,
  weight = 2,
}: {
  direction?: 'right' | 'left' | 'down';
  color?: string;
  size?: number;
  weight?: number;
}) {
  const rotate = direction === 'right' ? '45deg' : direction === 'left' ? '-135deg' : '135deg';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRightWidth: weight,
        borderTopWidth: weight,
        borderColor: color,
        transform: [{ rotate }],
      }}
    />
  );
}

export function CloseCross({
  color = palette.inkMuted,
  size = 14,
  weight = 2,
}: {
  color?: string;
  size?: number;
  weight?: number;
}) {
  const bar = {
    position: 'absolute' as const,
    width: size,
    height: weight,
    borderRadius: weight,
    backgroundColor: color,
  };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[bar, { transform: [{ rotate: '45deg' }] }]} />
      <View style={[bar, { transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}

/**
 * The BasketGap mark: two bars at different heights with a gap between them —
 * the difference the app exists to show, and nothing that reads as either
 * retailer's logo.
 */
export function BrandMark({ height = 36 }: { height?: number }) {
  const barWidth = Math.round(height * 0.38);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Math.round(height * 0.16) }}>
      <View
        style={{
          width: barWidth,
          height,
          borderRadius: barWidth / 2.6,
          backgroundColor: palette.ink,
        }}
      />
      <View
        style={{
          width: barWidth,
          height: Math.round(height * 0.62),
          borderRadius: barWidth / 2.6,
          backgroundColor: palette.accent,
        }}
      />
    </View>
  );
}
