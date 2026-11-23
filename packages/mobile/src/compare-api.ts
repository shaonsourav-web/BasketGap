import type { MatchResult } from '@basketgap/shared/matching/types';
import { cleanLine } from '@basketgap/shared/matching/steps/01-clean';
import { extractQuantitySize } from '@basketgap/shared/matching/steps/04-quantity-size';
import type { ProductOffers, RetailerOffer } from '@basketgap/shared/pricing/types';

import { extractQuantity, priceLine, summarizeBasket, type CompareResult } from './mock/compare';

export const liveOffersEnabled = process.env.EXPO_PUBLIC_BASKETGAP_LIVE_OFFERS === 'true';

type MatchResponse = {
  results: (Pick<MatchResult, 'raw' | 'band' | 'canonicalProductId' | 'top' | 'alternatives'> & {
    offers: ProductOffers | null;
  })[];
  stats: { offers_available: boolean; postcode_resolved?: boolean | null };
};

function usableOffer(offer: RetailerOffer | null | undefined): offer is RetailerOffer {
  return (
    offer != null &&
    offer.multiBuy === false &&
    offer.memberLocked === false &&
    Number.isFinite(offer.specialPrice) &&
    Math.round(offer.specialPrice * 100) > 0 &&
    Number.isFinite(Date.parse(offer.fetchedAt))
  );
}

export async function compareWithApi(
  listText: string,
  postcode: string,
  signal?: AbortSignal,
  baseUrl = process.env.EXPO_PUBLIC_BASKETGAP_API_URL,
): Promise<CompareResult> {
  const input = listText
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);
  if (input.length < 1 || input.length > 100 || input.some((line) => line.length > 200)) {
    throw new Error('Enter 1 to 100 items, with no more than 200 characters per line.');
  }
  if (!baseUrl) throw new Error('The offers API URL is missing.');
  const quantities = input.map((line) => {
    const { quantity, rest } = extractQuantity(line);
    const cleaned = cleanLine(rest);
    const supported =
      Number.isSafeInteger(quantity) &&
      quantity >= 1 &&
      quantity <= 24 &&
      extractQuantitySize(cleaned).quantity === null &&
      !/\b(?:doz(?:en)?|packs?|pk|pkts?|ct|pieces?|(?:bottles?|bags?|boxes?|cans?)\s+of)\b|\b\d+\s*\/\s*\d+\b/.test(
        rest.toLowerCase(),
      ) &&
      !/^\d+(?:\.\d+)?\s+[a-z]/i.test(cleaned.replace(/^\d+(?:\.\d+)?\s+(?:kg|g|ml|l)\b/i, ''));
    return { quantity, rest, supported };
  });
  const lines = input.map((line, index) => {
    const parsed = quantities[index];
    return parsed?.supported && parsed.rest.trim() ? parsed.rest.trim() : line;
  });

  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel);
  if (signal?.aborted) cancel();
  const timeout = setTimeout(cancel, 35_000);
  let response: MatchResponse;
  try {
    const res = await fetch(new URL('/api/match', baseUrl).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, postcode }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('Offers request failed.');
    response = (await res.json()) as MatchResponse;
  } catch {
    throw new Error('Could not compare prices. Please try again.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }

  if (response?.stats?.offers_available !== true) {
    throw new Error('Catalogue prices are temporarily unavailable. Please try again.');
  }
  if (
    !Array.isArray(response.results) ||
    response.results.length !== lines.length ||
    response.results.some((line, index) => line?.raw !== lines[index])
  ) {
    throw new Error('The offers service returned an incomplete list. Please try again.');
  }

  let oldestFetch = Infinity;
  const compared = response.results.map(
    ({ band, canonicalProductId, top, alternatives, offers }, index) => {
      const { quantity, supported: quantitySupported } = quantities[index]!;
      const matched = band === 'matched' || band === 'assumed';
      const selected =
        top?.canonicalProductId === canonicalProductId
          ? top
          : alternatives?.find((candidate) => candidate.canonicalProductId === canonicalProductId);
      const eligible =
        matched &&
        selected &&
        canonicalProductId &&
        offers?.canonicalProductId === canonicalProductId &&
        quantitySupported;
      const coles = eligible && usableOffer(offers?.coles) ? offers.coles : null;
      const woolworths = eligible && usableOffer(offers?.woolworths) ? offers.woolworths : null;
      for (const offer of [coles, woolworths]) {
        if (offer) oldestFetch = Math.min(oldestFetch, Date.parse(offer.fetchedAt));
      }
      return priceLine({
        id: `line-${index}`,
        raw: input[index]!,
        quantity,
        band,
        productName: matched ? (selected?.name ?? null) : null,
        sizeText:
          matched && selected?.unitSizeValue != null && selected.unitSizeUom
            ? `${selected.unitSizeValue} ${selected.unitSizeUom}`
            : null,
        assumption: !quantitySupported
          ? 'This quantity could not be priced.'
          : band === 'assumed'
            ? 'Check that this is the product you meant.'
            : null,
        colesUnit: coles?.specialPrice ?? null,
        woolworthsUnit: woolworths?.specialPrice ?? null,
      });
    },
  );
  return summarizeBasket(compared, {
    postcode,
    isSample: false,
    limitedPostcodeCoverage: response.stats.postcode_resolved === false,
    pricedAt: Number.isFinite(oldestFetch) ? new Date(oldestFetch) : null,
    productsScanned: null,
    cataloguesChecked: null,
  });
}
