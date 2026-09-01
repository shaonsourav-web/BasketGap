import * as Sentry from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  init: vi.fn(),
}));

describe('observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('keeps Sentry as a no-op when no DSN is configured', async () => {
    const { captureException, initObservability } = await import('../lib/observability.ts');

    initObservability({ dsn: '' });
    captureException(new Error('expected test error'));

    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('captures exceptions after Sentry is initialized with a DSN', async () => {
    const { captureException, initObservability } = await import('../lib/observability.ts');

    initObservability({ dsn: 'https://public@example.invalid/1', environment: 'test' });
    captureException(new Error('expected test error'));

    expect(Sentry.init).toHaveBeenCalledOnce();
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });
});
