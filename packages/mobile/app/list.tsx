import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PostcodeChip } from '@/components/chips';
import { liveOffersEnabled } from '@/compare-api';
import { PrimaryButton } from '@/components/controls';
import { Screen, ScreenHeader } from '@/components/screen';
import { plural } from '@/format';
import { BASKET_SCENARIOS, LIST_PLACEHOLDER } from '@/mock/catalogue';
import { useBasket } from '@/state/basket';
import { fonts, palette, radius, space, type } from '@/theme';

export default function ListScreen() {
  const router = useRouter();
  const { postcode, listText, setListText, runCompare } = useBasket();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const itemCount = listText.split('\n').filter((line) => line.trim().length > 0).length;

  const onCompare = () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    void runCompare({ signal: controller.signal })
      .then(() => {
        if (!controller.signal.aborted) router.push('/results');
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Could not compare prices.');
        }
      })
      .finally(() => {
        request.current = null;
        if (!controller.signal.aborted) setPending(false);
      });
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader
          title="Your list"
          onBack={() => router.back()}
          right={<PostcodeChip postcode={postcode} onPress={() => router.back()} />}
        />

        <View style={styles.intro}>
          <Text style={styles.introText}>
            One item per line. Write it however you say it — eggs, milk, snags, tp. We&apos;ll match
            it to published catalogue specials when you tap Compare.
          </Text>
        </View>

        {liveOffersEnabled ? null : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scenarios}
            style={styles.scenariosRow}
          >
            {BASKET_SCENARIOS.map((scenario) => {
              const active = listText === scenario.list;
              return (
                <Pressable
                  key={scenario.target}
                  onPress={() => setListText(scenario.list)}
                  accessibilityRole="button"
                  accessibilityLabel={`Load ${scenario.label} sample list, ${scenario.blurb}`}
                  style={({ pressed }) => [
                    styles.scenarioChip,
                    active && styles.scenarioChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.scenarioLabel, active && styles.scenarioLabelActive]}>
                    {scenario.label}
                  </Text>
                  <Text style={[styles.scenarioBlurb, active && styles.scenarioBlurbActive]}>
                    {scenario.blurb}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <TextInput
          value={listText}
          editable={!pending}
          onChangeText={setListText}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          textAlignVertical="top"
          placeholder={LIST_PLACEHOLDER}
          placeholderTextColor={palette.inkFaint}
          accessibilityLabel="Shopping list"
          style={styles.input}
        />

        <View style={styles.footer}>
          <PrimaryButton
            label={pending ? 'Comparing…' : 'Compare'}
            hint={itemCount > 0 ? plural(itemCount, 'item') : undefined}
            disabled={itemCount === 0 || pending}
            onPress={onCompare}
          />
          <Text style={styles.quiet} accessibilityLiveRegion="polite">
            {error ?? 'Nothing happens until you tap Compare.'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  intro: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  introText: {
    ...type.body,
    maxWidth: 340,
  },
  scenariosRow: {
    flexGrow: 0,
    marginBottom: space.sm,
  },
  scenarios: {
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  scenarioChip: {
    minWidth: 108,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    gap: 2,
  },
  scenarioChipActive: {
    backgroundColor: palette.accentTint,
    borderColor: palette.accent,
  },
  scenarioLabel: {
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    color: palette.ink,
  },
  scenarioLabelActive: {
    color: palette.accentDeep,
  },
  scenarioBlurb: {
    ...type.caption,
    fontSize: 11,
  },
  scenarioBlurbActive: {
    color: palette.accentDeep,
  },
  input: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    fontFamily: fonts.body,
    fontSize: 18,
    lineHeight: 32,
    color: palette.ink,
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.sm + 2,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.bg,
  },
  quiet: {
    ...type.caption,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
