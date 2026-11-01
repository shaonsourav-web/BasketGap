import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { CatalogueSource } from '../../_shared/types.ts';
import { parseImportCsv, parseImportJson } from '../parse.ts';

const EXAMPLES = fileURLToPath(new URL('../../../../examples/import/', import.meta.url));

const source: CatalogueSource = {
  kind: 'fixture',
  value: 'import://test',
  fetchedAt: new Date(),
  bytes: new Uint8Array(),
  hash: 'f'.repeat(64),
};

const VALID_ROW = { productName: 'Test Oats 1kg', specialPrice: 4 };

function jsonDoc(
  overrides: Record<string, unknown> = {},
  specials: unknown[] = [VALID_ROW],
): string {
  return JSON.stringify({
    format: 'basketgap-specials',
    version: 1,
    retailer: 'coles',
    sourceType: 'web',
    specials,
    ...overrides,
  });
}

const CSV_HEAD = 'retailer,source_type,product_name,special_price,regular_price';

const jsonExample = await readFile(`${EXAMPLES}specials.example.json`, 'utf8');
const csvExample = await readFile(`${EXAMPLES}specials.example.csv`, 'utf8');

describe('import parser — JSON example', () => {
  const parsed = parseImportJson(jsonExample, source, 'import:specials.example.json');

  it('reads the catalogue header', () => {
    expect(parsed.retailer).toBe('coles');
    expect(parsed.sourceType).toBe('pdf');
    expect(parsed.sourceLabel).toBe('synthetic-example-week');
    expect(parsed.sourceUrl).toBe('import://test');
    expect(parsed.sourceHash).toBe('f'.repeat(64));
    expect(parsed.validFrom?.toISOString()).toBe('2026-11-04T00:00:00.000Z');
    expect(parsed.validTo?.toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(parsed.itemCount).toBe(5);
    expect(parsed.specials).toHaveLength(5);
    expect(parsed.warnings).toEqual([]);
  });

  it('derives size from the name and computes savings', () => {
    const bread = parsed.specials[0]!;
    expect(bread).toMatchObject({
      productName: 'Sample Wholemeal Bread 700g',
      brand: 'SampleBake',
      sizeText: '700g',
      unitSizeValue: 700,
      unitSizeUom: 'g',
      regularPrice: 4.5,
      specialPrice: 3,
      savingsAmount: 1.5,
      savingsPercent: 33.33,
      promoType: 'standard',
      multiBuy: false,
      isMemberLocked: false,
      retailerSku: null,
      confidenceScore: 1,
    });
  });

  it('prefers sizeText over the name, normalising litres', () => {
    expect(parsed.specials[1]).toMatchObject({
      sizeText: '2L',
      unitSizeValue: 2,
      unitSizeUom: 'L',
      promoType: 'half_price',
      promoLabel: '1/2 Price',
      savingsPercent: 50,
    });
  });

  it('defaults multiBuy from a multi_buy promo and leaves savings null without a regular price', () => {
    expect(parsed.specials[2]).toMatchObject({
      promoType: 'multi_buy',
      multiBuy: true,
      regularPrice: null,
      savingsAmount: null,
      savingsPercent: null,
    });
  });

  it('uses an explicit unit size and keeps the retailer SKU', () => {
    expect(parsed.specials[3]).toMatchObject({
      sizeText: null,
      unitSizeValue: 1,
      unitSizeUom: 'kg',
      retailerSku: 'EXAMPLE-0004',
      savingsAmount: 9,
      savingsPercent: 30,
    });
  });
});

describe('import parser — CSV example', () => {
  const parsed = parseImportCsv(csvExample, source, 'import:specials.example.csv');

  it('parses every row with the same results as the JSON form', () => {
    expect(parsed.retailer).toBe('woolworths');
    expect(parsed.sourceType).toBe('web');
    expect(parsed.sourceLabel).toBe('synthetic-example-week');
    expect(parsed.warnings).toEqual([]);
    expect(parsed.specials.map((special) => special.specialPrice)).toEqual([3, 2, 5, 21, 6]);
  });

  it('strips $ from prices, reads quoted names and boolean words', () => {
    expect(parsed.specials[1]).toMatchObject({ regularPrice: 4, specialPrice: 2 });
    expect(parsed.specials[2]).toMatchObject({ multiBuy: true, promoLabel: '2 for $5' });
    expect(parsed.specials[3]).toMatchObject({
      productName: 'Example Coffee Beans, Dark Roast',
      sizeText: '1kg',
      unitSizeValue: 1,
      unitSizeUom: 'kg',
    });
  });

  it('falls back to the import label when source_label is blank', () => {
    const minimal = parseImportCsv(`${CSV_HEAD}\ncoles,pdf,Test Oats 1kg,4.00,\n`, source, 'dflt');
    expect(minimal.sourceLabel).toBe('dflt');
    expect(minimal.validFrom).toBeNull();
  });
});

describe('import parser — row rejection', () => {
  it('skips bad rows with a labelled warning and keeps the good ones', () => {
    const parsed = parseImportJson(
      jsonDoc({}, [
        { productName: 'Good Item 500g', specialPrice: 2 },
        { productName: 'No Price' },
        { productName: 'Inverted', specialPrice: 5, regularPrice: 4 },
        { productName: 'Free', specialPrice: 0 },
        { productName: 'Bad Promo', specialPrice: 1, promoType: 'bogo' },
        { productName: 'Member Only', specialPrice: 1, isMemberLocked: true },
        { productName: 'Half Size', specialPrice: 1, unitSizeValue: 2 },
        { productName: 'Typo', specialPrice: 1, prise: 2 },
        { productName: 'Misplaced', specialPrice: 1, retailer: 'woolworths' },
        'not an object',
      ]),
      source,
      'x',
    );
    expect(parsed.specials.map((special) => special.productName)).toEqual(['Good Item 500g']);
    expect(parsed.warnings).toEqual([
      'specials[1]: "specialPrice" is required',
      'specials[2]: "regularPrice" is below "specialPrice"',
      'specials[3]: "specialPrice" must be greater than 0',
      expect.stringMatching(/^specials\[4\]: "promoType" must be one of standard, /),
      'specials[5]: member-locked specials are not ingested (v1 has no member pricing)',
      'specials[6]: "unitSizeValue" and "unitSizeUom" must be given together',
      'specials[7]: unknown field(s): prise',
      'specials[8]: catalogue-level field(s) belong at the top level, not on a special: retailer',
      'specials[9]: each special must be a JSON object',
    ]);
  });

  it('warns on a CSV row with the wrong number of fields', () => {
    const parsed = parseImportCsv(`${CSV_HEAD}\ncoles,web,A,1,\ncoles,web,B\n`, source, 'x');
    expect(parsed.specials).toHaveLength(1);
    expect(parsed.warnings).toEqual(['line 3: expected 5 fields, got 3']);
  });

  it('throws when no row survives, quoting the first reason', () => {
    expect(() => parseImportJson(jsonDoc({}, [{ productName: 'x' }]), source, 'x')).toThrow(
      /no valid specials \(1 rejected; first: specials\[0\]: "specialPrice" is required\)/,
    );
  });
});

describe('import parser — file-level errors', () => {
  it.each([
    ['not JSON', '{', /invalid JSON/],
    ['wrong format tag', jsonDoc({ format: 'other' }), /"format" must be "basketgap-specials"/],
    ['wrong version', jsonDoc({ version: 2 }), /unsupported "version" 2/],
    [
      'unknown retailer',
      jsonDoc({ retailer: 'aldi' }),
      /"retailer" must be one of coles, woolworths/,
    ],
    [
      'missing source type',
      jsonDoc({ sourceType: undefined }),
      /"sourceType" must be one of pdf, web/,
    ],
    ['bad date', jsonDoc({ validFrom: '2026-02-30' }), /not a real calendar date/],
    [
      'inverted dates',
      jsonDoc({ validFrom: '2026-11-10', validTo: '2026-11-04' }),
      /"validFrom" is after "validTo"/,
    ],
    ['unknown top-level field', jsonDoc({ extra: 1 }), /unknown top-level field\(s\): extra/],
    ['empty specials', jsonDoc({}, []), /no specials/],
    ['specials not an array', jsonDoc({ specials: {} }), /"specials" must be an array/],
  ])('JSON: %s', (_name, text, error) => {
    expect(() => parseImportJson(text, source, 'x')).toThrow(error);
  });

  it.each([
    [
      'unknown column',
      'retailer,source_type,product_name,special_price,price\n',
      /unknown CSV column\(s\): price/,
    ],
    ['missing column', 'retailer,product_name,special_price\n', /missing column "source_type"/],
    ['duplicate column', `${CSV_HEAD},brand,brand\n`, /"brand" appears twice/],
    ['header only', `${CSV_HEAD}\n`, /header but no rows/],
    [
      'catalogue columns disagree',
      `${CSV_HEAD}\ncoles,web,A,1,\nwoolworths,web,B,1,\n`,
      /"retailer" must be identical on every row \(line 2 has "coles", line 3 has "woolworths"\)/,
    ],
  ])('CSV: %s', (_name, text, error) => {
    expect(() => parseImportCsv(text, source, 'x')).toThrow(error);
  });
});
