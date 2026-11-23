export const RETAILERS = ['coles', 'woolworths'] as const;
export type Retailer = (typeof RETAILERS)[number];

/**
 * A current promotional offer for one canonical product at one retailer,
 * sourced from an ingested catalogue special. `regularPrice` is the retailer's
 * advertised "was" price when the catalogue printed one; it is not a live
 * shelf price.
 */
export interface RetailerOffer {
  retailer: Retailer;
  specialPrice: number;
  regularPrice: number | null;
  savingsAmount: number | null;
  savingsPercent: number | null;
  promoType: string;
  promoLabel: string | null;
  multiBuy: boolean;
  memberLocked: boolean;
  productName: string;
  sizeText: string | null;
  state: string | null;
  sourceLabel: string;
  validTo: string | null;
  fetchedAt: string;
}

export interface ProductOffers {
  canonicalProductId: string;
  coles: RetailerOffer | null;
  woolworths: RetailerOffer | null;
}

export interface LoadOffersOptions {
  /** AU state filter. Without a state, only offers without a state restriction qualify. */
  state?: string | null;
  /** Clock override for tests. Defaults to `new Date()`. */
  now?: Date;
}

/**
 * Offers with no explicit validity window are kept only while their source
 * catalogue is at most this old. Weekly catalogues plus a grace period.
 */
export const OFFER_MAX_AGE_DAYS = 14;
