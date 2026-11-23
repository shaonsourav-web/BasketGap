import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BASKET_SCENARIOS } from '@/mock/catalogue';
import { useBasket } from '@/state/basket';
import { fonts, palette, space } from '@/theme';

/**
 * DEV-only helper so Simulator QA can jump straight to a sample-basket compare.
 * exp://localhost:8099/--/qa-live?budget=150
 */
export default function QaLiveScreen() {
  const router = useRouter();
  const { budget } = useLocalSearchParams<{ budget?: string }>();
  const { setPostcode, setListText, runCompare } = useBasket();
  const prepared = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!__DEV__ || prepared.current) return;
    prepared.current = true;

    const target = Number(budget ?? '150') as 50 | 100 | 150 | 200 | 250 | 300;
    const scenario =
      BASKET_SCENARIOS.find((row) => row.target === target) ??
      BASKET_SCENARIOS.find((row) => row.target === 150)!;

    setPostcode('3121');
    setListText(scenario.list);
    void runCompare({ listText: scenario.list, postcode: '3121' })
      .then(() => router.replace('/results'))
      .catch(() => setFailed(true));
  }, [budget, router, runCompare, setListText, setPostcode]);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={palette.accent} />
      <Text style={styles.label}>
        {failed ? 'Could not compare prices.' : 'Comparing sample basket…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    backgroundColor: palette.bg,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: palette.inkMuted,
  },
});
