import { createHash } from 'node:crypto';

import type { SeedEntry } from './canonical-seed.ts';

export function deterministicUuid(...parts: Array<string | null | undefined>): string {
  const joined = parts.map((p) => (p ?? '').toLowerCase().trim()).join('|');
  const hex = createHash('sha256').update(joined, 'utf8').digest('hex').slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * The canonical id of a seed entry. Single definition on purpose: the worker
 * that seeds the live catalogue and the offline eval catalogue must derive the
 * same id from the same entry, or the eval scores a catalogue the engine will
 * never see. Changing the field list re-ids the whole catalogue.
 */
export function canonicalSeedId(entry: SeedEntry): string {
  return deterministicUuid(
    entry.name,
    entry.brand,
    entry.category,
    entry.unitSizeUom ?? '',
    String(entry.unitSizeValue ?? ''),
  );
}
