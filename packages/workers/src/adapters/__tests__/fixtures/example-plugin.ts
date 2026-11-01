import type { IngestAdapter } from '../../_shared/types.ts';

/** A minimal plugin module, loaded through a real dynamic import by registry.test.ts. */
export const adapters: IngestAdapter[] = [
  {
    name: 'example-plugin',
    description: 'Test-only adapter from a file-path plugin.',
    ingest: async () => {
      throw new Error('example-plugin is a test fixture and ingests nothing');
    },
  },
];
