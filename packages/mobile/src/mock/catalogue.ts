import { CORE_CATALOGUE, type CatalogueEntry } from './catalogue-core';
import { BASKET_SCENARIOS } from './scenarios';

export type { CatalogueEntry } from './catalogue-core';
export { BASKET_SCENARIOS } from './scenarios';

/** Synthetic sample catalogue. See catalogue-core.ts. */
export const CATALOGUE: CatalogueEntry[] = CORE_CATALOGUE;

export const CATALOGUE_COVERAGE = {
  /** True while every screen runs on invented sample data rather than a real catalogue feed. */
  isSample: true,
  /** Sample products in the offline catalogue. */
  productsScanned: CATALOGUE.length,
  /** The sample set is a single catalogue window. */
  cataloguesChecked: 1,
  note: 'Synthetic sample data for offline demonstration. Not real retailer prices.',
} as const;

/** Default empty-field placeholder — how people actually type. */
export const LIST_PLACEHOLDER = ['eggs', 'tp', 'cheese', 'ice cream', 'chips', 'coffee'].join('\n');

/** Mid-size default sample when someone taps a budget chip. */
export const SAMPLE_LIST =
  BASKET_SCENARIOS.find((scenario) => scenario.target === 150)?.list ?? BASKET_SCENARIOS[0]!.list;
