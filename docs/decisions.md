# Decisions Log

## 2026-05-11
- Name: BasketGap (one word, no space)
- Platform: iOS first, Android 2-4 weeks later
- Stack: React Native via Expo, Supabase, Vercel, GPT-4o mini primary
- v1 scope: type/paste input only, no photos, no member pricing toggle
- Refresh: nightly baseline + targeted as needed

## 2026-05-16

- **v1 scope expanded to include Down Down (Coles) and Prices Dropped (Woolworths) web surfaces.**
  Previously v1 was catalogue-PDF-only. Adding the always-current web "specials" pages closes a credibility gap (PDFs miss thousands of currently-active reductions). Architecture stays additive: PDF adapter is primary per retailer; web adapter runs daily and writes into the same `specials` table via a `source_type` discriminator. Accepts a softer legal posture than PDFs (public web pages vs. distributed marketing material) — mitigated by browser-like requests, slow pacing, respect for robots.txt.

- **ALDI deferred to v1.1.**
  v1 covers Coles and Woolworths only. ALDI weekly catalogues and Special Buys are noted in `catalogue-research-notes.md` but are not in scope until after v1 ships. Reason: narrower v1 ships faster and lets the matching engine mature against two retailers before adding a third with different cadence and category mix.

- **Refresh cadence changed from "nightly baseline + targeted refresh" to source-specific schedules.**
  - Catalogue PDFs: polled Wednesdays every 30 minutes, 3am–6pm Sydney, until a new catalogue is detected and successfully ingested. If 6pm Wednesday passes with no new catalogue, an alert fires.
  - Down Down / Prices Dropped web: daily ingestion (single run; cadence TBD when the web adapter round is planned).
  Reason: catalogue PDFs publish on a known weekly cadence — nightly polling wasted budget. Web Down Downs change continuously, so daily is the right granularity.

- **Full DB schema (six tables) delivered in one round instead of fragmenting across multiple rounds.**
  `catalogues`, `specials`, `canonical_products`, `retailer_skus`, `zones`, `price_observations` all created in the initial migration. Schema migrations are cheap; consolidating avoids a second schema round before the matching engine. Trade-off: design choices for canonical-product and SKU-bridge tables may need a follow-up migration once matching engine reveals edge cases. Accepted.
