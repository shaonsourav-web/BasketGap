import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Chevron } from '@/components/glyphs';
import { fonts, palette, radius, space } from '@/theme';

export function PrimaryButton({
  label,
  hint,
  onPress,
  disabled = false,
}: {
  label: string;
  /** Quiet second line inside the button, e.g. the item count. */
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      style={({ pressed }) => [
        styles.primary,
        disabled && styles.primaryDisabled,
        pressed && !disabled && styles.primaryPressed,
      ]}
    >
      <Text style={[styles.primaryLabel, disabled && styles.primaryLabelDisabled]}>{label}</Text>
      {hint ? (
        <Text style={[styles.primaryHint, disabled && styles.primaryLabelDisabled]}>{hint}</Text>
      ) : null}
    </Pressable>
  );
}

/** A full-width row that opens another screen. Used for the optional views. */
export function ActionRow({
  label,
  detail,
  onPress,
  tone = 'default',
  style,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  tone?: 'default' | 'accent';
  style?: ViewStyle;
}) {
  const accent = tone === 'accent';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, style]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, accent && { color: palette.accentDeep }]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Chevron color={accent ? palette.accent : palette.inkFaint} />
    </Pressable>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={space.sm}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Text style={styles.textButton}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: 56,
    borderRadius: radius.lg,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md - 2,
  },
  primaryPressed: {
    backgroundColor: palette.accentDeep,
  },
  primaryDisabled: {
    backgroundColor: palette.surfaceSunken,
  },
  primaryLabel: {
    fontFamily: fonts.display,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: '#FFFFFF',
  },
  primaryHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 2,
  },
  primaryLabelDisabled: {
    color: palette.inkFaint,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: space.md,
    paddingVertical: space.md - 2,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  rowPressed: {
    backgroundColor: palette.surfaceSunken,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    lineHeight: 21,
    color: palette.ink,
  },
  rowDetail: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: palette.inkFaint,
  },
  textButton: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    lineHeight: 20,
    color: palette.accent,
  },
  pressed: {
    opacity: 0.6,
  },
});
