/**
 * Public surface for ingest plugins (`@basketgap/workers/adapter-kit`).
 *
 * A plugin module exports `adapters: IngestAdapter[]`; each adapter parses its
 * source into a `ParsedCatalogue` and hands it to `finishIngest`, which owns
 * the dry-run short-circuit and the hash-keyed upsert. See
 * docs/ingest-adapters.md for the loading contract.
 */
export type {
  CatalogueSource,
  IngestAdapter,
  IngestOptions,
  IngestPlugin,
  IngestResult,
  ParsedCatalogue,
  ParsedSpecial,
  RetailerCode,
} from './adapters/_shared/types.ts';
export { assertSingleSource, finishIngest } from './adapters/_shared/pipeline.ts';
export { persistCatalogue } from './adapters/_shared/persist.ts';
export { loadFromFixture, sha256 } from './adapters/_shared/source.ts';
