export type RetailerCode = 'coles' | 'woolworths';

export type CatalogueSource = {
  kind: 'url' | 'fixture';
  value: string;
  fetchedAt: Date;
  bytes: Uint8Array;
  hash: string;
};

export type ParsedSpecial = {
  productName: string;
  brand: string | null;
  sizeText: string | null;
  unitSizeValue: number | null;
  unitSizeUom: 'g' | 'kg' | 'ml' | 'L' | 'pack' | 'each' | null;
  regularPrice: number | null;
  specialPrice: number;
  savingsAmount: number | null;
  savingsPercent: number | null;
  promoType:
    | 'standard'
    | 'half_price'
    | 'down_down'
    | 'prices_dropped'
    | 'percent_off'
    | 'multi_buy'
    | 'unknown';
  promoLabel: string | null;
  multiBuy: boolean;
  isMemberLocked: boolean;
  retailerSku: string | null;
  sourcePage: number | null;
  rawText: string;
  confidenceScore: number;
};

export type ParsedCatalogue = {
  retailer: RetailerCode;
  sourceType: 'pdf' | 'web';
  sourceLabel: string;
  sourceUrl: string;
  sourceHash: string;
  validFrom: Date | null;
  validTo: Date | null;
  itemCount: number;
  pageCount: number;
  specials: ParsedSpecial[];
  warnings: string[];
};

export type IngestOptions = {
  sourceUrl?: string;
  fixturePath?: string;
  dryRun: boolean;
  forceRefresh: boolean;
};

export type IngestResult = {
  catalogueId: string | null;
  specialsInserted: number;
  skipped: boolean;
  reason: string | null;
  parsed: ParsedCatalogue;
};

/**
 * One `workers ingest <name>` target. The built-in `import` adapter and every
 * plugin-supplied adapter implement this same contract.
 */
export type IngestAdapter = {
  /** CLI name: lowercase letters, digits and dashes (e.g. `import`). */
  name: string;
  /** One line shown in `workers ingest --help`. */
  description: string;
  ingest: (options: IngestOptions) => Promise<IngestResult>;
};

/**
 * Shape of a module listed in `BASKETGAP_INGEST_PLUGINS`: a named `adapters`
 * export, or a default export carrying `adapters`. See docs/ingest-adapters.md.
 */
export type IngestPlugin = {
  adapters: readonly IngestAdapter[];
};
