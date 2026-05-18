import { createHash } from 'node:crypto';

export function hashCleanedInput(cleaned: string): string {
  return createHash('sha256').update(cleaned, 'utf8').digest('hex');
}
