**Corrected v1 Spec for BasketGap**

Below is the spec with all your tightening applied.  
**What the app does**

A guest-first grocery list comparison app for Australia that helps shoppers see, in seconds, what their shopping list would cost at Coles versus Woolworths today.  
The user opens the app, enters their postcode, types or pastes their shopping list into a clean Notes-style interface, and taps Compare. The app silently parses the list, matches each line to the right products at both retailers in their postcode area, and shows:

* Total at Coles  
* Total at Woolworths  
* The basket difference, stated factually as "Coles lower by $X" or "Woolworths lower by $X"  
* The top 5 items driving the price difference  
* A subtle freshness indicator ("Prices as of \[time\]")  
* Optional: tap to view all matched items  
* Optional: tap to see a split-basket result (cheaper mix across both stores)  
* Optional: a polite, dismissible prompt to help with any items the system couldn't confidently match — explicitly showing how their savings figure could change if they help

The app does not recommend a store. It shows both totals honestly and lets the user decide.  
**What the app does NOT do (in v1)**

* No mandatory login. Postcode only.  
* No accounts required to use the app.  
* No receipts, no photos of lists, no recipes.  
* No social features.  
* No interruptions while typing — the system stays silent until the user taps Compare.  
* No store recommendation, no upselling, no ads.

**Personalisation (v1.1)**

* Every install generates an anonymous device ID; the app silently learns from each match override.  
* Future matches improve for that user without them ever filling out a profile.  
* After 3 successful shops or 3 weeks of use (whichever comes first), the app shows a one-time gentle prompt offering to save preferences via email or Apple/Google sign-in.  
* A persistent "I've used this app before" link on fresh installs lets users restore their preferences on a new phone in under 30 seconds.  
* Stored: shopping preferences only. Not stored: shopping lists, location history, payment information. Marketing emails never sent.

**Brand and tone**

* Calm, polite, light. Never technical, never blaming.  
* Honest about what was matched and what wasn't.  
* Privacy and security treated as launch-blockers, not later-tasks.  
* The product is **narrow, trustworthy, and continuously improving** — not flawless.

**The user flow**

1. Open app. No signup.  
2. Enter postcode (or allow location).  
3. Type or paste shopping list.  
4. Tap Compare.  
5. App parses and matches the list silently in under 2 seconds.  
6. Result screen shows Coles total, Woolworths total, factual basket difference, top 5 difference items.  
7. Optional: tap to see all matched items, split-basket alternative, or help with unmatched items.  
8. (v1.1) The app silently learns preferences for next time.

**One-line definition**

A guest-first grocery comparison app for Australia that turns a typed or pasted shopping list into Coles and Woolworths totals with the top 5 price-difference items, optional split-basket savings, and zero friction.  
**Architecture**

**Layer 1 — Retailer Source Layer**

Pluggable adapters that fetch raw product and price data from each retailer. Built so that any source can be swapped out without rebuilding the rest of the app.  
For v1:

* ColesPrimaryAdapter  
* ColesFallbackAdapter  
* WoolworthsPrimaryAdapter  
* WoolworthsFallbackAdapter

Adapters drop raw observations into an ingestion queue rather than writing directly downstream.  
**Refresh philosophy (internal):**

* Nightly baseline refresh of all products in active store zones.  
* Targeted refresh for trending or recently-changed items (high recent query volume, items that have just gone on special).  
* Stale-data refresh — any record older than a defined freshness threshold triggers a fresh fetch when queried.  
* User-facing promise stays simple: "refreshed daily, with timestamp shown."

Future adapters (planned, not in v1):

* ReceiptValidationAdapter  
* ManualObservationAdapter  
* FutureOfficialFeedAdapter (for the ACCC-mandated API if it becomes available)

**Layer 2 — Normalisation Layer**

Standardises raw retailer data into one internal format.  
Components:

* **Canonical product mapping** — every Coles SKU and Woolworths SKU points to one canonical product ID. The foundational asset.  
* **Promo normalisation** — different retailer promo formats mapped to one schema; only applied when the user's list qualifies.  
* **Store mapping** — postcodes resolved to specific stores and price zones.  
* **Unit-price calculation** — $/kg, $/L, $/100g calculated for every product.  
* **Freshness scoring** — how stale each data point is.

