# Ingest adapters

`workers ingest <adapter>` turns a source (a file, or a URL for adapters that
support one) into a catalogue plus its specials, then upserts them keyed on the
SHA-256 of the source bytes. Re-ingesting identical bytes is a no-op unless
`--force-refresh` is passed. `--dry-run` parses only and never reads
`DATABASE_URL`.

This repository ships one adapter, `import`, which reads a local file in the
documented format below. Retailer-specific adapters (scrapers, catalogue
parsers) are **not** part of this repository; they plug in from outside through
`BASKETGAP_INGEST_PLUGINS` (see [Plugins](#plugins)). With no plugin installed
the CLI says so and lists what is available:

```text
$ pnpm --filter @basketgap/workers exec tsx src/cli.ts ingest some-retailer --file x
Unknown adapter: some-retailer

No ingest plugins are installed (BASKETGAP_INGEST_PLUGINS is not set).
...
```

## The `import` adapter

```bash
pnpm --filter @basketgap/workers exec tsx src/cli.ts ingest import \
  --file examples/import/specials.example.json --dry-run
```

`--file` takes a path to a `.json` or `.csv` file (`--fixture` is an alias).
`--source-url` is refused: this adapter never touches the network. Only
contribute data you are entitled to share — for example prices you typed up
yourself from a printed catalogue, or a feed whose licence allows it.

Synthetic examples, used by the tests, live in
`packages/workers/examples/import/`.

### JSON

```json
{
  "format": "basketgap-specials",
  "version": 1,
  "retailer": "coles",
  "sourceType": "pdf",
  "sourceLabel": "my-week-45-entry",
  "validFrom": "2026-11-04",
  "validTo": "2026-11-10",
  "specials": [{ "productName": "Sample Wholemeal Bread 700g", "specialPrice": 3.0 }]
}
```

| Field         | Required | Meaning                                                                     |
| ------------- | -------- | --------------------------------------------------------------------------- |
| `format`      | yes      | Always `"basketgap-specials"`.                                              |
| `version`     | yes      | Always `1`.                                                                 |
| `retailer`    | yes      | `coles` or `woolworths` (the retailers the database accepts).               |
| `sourceType`  | yes      | Where the prices were published: `pdf` (printed/PDF catalogue) or `web`.    |
| `sourceLabel` | no       | Free-text label; defaults to `import:<file name>`.                          |
| `validFrom`   | no       | `YYYY-MM-DD`, first day the prices apply.                                   |
| `validTo`     | no       | `YYYY-MM-DD`, last day; must not be before `validFrom`.                     |
| `specials`    | yes      | Non-empty array of specials (below). Unknown top-level fields are an error. |

Each special:

| Field            | Required | Meaning                                                                                                                                                           |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `productName`    | yes      | Name as printed. A trailing size (`700g`, `2L`, `12 pack`) is used if no size is given.                                                                           |
| `specialPrice`   | yes      | Dollars, > 0. Rounded to cents.                                                                                                                                   |
| `regularPrice`   | no       | Dollars, ≥ `specialPrice`. Savings amount and percent are computed from it, never supplied.                                                                       |
| `brand`          | no       | Brand as printed.                                                                                                                                                 |
| `sizeText`       | no       | Pack size as printed; parsed for the unit size when `unitSizeValue`/`unitSizeUom` are absent.                                                                     |
| `unitSizeValue`  | no       | Positive number. Give together with `unitSizeUom`.                                                                                                                |
| `unitSizeUom`    | no       | `g`, `kg`, `ml`, `L`, `pack` or `each`.                                                                                                                           |
| `promoType`      | no       | `standard`, `half_price`, `down_down`, `prices_dropped`, `percent_off`, `multi_buy`, `unknown`. Defaults to `multi_buy` when `multiBuy` is true, else `standard`. |
| `promoLabel`     | no       | Promo text as printed (`1/2 Price`, `2 for $5`).                                                                                                                  |
| `multiBuy`       | no       | Boolean; defaults to `promoType == "multi_buy"`.                                                                                                                  |
| `isMemberLocked` | no       | `true` rejects the row: v1 has no member pricing, the same rule every catalogue parser applies.                                                                   |
| `retailerSku`    | no       | The retailer's product code, if printed. `enrich-skus` keys on it when present.                                                                                   |
| `sourcePage`     | no       | Positive integer page number.                                                                                                                                     |

### CSV

One header row, then one row per special. Column names are the JSON field
names in snake_case (`product_name`, `special_price`, `is_member_locked`, …).
`retailer`, `source_type`, `product_name` and `special_price` columns are
required. The catalogue-level columns (`retailer`, `source_type`,
`source_label`, `valid_from`, `valid_to`) repeat on every row and must be
identical on all of them; a file mixing two catalogues is rejected rather than
merged. Empty cells mean "absent"; prices may carry a leading `$`; booleans are
`true/false`, `yes/no` or `1/0`. Standard CSV quoting applies (`"Coffee, Dark"`,
`""` for a literal quote), and a UTF-8 BOM from spreadsheet exports is ignored.

### Validation

- **File-level problems throw** and nothing is written: bad JSON, wrong
  `format`/`version`, unknown fields or columns, a missing required column, an
  invalid retailer/source type/date, CSV catalogue columns that disagree, or no
  valid rows at all.
- **Row-level problems skip the row** with a warning naming it
  (`specials[3]: …` or `line 7: …`), printed to stderr and counted in the
  summary's `warnings`. The rest of the file still ingests.

### Freshness

The best-price query only serves a special while it is current: its own
`validFrom`/`validTo` when given, otherwise a 14-day window from ingest time
(`OFFER_MAX_AGE_DAYS` in `packages/shared/src/pricing/types.ts`). Undated
imports therefore age out two weeks after they land.

## Plugins

`BASKETGAP_INGEST_PLUGINS` is a comma-separated list of modules. Each entry is
either a file path — absolute, or relative to the CLI's working directory
(`packages/workers` under `pnpm --filter`) — or a package name resolvable from
`@basketgap/workers`. Absolute paths are the reliable choice. The variable is
read from the environment; the `pnpm --filter @basketgap/workers ingest` script
also loads it from `.env.local`.

A plugin module exports its adapters, either as a named export or on the
default export:

```ts
import { finishIngest, loadFromFixture, type IngestAdapter } from '@basketgap/workers/adapter-kit';

export const adapters: IngestAdapter[] = [
  {
    name: 'my-source', // lowercase letters, digits, dashes
    description: 'One line for `workers ingest --help`.',
    ingest: async (options) => {
      const source = await loadFromFixture(options.fixturePath!);
      const parsed = myParse(source); // -> ParsedCatalogue
      return finishIngest(parsed, options, { adapter: 'my-source', source: source.value });
    },
  },
];
```

`@basketgap/workers/adapter-kit` exports the adapter types, `assertSingleSource`,
`finishIngest` (dry-run short-circuit + transactional upsert), `persistCatalogue`,
`loadFromFixture` and `sha256`. A plugin that fails to load, or an adapter whose
name collides with one already registered (built-ins always win), is reported on
stderr and skipped; the remaining adapters stay usable.
