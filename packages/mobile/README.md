# @basketgap/mobile

The BasketGap iOS/Android app: Expo (SDK 57) + expo-router + TypeScript.

The default is a **deterministic offline mock** with synthetic sample data.
To use catalogue offers, start the app with these public settings (example for
the iOS Simulator with the standalone API on the same Mac):

```bash
EXPO_PUBLIC_BASKETGAP_LIVE_OFFERS=true \
EXPO_PUBLIC_BASKETGAP_API_URL=http://localhost:3000 \
pnpm --filter @basketgap/mobile ios
```

Start the API separately against a database with imported and enriched offers.
The API origin is bundled with the app. Keep keys and database credentials on
the server. A physical device needs an API origin it can reach.

The results display catalogue promotions and the oldest source timestamp
behind the displayed prices. An explicit leading count multiplies the unit
offer. Ambiguous pack quantities, member offers and multibuy deals are left
unpriced. Both totals cover the same lines. An offers service failure stays
on the list screen with a retry message, and sample results remain labelled.

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter @basketgap/mobile start
```

Then press `i` in the Expo CLI to open the iOS Simulator (`a` for Android, `w`
for web). Or go straight there:

```bash
pnpm --filter @basketgap/mobile ios
```

If the simulator reports "could not connect to the development server", Metro
has bound to IPv6 loopback only while Expo Go is asking for `127.0.0.1`. Start
it with the hostname pinned instead:

```bash
cd packages/mobile
REACT_NATIVE_PACKAGER_HOSTNAME=localhost pnpm exec expo start --host localhost
xcrun simctl openurl booted "exp://localhost:8081"
```

## Checks

```bash
pnpm --filter @basketgap/mobile typecheck
pnpm --filter @basketgap/mobile lint
pnpm --filter @basketgap/mobile test        # offline checks of the sample catalogue and compare logic
pnpm --filter @basketgap/mobile exec expo export --platform ios   # full Metro bundle
```

## Screens

| Route           | Job                                                                                    |
| --------------- | -------------------------------------------------------------------------------------- |
| `app/index`     | Brand, one line of explanation, postcode (remembered via AsyncStorage)                 |
| `app/list`      | Notes-style list. Silent until Compare — no parsing, no prompts while typing           |
| `app/results`   | Both totals, a plain-view note on what they cover, the difference, top 5 drivers       |
| `app/all-items` | Every line with its confidence band and both retailers' prices, or "No special listed" |
| `app/split`     | Single-store totals against the mixed basket                                           |
| `app/unmatched` | Modal: the lines left out of both totals, dismissible                                  |

## Design rules this app holds to

- **One accent — sky teal.** Coles red and Woolworths green appear only as
  small identity dots next to a store's name. Neither is ever chrome, a
  background, or a highlight, because the app must not read as a nudge
  towards one store.
- **Never recommends.** The headline states the gap as fact ("Coles lower by
  $3.45 on the items counted"), and the split screen ends on "whether that's
  worth it is your call".
- **Says what the total covers.** The results screen shows, in plain view, which
  retailers are compared, that prices come from published catalogue promotions
  only, and that totals cover only items with a listed price at both stores.
- **A missing price is not zero.** If a store lists no special for an item it
  shows "No special listed" and the item is left out of both totals. Lines with
  no special at either store are labelled **Not on special**, quietly; the
  results screen does not nag about "couldn't match".
- **Realistic typing.** Demo lists use `eggs`, `milk`, `snags`, `tp` — not
  catalogue copy. Basket size chips load $50–$300 sample lists built from the
  synthetic catalogue (see `src/mock/SAVINGS.md`).
- Light UI only (`userInterfaceStyle: light`), 8px spacing grid, Outfit for
  the brand and every figure, Plus Jakarta Sans for running text.

## Notes

- Node: this package declares `engines.node >= 24` with no upper bound, unlike
  the other workspace packages (`>=24 <25`). Expo SDK 57 tooling runs fine on
  newer Node and pinning it to 24 would block anyone on a current runtime.
- No secrets, no auth, no analytics ship in this package.