**Layer 3 — Input Intelligence Layer**

Turns user input into structured grocery intent. **Deterministic first, LLM second.**  
Pipeline, in order:

1. **Cleaning** (deterministic) — lowercase, strip punctuation, normalise units (l/lt/litres → L, kg/kgs/kilos → kg).  
2. **Spelling correction** (deterministic) — typo dictionary tuned to grocery vocabulary.  
3. **Shorthand resolution** (deterministic) — Australian grocery dictionary (snags → sausages, bickies → biscuits, chook → chicken). Grows from real user signals.  
4. **Quantity and size extraction** (deterministic) — regex on numbers and units, normalising "1 doz" → 12, "24 pack" → 24, etc.  
5. **Direct catalogue lookup** (deterministic) — exact and near-exact matching against canonical catalogue. Most well-formed lines resolve here.  
6. **Vector search** (deterministic semantic match) — for inputs where direct lookup fails. Handles passata vs tomato puree, snags vs sausages.  
7. **Ranking** — top candidates scored on text similarity, attribute match, size match, popularity, price reasonableness.  
8. **LLM fallback** — only fires when deterministic confidence is low. Used to disambiguate genuinely vague input or unusual phrasing. Expected to be triggered on a small minority of lines (\~10–15% in practice).  
9. **Cache** — every cleaned input string is cached globally so repeat phrases don't re-trigger the pipeline. Postcode-independent.  
10. **Personalisation re-ranker** (v1.1) — user preferences applied as a final tie-breaker. Doesn't override the matcher; just resolves ties in the user's favour.

This ordering means most lines never touch the LLM. Speed is fast (milliseconds per line, batched across the list), cost is low, and matches are debuggable step by step.  
**Layer 4 — Serving Layer**

Produces the user-facing result.  
Components:

* **Current price table** — latest usable prices by retailer, store zone, and SKU. Refreshed nightly with targeted updates as needed.  
* **Historical price table** — older prices for fallback, validation, future trend features.  
* **Confidence engine** — judges whether each interpreted line is clear enough to trust. Internal states: matched, assumed, needs attention.  
* **Compare engine** — calculates Coles total, Woolworths total, factual basket difference, top 5 difference items.  
* **Split basket engine** — optional. Computes the cheaper mixed basket across both stores when invoked.

**Identity and personalisation (v1.1)**

Three tables:

* **Devices** — every install gets a device ID, generated locally on first launch.  
* **Accounts** — created only when the user opts in via email or Apple/Google. Optional.  
* **Preferences** — always tagged to a device ID; optionally linked to an account.

When a user signs in, the existing device ID links to the account. When they sign in on a new phone, the new device ID also links to the same account and preferences sync down. Multiple device IDs can belong to one account.  
**Security and privacy**

* All sensitive logic stays server-side.  
* Mobile app treated as untrusted.  
* Secrets never ship in the mobile binary.  
* Stored: shopping preferences (anonymous by default, optionally email-linked).  
* Not stored: shopping lists, location history, payment information.  
* One-tap deletion of saved preferences from settings.  
* No marketing emails, ever.  
* If strong user-data protection cannot be achieved, the app does not ship.

**End-to-end data flow**

Source adapters pull product and price data from Coles and Woolworths on the refresh schedule and drop raw observations into an ingestion queue. The normalisation layer consumes the queue, maps products to canonical IDs, calculates unit prices, and writes to the current price table (with previous versions archived to historical).  
At request time: user pastes a list, the input intelligence layer runs the deterministic pipeline first, falling back to the LLM only on low-confidence lines. Matched canonical IDs go to the compare engine, which fetches current prices for both retailers in the user's store zone, applies eligible promotions, sums totals, and ranks the top 5 difference drivers. Result returns to the app in under 2 seconds for a typical 25-item list.  
**Non-negotiables**

* No mandatory login.  
* No interruptions while typing.  
* Basket difference shown factually ("Coles lower by $X"), never as a recommendation.  
* Promotions applied only when the user's list qualifies.  
* Prices refreshed daily; freshness shown to user.  
* Out-of-stock items reported honestly **when verifiable** — never invented.  
* Privacy and security treated as launch-blockers.  
* The app stays narrow, trustworthy, and continuously improving.

