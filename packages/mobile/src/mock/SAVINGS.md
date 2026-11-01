# Mock data

Everything in this folder is **synthetic demo data**. The products, brands, sizes
and prices in `catalogue-core.ts` are invented for demonstration. They are not
taken from, and do not represent, any retailer's catalogue, website or shelf
prices. Nothing here is a statement about what any store actually charges.

## What the mock models

Each sample product has a promotion price for Coles and for Woolworths, or
`null` when no special is listed at that retailer. `null` means "no price" and is
never treated as zero. The sample set deliberately covers every state the app
has to handle:

| State                                | Counted in the totals? | How it is shown                                               |
| ------------------------------------ | ---------------------- | ------------------------------------------------------------- |
| Special listed at both retailers     | Yes                    | Both prices, lower side highlighted                           |
| Special listed at one retailer only  | No                     | The listed price, and "No special listed" for the other store |
| No special listed at either retailer | No                     | "Not on special"                                              |
| Word that matches no product         | No                     | "Not on special"                                              |

Totals only cover items with a listed price at both retailers, so they compare
like with like. The split-basket figure uses the same items.

## Sample baskets

`scenarios.ts` holds six hand-written shopping lists labelled $50 to $300. They
are roughly sized to their label using the sample prices and are only there to
exercise the screens. The gaps they produce say nothing about real-world
savings.

## What this data does not claim

- That either chain is cheaper in general, or on any real shop.
- That every typed line will be priced. A line with no listed special is left
  out of the totals and labelled as such.
- Anything about live accuracy. The mock is a stand-in for the `/api/match`
  endpoint, which this package does not call yet.

## Verify

```bash
pnpm --filter @basketgap/mobile test               # catalogue, matching and missing-price checks
pnpm --filter @basketgap/mobile verify:scenarios   # sample basket totals
```
