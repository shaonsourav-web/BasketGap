import { createHash } from 'node:crypto';

function dailySalt(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function hashId(value: string | null | undefined, date = new Date()): string {
  if (!value) return 'anon';
  return createHash('sha256')
    .update(`${dailySalt(date)}:${value}`)
    .digest('hex')
    .slice(0, 16);
}
