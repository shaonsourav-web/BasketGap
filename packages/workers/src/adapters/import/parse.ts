import type {
  CatalogueSource,
  ParsedCatalogue,
  ParsedSpecial,
  RetailerCode,
} from '../_shared/types.ts';

import { readCsv } from './csv.ts';

/**
 * The retailer-neutral import format (docs/ingest-adapters.md). Contributors
 * supply specials they are entitled to share — typed from a printed catalogue,
 * exported from a licensed feed, or synthetic — and nothing here fetches
 * anything from a retailer.
 */
export const IMPORT_FORMAT = 'basketgap-specials';
export const IMPORT_VERSION = 1;

const RETAILERS: readonly RetailerCode[] = ['coles', 'woolworths'];
const SOURCE_TYPES: readonly ParsedCatalogue['sourceType'][] = ['pdf', 'web'];
const PROMO_TYPES: readonly ParsedSpecial['promoType'][] = [
  'standard',
  'half_price',
  'down_down',
  'prices_dropped',
  'percent_off',
  'multi_buy',
  'unknown',
];
const UOMS: readonly NonNullable<ParsedSpecial['unitSizeUom']>[] = [
  'g',
  'kg',
  'ml',
  'L',
  'pack',
  'each',
];

/** Row-level fields, in the order they are documented. */
const ROW_FIELDS = [
  'productName',
  'brand',
  'sizeText',
  'unitSizeValue',
  'unitSizeUom',
  'regularPrice',
  'specialPrice',
  'promoType',
  'promoLabel',
  'multiBuy',
  'isMemberLocked',
  'retailerSku',
  'sourcePage',
] as const;

/** Catalogue-level fields; in CSV they repeat on every row and must agree. */
const CATALOGUE_FIELDS = ['retailer', 'sourceType', 'sourceLabel', 'validFrom', 'validTo'] as const;

const SIZE = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|pk|pack|ea|each)\b/i;

type CatalogueHeader = {
  retailer: RetailerCode;
  sourceType: ParsedCatalogue['sourceType'];
  sourceLabel: string | null;
  validFrom: Date | null;
  validTo: Date | null;
};

type FieldValue = unknown;
type RowRecord = Record<string, FieldValue>;
type Row = { label: string; record: RowRecord | null };
type Fail = (message: string) => never;

class RowError extends Error {}

