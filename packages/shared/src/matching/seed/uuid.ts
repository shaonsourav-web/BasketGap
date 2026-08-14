import { createHash } from 'node:crypto';

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
