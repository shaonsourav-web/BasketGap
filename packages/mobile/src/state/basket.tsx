import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { compareBasket, type CompareResult } from '@/mock/compare';
import { compareWithApi, liveOffersEnabled } from '@/compare-api';

const POSTCODE_KEY = 'basketgap.postcode';

interface BasketState {
  postcode: string;
  /** True until the remembered postcode has been read back off the device. */
  restoring: boolean;
  setPostcode: (postcode: string) => void;
  listText: string;
  setListText: (text: string) => void;
  result: CompareResult | null;
  runCompare: (override?: {
    listText?: string;
    postcode?: string;
    signal?: AbortSignal;
  }) => Promise<CompareResult>;
  unmatchedDismissed: boolean;
  dismissUnmatched: () => void;
}

const BasketContext = createContext<BasketState | null>(null);

/**
 * Everything the shopper is working on, held in memory for the session. The
 * postcode is the only thing that outlives the session — lists are never
 * persisted, per the spec's storage promise.
 */
export function BasketProvider({ children }: { children: ReactNode }) {
  const [postcode, setPostcodeState] = useState(__DEV__ ? '3121' : '');
  const [restoring, setRestoring] = useState(true);
  const [listText, setListText] = useState('');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [unmatchedDismissed, setUnmatchedDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(POSTCODE_KEY)
      .then((stored) => {
        if (active && stored) setPostcodeState(stored);
      })
      .catch(() => {
        // A missing or unreadable postcode is not worth interrupting anyone over.
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const setPostcode = useCallback((next: string) => {
    setPostcodeState(next);
    if (next.length === 4) {
      void AsyncStorage.setItem(POSTCODE_KEY, next).catch(() => {});
    }
  }, []);

  const runCompare = useCallback(
    async (override?: { listText?: string; postcode?: string; signal?: AbortSignal }) => {
      const text = override?.listText ?? listText;
      const area = override?.postcode ?? postcode;
      const next = liveOffersEnabled
        ? await compareWithApi(text, area, override?.signal)
        : compareBasket(text, area);
      if (override?.signal?.aborted) return next;
      setUnmatchedDismissed(false);
      setResult(next);
      return next;
    },
    [listText, postcode],
  );

  const dismissUnmatched = useCallback(() => setUnmatchedDismissed(true), []);

  const value = useMemo<BasketState>(
    () => ({
      postcode,
      restoring,
      setPostcode,
      listText,
      setListText,
      result,
      runCompare,
      unmatchedDismissed,
      dismissUnmatched,
    }),
    [
      postcode,
      restoring,
      setPostcode,
      listText,
      result,
      runCompare,
      unmatchedDismissed,
      dismissUnmatched,
    ],
  );

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket(): BasketState {
  const context = useContext(BasketContext);
  if (!context) throw new Error('useBasket must be used inside a BasketProvider');
  return context;
}
