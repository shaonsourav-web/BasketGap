import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/controls';
import { BrandMark } from '@/components/glyphs';
import { Screen } from '@/components/screen';
import { useBasket } from '@/state/basket';
import { fonts, palette, radius, space, type } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { postcode, setPostcode, restoring } = useBasket();
  const [focused, setFocused] = useState(false);

  const ready = postcode.length === 4;
  const incomplete = postcode.length > 0 && !ready;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <View style={styles.hero}>
            <BrandMark height={40} />
            <Text style={styles.wordmark}>
              Basket<Text style={styles.wordmarkAccent}>Gap</Text>
            </Text>
            <Text style={styles.headline}>
              Compare your list using published catalogue specials.
            </Text>
            <Text style={styles.honesty}>We might miss a thing or two.</Text>
            <Text style={styles.tagline}>
              We check your shopping list against Coles and Woolworths catalogue promotions. Items
              without a listed special are left out of the totals.
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Your postcode</Text>
            <TextInput
              value={postcode}
              onChangeText={(next) => setPostcode(next.replace(/\D/g, '').slice(0, 4))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={4}
              placeholder="3121"
              placeholderTextColor={palette.inkFaint}
              accessibilityLabel="Postcode, four digits"
              editable={!restoring}
              style={[styles.input, focused && styles.inputFocused]}
            />
            <Text style={styles.fieldHint}>
              {incomplete
                ? 'Four digits, like 3121.'
                : 'Prices vary by area, so we start here. We remember it on this phone.'}
            </Text>
            {postcode.length === 0 ? (
              <Text
                accessibilityRole="button"
                accessibilityLabel="Use postcode 3121"
                onPress={() => setPostcode('3121')}
                style={styles.quickPostcode}
              >
                Use 3121
              </Text>
            ) : null}
          </View>

          <View style={styles.footer}>
            <PrimaryButton
              label="Continue"
              disabled={!ready}
              onPress={() => router.push('/list')}
            />
            <Text style={styles.reassurance}>
              No account, no sign-up. Your list stays on your phone.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
    paddingBottom: space.lg,
  },
  hero: {
    gap: space.sm,
  },
  wordmark: {
    ...type.hero,
    marginTop: space.sm,
  },
  wordmarkAccent: {
    color: palette.accent,
  },
  headline: {
    ...type.heading,
    marginTop: space.sm,
  },
  honesty: {
    ...type.body,
    color: palette.inkMuted,
    fontStyle: 'italic',
  },
  tagline: {
    ...type.body,
    maxWidth: 340,
    marginTop: space.xs,
  },
  field: {
    flex: 1,
    justifyContent: 'center',
    gap: space.sm + 2,
  },
  fieldLabel: {
    ...type.label,
  },
  input: {
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.line,
    paddingHorizontal: space.lg - 4,
    fontFamily: fonts.displayMedium,
    fontSize: 26,
    letterSpacing: 6,
    color: palette.ink,
  },
  inputFocused: {
    borderColor: palette.accent,
  },
  fieldHint: {
    ...type.caption,
    paddingHorizontal: space.xs,
  },
  quickPostcode: {
    ...type.bodyStrong,
    color: palette.accent,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
  },
  footer: {
    gap: space.md,
  },
  reassurance: {
    ...type.caption,
    textAlign: 'center',
  },
});
