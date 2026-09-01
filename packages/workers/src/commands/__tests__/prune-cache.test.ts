import { describe, expect, it } from 'vitest';

import { parseArgs } from '../prune-cache.ts';

describe('prune-cache arg parsing', () => {
  it('defaults to 90 days / 200000 rows', () => {
    expect(parseArgs([])).toEqual({ maxAgeDays: 90, maxRows: 200_000 });
  });

  it('reads --max-age-days and --max-rows', () => {
    expect(parseArgs(['--max-age-days', '30', '--max-rows', '5000'])).toEqual({
      maxAgeDays: 30,
      maxRows: 5000,
    });
  });

  it('ignores non-numeric, zero and negative values', () => {
    expect(parseArgs(['--max-age-days', 'abc', '--max-rows', '0'])).toEqual({
      maxAgeDays: 90,
      maxRows: 200_000,
    });
    expect(parseArgs(['--max-age-days', '-7'])).toEqual({
      maxAgeDays: 90,
      maxRows: 200_000,
    });
  });

  it('ignores unknown flags and a trailing flag with no value', () => {
    expect(parseArgs(['--verbose', '--max-rows'])).toEqual({
      maxAgeDays: 90,
      maxRows: 200_000,
    });
  });
});