export function parseImportJson(
  text: string,
  source: CatalogueSource,
  defaultLabel: string,
): ParsedCatalogue {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new Error(`import: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!isRecord(doc)) throw new Error('import: top level must be a JSON object');
  if (doc.format !== IMPORT_FORMAT) {
    throw new Error(`import: "format" must be "${IMPORT_FORMAT}"`);
  }
  if (doc.version !== IMPORT_VERSION) {
    throw new Error(
      `import: unsupported "version" ${JSON.stringify(doc.version)} (expected ${IMPORT_VERSION})`,
    );
  }
  const unknown = Object.keys(doc).filter(
    (key) =>
      key !== 'format' &&
      key !== 'version' &&
      key !== 'specials' &&
      !(CATALOGUE_FIELDS as readonly string[]).includes(key),
  );
  if (unknown.length > 0)
    throw new Error(`import: unknown top-level field(s): ${unknown.join(', ')}`);

  const header = readCatalogueHeader(doc, 'import');
  if (!Array.isArray(doc.specials)) throw new Error('import: "specials" must be an array');

  const rows: Row[] = doc.specials.map((row: unknown, index: number) => ({
    label: `specials[${index}]`,
    record: isRecord(row) ? row : null,
  }));
  return buildCatalogue(header, rows, source, defaultLabel, { catalogueFieldsInRows: false });
}

export function parseImportCsv(
  text: string,
  source: CatalogueSource,
  defaultLabel: string,
): ParsedCatalogue {
  const table = readCsv(text);
  const known = new Map<string, string>(
    [...CATALOGUE_FIELDS, ...ROW_FIELDS].map((field) => [toSnake(field), field]),
  );
  const columns = table.header.map((name) => name.trim().toLowerCase());
  const unknown = columns.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new Error(
      `import: unknown CSV column(s): ${unknown.join(', ')} (known: ${[...known.keys()].join(', ')})`,
    );
  }
  const duplicate = columns.find((name, i) => columns.indexOf(name) !== i);
  if (duplicate) throw new Error(`import: CSV column "${duplicate}" appears twice`);
  for (const required of ['retailer', 'source_type', 'product_name', 'special_price']) {
    if (!columns.includes(required)) throw new Error(`import: CSV is missing column "${required}"`);
  }
  if (table.records.length === 0) throw new Error('import: CSV has a header but no rows');

  const rows: { label: string; record: RowRecord }[] = [];
  const badShape: string[] = [];
  for (const { line, fields } of table.records) {
    if (fields.length !== columns.length) {
      badShape.push(`line ${line}: expected ${columns.length} fields, got ${fields.length}`);
      continue;
    }
    const record: RowRecord = {};
    columns.forEach((column, i) => {
      record[known.get(column)!] = fields[i]!;
    });
    rows.push({ label: `line ${line}`, record });
  }

  // Catalogue-level columns repeat on every row; a disagreement means two
  // catalogues were pasted into one file, which must not be merged silently.
  const first = rows[0];
  if (!first) throw new Error(`import: no usable CSV rows (${badShape.join('; ')})`);
  for (const field of CATALOGUE_FIELDS) {
    const expected = first.record[field] ?? '';
    const clash = rows.find((row) => (row.record[field] ?? '') !== expected);
    if (clash) {
      throw new Error(
        `import: column "${toSnake(field)}" must be identical on every row (${first.label} has ` +
          `${JSON.stringify(expected)}, ${clash.label} has ${JSON.stringify(clash.record[field] ?? '')})`,
      );
    }
  }

  const header = readCatalogueHeader(first.record, 'import (CSV)');
  const parsed = buildCatalogue(header, rows, source, defaultLabel, {
    catalogueFieldsInRows: true,
  });
  parsed.warnings.unshift(...badShape);
  return parsed;
}

function buildCatalogue(
  header: CatalogueHeader,
  rows: Row[],
  source: CatalogueSource,
  defaultLabel: string,
  options: { catalogueFieldsInRows: boolean },
): ParsedCatalogue {
  if (rows.length === 0) throw new Error('import: file contains no specials');

  const specials: ParsedSpecial[] = [];
  const warnings: string[] = [];
  for (const { label, record } of rows) {
    try {
      specials.push(normaliseRow(record, options.catalogueFieldsInRows));
    } catch (err) {
      if (!(err instanceof RowError)) throw err;
      warnings.push(`${label}: ${err.message}`);
    }
  }
  if (specials.length === 0) {
    throw new Error(
      `import: no valid specials (${warnings.length} rejected; first: ${warnings[0] ?? 'n/a'})`,
    );
  }

  return {
    retailer: header.retailer,
    sourceType: header.sourceType,
    sourceLabel: header.sourceLabel ?? defaultLabel,
    sourceUrl: source.value,
    sourceHash: source.hash,
    validFrom: header.validFrom,
    validTo: header.validTo,
    itemCount: specials.length,
    pageCount: 1,
    specials,
    warnings,
  };
}

function readCatalogueHeader(record: RowRecord, where: string): CatalogueHeader {
  const fail: Fail = (message) => {
    throw new Error(`${where}: ${message}`);
  };
  const retailer = optionalString(record.retailer, 'retailer', fail);
  if (!retailer || !(RETAILERS as readonly string[]).includes(retailer)) {
    fail(`"retailer" must be one of ${RETAILERS.join(', ')}`);
  }
  const sourceType = optionalString(record.sourceType, 'sourceType', fail);
  if (!sourceType || !(SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    fail(`"sourceType" must be one of ${SOURCE_TYPES.join(', ')}`);
  }
  const validFrom = optionalDate(record.validFrom, 'validFrom', fail);
  const validTo = optionalDate(record.validTo, 'validTo', fail);
  if (validFrom && validTo && validFrom.getTime() > validTo.getTime()) {
    fail('"validFrom" is after "validTo"');
  }
  return {
    retailer: retailer as RetailerCode,
    sourceType: sourceType as ParsedCatalogue['sourceType'],
    sourceLabel: optionalString(record.sourceLabel, 'sourceLabel', fail),
    validFrom,
    validTo,
  };
}

function normaliseRow(record: RowRecord | null, catalogueFieldsInRows: boolean): ParsedSpecial {
  const fail: Fail = (message) => {
    throw new RowError(message);
  };
  if (!record) return fail('each special must be a JSON object');

  const misplaced = Object.keys(record).filter((key) =>
    (CATALOGUE_FIELDS as readonly string[]).includes(key),
  );
  if (misplaced.length > 0 && !catalogueFieldsInRows) {
    fail(
      `catalogue-level field(s) belong at the top level, not on a special: ${misplaced.join(', ')}`,
    );
  }
  const unknown = Object.keys(record).filter(
    (key) =>
      !(ROW_FIELDS as readonly string[]).includes(key) &&
      !(CATALOGUE_FIELDS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) fail(`unknown field(s): ${unknown.join(', ')}`);

  const productName = optionalString(record.productName, 'productName', fail);
  if (!productName) fail('"productName" is required');

  const specialPrice = optionalPrice(record.specialPrice, 'specialPrice', fail);
  if (specialPrice === null) fail('"specialPrice" is required');
  const regularPrice = optionalPrice(record.regularPrice, 'regularPrice', fail);
  if (regularPrice !== null && regularPrice < specialPrice) {
    fail('"regularPrice" is below "specialPrice"');
  }

  const sizeText = optionalString(record.sizeText, 'sizeText', fail);
  const size = resolveSize(record, sizeText ?? productName, fail);

  const promoTypeRaw = optionalString(record.promoType, 'promoType', fail);
  if (promoTypeRaw && !(PROMO_TYPES as readonly string[]).includes(promoTypeRaw)) {
    fail(`"promoType" must be one of ${PROMO_TYPES.join(', ')}`);
  }
  const multiBuy = optionalBoolean(record.multiBuy, 'multiBuy', fail);
  const promoType = (promoTypeRaw ??
    (multiBuy ? 'multi_buy' : 'standard')) as ParsedSpecial['promoType'];

  // Same precision-first rule as every catalogue parser: v1 has no member
  // pricing, so a member-only price is skipped rather than shown as the price.
  if (optionalBoolean(record.isMemberLocked, 'isMemberLocked', fail)) {
    fail('member-locked specials are not ingested (v1 has no member pricing)');
  }

  const sourcePage = optionalNumber(record.sourcePage, 'sourcePage', fail);
  if (sourcePage !== null && (!Number.isInteger(sourcePage) || sourcePage < 1)) {
    fail('"sourcePage" must be a positive integer');
  }

  const savingsAmount =
    regularPrice !== null && regularPrice > specialPrice
      ? round2(regularPrice - specialPrice)
      : null;
  const savingsPercent =
    savingsAmount !== null && regularPrice ? round2((savingsAmount / regularPrice) * 100) : null;

  return {
    productName,
    brand: optionalString(record.brand, 'brand', fail),
    sizeText: sizeText ?? size.text,
    unitSizeValue: size.value,
    unitSizeUom: size.uom,
    regularPrice,
    specialPrice,
    savingsAmount,
    savingsPercent,
    promoType,
    promoLabel: optionalString(record.promoLabel, 'promoLabel', fail),
    multiBuy: multiBuy ?? promoType === 'multi_buy',
    isMemberLocked: false,
    retailerSku: optionalString(record.retailerSku, 'retailerSku', fail),
    sourcePage,
    rawText: JSON.stringify(record),
    // Structured input is explicit, not inferred from layout, so there is no
    // parse uncertainty to discount.
    confidenceScore: 1,
  };
}

function resolveSize(
  record: RowRecord,
  fallbackText: string,
  fail: Fail,
): { text: string | null; value: number | null; uom: ParsedSpecial['unitSizeUom'] } {
  const value = optionalNumber(record.unitSizeValue, 'unitSizeValue', fail);
  const uomRaw = optionalString(record.unitSizeUom, 'unitSizeUom', fail);
  if ((value === null) !== (uomRaw === null)) {
    fail('"unitSizeValue" and "unitSizeUom" must be given together');
  }
  if (value !== null && uomRaw !== null) {
    if (value <= 0) fail('"unitSizeValue" must be positive');
    const uom = normaliseUom(uomRaw);
    if (!uom) fail(`"unitSizeUom" must be one of ${UOMS.join(', ')}`);
    return { text: null, value, uom };
  }
  const match = fallbackText.match(SIZE);
  if (!match) return { text: null, value: null, uom: null };
  return {
    text: match[0],
    value: Number.parseFloat(match[1]!),
    uom: normaliseUom(match[2]!),
  };
}

function normaliseUom(raw: string): ParsedSpecial['unitSizeUom'] {
  const lower = raw.trim().toLowerCase();
  if (lower === 'g' || lower === 'kg' || lower === 'ml') return lower;
  if (lower === 'l') return 'L';
  if (lower === 'pack' || lower === 'pk') return 'pack';
  if (lower === 'each' || lower === 'ea') return 'each';
  return null;
}

// Field readers accept JSON-typed values and CSV strings alike. An empty
// string (an empty CSV cell) means "absent".

function optionalString(value: FieldValue, name: string, fail: Fail): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return fail(`"${name}" must be a string`);
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalNumber(value: FieldValue, name: string, fail: Fail): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fail(`"${name}" must be a finite number`);
  }
  if (typeof value !== 'string') return fail(`"${name}" must be a number`);
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return fail(`"${name}" must be a number`);
  return Number.parseFloat(trimmed);
}

/** Dollars. A leading `$` is tolerated (spreadsheets add it); cents are rounded. */
function optionalPrice(value: FieldValue, name: string, fail: Fail): number | null {
  const stripped = typeof value === 'string' ? value.trim().replace(/^\$\s*/, '') : value;
  const amount = optionalNumber(stripped, name, fail);
  if (amount === null) return null;
  if (amount <= 0) fail(`"${name}" must be greater than 0`);
  return round2(amount);
}

function optionalBoolean(value: FieldValue, name: string, fail: Fail): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fail(`"${name}" must be true or false`);
  const lower = value.trim().toLowerCase();
  if (lower === '') return null;
  if (lower === 'true' || lower === 'yes' || lower === '1') return true;
  if (lower === 'false' || lower === 'no' || lower === '0') return false;
  return fail(`"${name}" must be true or false`);
}

/** `YYYY-MM-DD`, interpreted as a UTC calendar date (the DB column is `date`). */
function optionalDate(value: FieldValue, name: string, fail: Fail): Date | null {
  const text = optionalString(value, name, fail);
  if (text === null) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return fail(`"${name}" must be a YYYY-MM-DD date`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return fail(`"${name}" is not a real calendar date`);
  }
  return date;
}

function isRecord(value: unknown): value is RowRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSnake(field: string): string {
  return field.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
