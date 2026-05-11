# iOS Approval And Security Requirements

Last reviewed: 2026-05-11  
Project: BasketGap  
Scope: iOS-first v1, guest use, postcode + typed/pasted grocery list, Coles/Woolworths price comparison, deterministic matching with LLM fallback.

Apple changes App Review, privacy, age-rating, and SDK disclosure requirements regularly. Re-check the linked Apple pages before every TestFlight external review and before App Store submission.

## Section A — Apple App Store Approval Requirements For BasketGap

### App Review Guidelines Relevant To BasketGap

**What Apple requires:** Apps must be useful, complete, safe, honest in metadata, respectful of privacy, and compliant with intellectual-property rules. The most relevant guidelines for BasketGap are privacy/data use, accurate metadata, copycat/IP restrictions, and third-party sign-in rules. Apple's App Review Guidelines are living rules and were crawled as updated recently during this review ([App Review Guidelines](https://developer.apple.com/appstore/resources/approval/guidelines.html), [App Review overview](https://developer.apple.com/app-store/review/)).

**How BasketGap will comply:** BasketGap must present itself as an independent grocery comparison utility, not as an official Coles or Woolworths product. It must show factual totals and differences only, matching the spec's "no recommendation" stance. It must not exaggerate freshness, coverage, stock status, or savings. If a price is stale or stock status is unverifiable, the app must say so.

**Build work needed:** Add App Store metadata that describes "standard shelf prices" and "prices as of" behavior. Add an in-app About/Legal screen with privacy policy, terms, data freshness explanation, and "not affiliated with Coles or Woolworths" disclaimer. Add review notes explaining how the demo postcode/list works and how price freshness is determined.

### Sign In With Apple

**What Apple requires:** If an app uses a third-party or social login service to create or authenticate the user's primary account, Apple generally requires an equivalent Sign in with Apple option. Apple's own App Review Guidelines call this out under third-party login services ([App Review Guidelines](https://developer.apple.com/appstore/resources/approval/guidelines.html)).

**How BasketGap will comply:** v1 has no account and no mandatory login, so Sign in with Apple is not needed for v1. v1.1 may offer email, Apple, and Google sign-in for preference restore; if Google sign-in or another third-party login is offered, Sign in with Apple must also be offered.

**Build work needed:** For v1, do not add sign-in SDKs. For v1.1, configure Apple Sign In capability, Expo Apple Authentication if using Expo, Supabase Auth Apple provider, App Store Connect service IDs where needed, and account deletion/preference deletion flows.

### Privacy Manifests: `PrivacyInfo.xcprivacy`

**What Apple requires:** Apps and third-party SDKs can include privacy manifest files named `PrivacyInfo.xcprivacy`. Apps must declare collected data and required-reason API use where applicable. Apple documents required-reason API declarations and sends warnings/rejections when required API use is not described ([Apple privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files), [adding a privacy manifest](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk), [required reason API technote](https://developer.apple.com/documentation/technotes/tn3183-adding-required-reason-api-entries-to-your-privacy-manifest)).

**How BasketGap will comply:** BasketGap should include an app-level `PrivacyInfo.xcprivacy` even if Expo/native dependencies include their own manifests. Expected declarations need review once dependencies are final, but likely categories include app functionality analytics/crash data and possibly user defaults/file timestamp APIs used by React Native/Expo/Sentry. No tracking domains should be declared unless a future SDK actually tracks users.

**Build work needed:** Add `PrivacyInfo.xcprivacy` to the iOS target through Expo config/plugin support or native project files after prebuild. Audit every native dependency before submission with Xcode's privacy report. Confirm Sentry, PostHog, Supabase-related code, Expo modules, and React Native dependencies either provide manifests or are covered by the app manifest. Re-check required-reason API categories immediately before submission.

### App Tracking Transparency

**What Apple requires:** ATT permission is required when an app collects end-user data and shares it with other companies for tracking across other companies' apps or websites, ad targeting/measurement, or sharing with data brokers ([Apple User Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/), [ATT framework docs](https://developer.apple.com/documentation/AppTrackingTransparency)).

**How BasketGap will comply:** v1 should not need ATT. BasketGap does not run ads, does not share data with data brokers, and should not track users across apps/websites. Device ID is for anonymous preference continuity and rate limiting, not cross-app tracking. Analytics must be configured without advertising identifiers, cross-app tracking, or data broker sharing.

**Build work needed:** Do not add `NSUserTrackingUsageDescription` or ATT prompt unless a future SDK or business requirement introduces tracking. Disable ad ID collection in analytics SDKs. In App Store Connect privacy answers, do not mark data as "used for tracking" unless that changes.

### Privacy Nutrition Labels

**What Apple requires:** App Store Connect requires self-reported privacy details describing data collected by the app and third-party partners, whether it is linked to the user, and whether it is used for tracking ([App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/), [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)).

**How BasketGap will comply:** Expected v1 label should declare only what is actually collected:

- **Identifiers:** anonymous device ID for rate limiting, preference learning, and abuse prevention. Not used for tracking.
- **Location:** postcode entered by user, and approximate/current location only if optional location permission ships. Prefer postcode entry in v1 to minimize location collection.
- **Usage Data:** coarse analytics events if PostHog or similar is used, such as compare success, latency bucket, unmatched count bucket. Not shopping list content.
- **Diagnostics:** crash/performance data from Sentry or Expo/EAS diagnostics.
- **User Content:** avoid declaring full shopping lists as collected by not storing them and by minimizing server retention. If raw lists are transmitted for comparison, Apple privacy answers may still require disclosure as processed data; this must be reviewed carefully with final implementation and privacy counsel.

**What BasketGap will not declare unless implementation changes:** contacts, photos/videos, precise location history, purchases, payment information, advertising data, health/fitness, sensitive information, or data used for tracking.

**Build work needed:** Maintain a data inventory before TestFlight external review. Configure App Store Connect privacy labels from the inventory. Keep the privacy policy consistent with the labels.

### Minimum iOS Version

**What Apple requires:** Apple allows developers to set a deployment target compatible with the app's SDK/dependencies, but the submitted binary must be built with currently accepted Xcode/App Store tooling. Expo SDK 55 requires modern Node/tooling and new architecture, but final iOS deployment target should be confirmed against Expo's generated native config.

**How BasketGap will comply:** Recommend **iOS 17.0+** as the product baseline for v1 unless Expo SDK 55/56 generated projects or target market analytics justify a different minimum. iOS 17 keeps support broad while avoiding old OS edge cases for privacy manifests, modern Expo modules, and security behavior. If a dependency requires iOS 18+, raise the baseline intentionally.

**Build work needed:** Set `ios.deploymentTarget`/native deployment target through Expo config. Test on the minimum supported iOS simulator and one current iOS device before submission.

### Data Collection Disclosures

**What Apple requires:** The privacy policy and App Store privacy labels must describe data collection by the app and third-party SDKs. If data is linked to an identity, used for tracking, or shared, those distinctions must be accurate ([App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)).

**How BasketGap will comply:** The privacy policy must state that v1 does not require accounts, does not store shopping lists, does not store location history, and uses postcode only to choose relevant store zones. It must explain anonymous device ID use, analytics/diagnostics if enabled, LLM fallback processing, and deletion of saved preferences.

**Build work needed:** Add privacy policy URL in App Store Connect and in-app settings/about. Add a "Delete saved preferences" action before v1.1 preference storage launches; for v1, provide a "Reset local data" control if device ID/preferences are stored locally.

### Third-Party SDK Disclosure Requirements

**What Apple requires:** Developers are responsible for third-party SDK data practices, privacy manifests, and privacy label accuracy. Apple explicitly expects developers to understand SDK data collection and tracking behavior ([Apple User Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/), [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files)).

**How BasketGap will comply:** Each SDK must have an owner, purpose, data collected, network endpoints, and retention behavior documented before release. Likely SDKs: Expo modules, Supabase client if used in mobile for auth only later, Sentry, PostHog, and possibly Apple/Google sign-in in v1.1. No LLM or Supabase service-role credentials ship in mobile.

**Build work needed:** Create an SDK inventory before TestFlight external testing. Disable autocapture/session replay unless privacy-reviewed. Verify SDK manifests in the archive. Document subprocessors in the privacy policy.

### Age Rating

**What Apple requires:** Developers answer App Store Connect age-rating questions; Apple generates the rating. Apple's public age-rating material now uses tiers including 4+, 9+, 13+, 16+, and 18+ and requires disclosure of sensitive content, unrestricted web access, advertising, and similar capabilities ([Apple age ratings](https://apps.apple.com/us/iphone/story/id1825160725), [App Store categories](https://developer.apple.com/app-store/categories/)).

**How BasketGap will comply:** BasketGap should likely qualify for a low age rating because it is a utility with no user-generated public content, no ads, no unrestricted web browsing, no gambling, no purchases in v1, and no mature content. Grocery products can include alcohol/tobacco-like items if catalogue data includes them; v1 should decide whether to filter restricted products or accept a higher rating if such products appear.

**Build work needed:** Complete the current App Store Connect age-rating questionnaire before submission. If alcohol products are displayed, document behavior and age-rating impact. Re-check age-rating rules because Apple updated this area recently and may continue to refine it.

### Third-Party Brands: Coles And Woolworths

**What Apple requires:** Apps must not misuse protected third-party material, create copycat confusion, or imply endorsement without rights. Apple's guidelines include copycat/IP restrictions and review can ask for documentary evidence for third-party content rights ([App Review Guidelines](https://developer.apple.com/appstore/resources/approval/guidelines.html)).

**How BasketGap will comply:** The app name remains BasketGap, not "Coles vs Woolworths" or anything that suggests affiliation. Coles and Woolworths names should appear only descriptively inside the app and metadata. Do not use retailer logos, brand colors as primary identity, product images, screenshots from retailer sites, or official-looking badges unless permission is obtained. Include "BasketGap is independent and is not affiliated with, endorsed by, or sponsored by Coles Group or Woolworths Group" in About/Legal and review notes.

**Build work needed:** Design original icon/branding. Use text labels for retailers initially. Add legal disclaimer to metadata/review notes. If product names/images come from retailer sources, confirm rights and terms before including images in the app.

### Comparison And Scraper-Style App Concerns

**What Apple requires:** Apple does not publish a special "scraper app" rule for grocery comparison apps, but review can reject apps for misleading claims, IP misuse, poor functionality, privacy issues, or using third-party content without rights.

**How BasketGap will comply:** Avoid saying "live" unless prices are actually live. Show "Prices as of [time]" and explain that availability is shown only when verifiable. Keep standard shelf pricing explicit in v1. Do not imply checkout, ordering, or retailer account integration. Do not show promotions unless the user's list qualifies.

**Build work needed:** Build a review demo path with stable sample data if live retailer fetching is unreliable during review. Provide App Review notes explaining data sources, freshness, standard shelf price stance, and independence from retailers. Legal review is needed before production scraping at scale.

### TestFlight Strategy

**What Apple requires:** TestFlight builds still go through beta review for external testers, and privacy/export/compliance answers must be accurate enough for the build.

**How BasketGap will comply:** Use internal TestFlight first with seeded data and no analytics autocapture. Move to a small external Australian beta only after privacy labels, disclaimers, crash reporting, and deletion/reset behavior are ready.

**Build work needed:** Create EAS build profiles for development, preview/TestFlight, and production. Add test accounts only when v1.1 auth exists. Provide external beta review notes with sample postcode/list, known limitations, and support contact.

## Section B — Application Security Requirements For BasketGap

### Mobile App Is Untrusted

**Threat:** Attackers can decompile the app, alter requests, replay compare calls, spoof device IDs, fuzz shopping-list input, and bypass UI limits.

**Mitigation:** Treat mobile as a presentation client only. All matching, price selection, promotion qualification, retailer data access, LLM routing, and freshness decisions run server-side. Mobile receives only the result contract needed for display. Device ID is a weak abuse signal, not authentication.

**Enforced at:** API, database, infra. Mobile helps with UX limits but is not trusted.

### Secrets Management

**Threat:** API keys in the mobile binary can be extracted and abused, especially OpenRouter, Supabase service role, retailer adapter credentials, Sentry auth tokens, and EAS signing secrets.

**Mitigation:** No server secrets in Expo public config or mobile code. Only public mobile config such as API base URL and public project IDs may ship. Store server secrets in Vercel environment variables, worker runtime secrets, Supabase secrets, GitHub Actions secrets, and EAS credentials. Rotate secrets on suspected exposure.

**Enforced at:** Mobile build config, Vercel, GitHub Actions, Supabase, EAS.

### API Authentication And Rate Limiting

**Threat:** Anonymous usage can be abused for scraping BasketGap's normalized data, forcing LLM costs, or hammering targeted refresh.

**Mitigation:** v1 uses anonymous device-ID-based throttling plus IP/user-agent heuristics and per-endpoint rate limits. Compare endpoint limits should separately cap request count, list length, line count, characters per line, total characters, LLM fallback invocations, and targeted refresh requests. Device ID must be signed or accompanied by server-issued anonymous session tokens to reduce trivial spoofing.

**Enforced at:** API gateway/function middleware, database counters, optional Upstash/QStash/rate-limit store.

### Shopping List Input Validation And Sanitisation

**Threat:** Malformed input can cause parser bugs, database query abuse, prompt injection, log leakage, or denial of service.

**Mitigation:** Validate JSON schema and content limits before parsing. Normalize Unicode, reject control characters except newlines/tabs where intended, cap input size, cap line count, and parse each line into a safe internal structure. Use parameterized SQL only. Return structured validation errors without echoing full raw input.

**Enforced at:** API boundary and shared validation package.

### Prompt Injection Protection

**Threat:** A user can type instructions such as "ignore previous instructions" into a grocery list line. If passed directly to an LLM fallback, it can corrupt extraction, leak system details, or create unsafe outputs.

**Mitigation:** LLM fallback receives only low-confidence lines after deterministic cleaning, with a narrow structured-extraction schema, explicit instruction that user text is data not instructions, no secrets/context beyond the candidate line and allowed output schema, and strict JSON/schema validation on response. Never let LLM output directly choose final prices; it only proposes parsed intent/candidate hints that deterministic ranking validates.

**Enforced at:** API/matching service. Add adversarial prompt-injection fixtures to tests.

### Transport Security

**Threat:** Network interception could expose postcode, list content in transit, or result data.

**Mitigation:** Use HTTPS/TLS only for mobile-to-API, API-to-Supabase, API-to-OpenRouter, and worker-to-retailer/API calls. Enable HSTS at hosted domains where applicable. Certificate pinning is not recommended for v1 because pinning mistakes can brick clients and Expo/React Native operational overhead is high; revisit only if threat model changes.

**Enforced at:** Vercel/custom domain, Supabase, OpenRouter/provider clients, mobile network layer.

### Database Security

**Threat:** Bugs or leaked credentials could expose product data, device preferences, or internal price observations.

**Mitigation:** Enable Supabase Row Level Security on user/preference/device tables even if access is mostly server-side. Use least-privilege roles for API read/write, worker ingestion, analytics exports, and migrations. Service role keys are server/worker only. Store historical observations with clear retention and access policies.

**Enforced at:** Supabase Postgres policies, Vercel/worker environment, migration review.

### pgvector And Embedding Storage

**Threat:** Embeddings can leak or encode user input if raw shopping-list lines are embedded and stored.

**Mitigation:** Store embeddings for canonical product catalogue and approved normalized query phrases only. Do not store embeddings derived from raw user shopping lists with identifiers. The global cleaned-input cache must be postcode-independent and should avoid retaining rare/personal phrases. If caching user-derived phrases, strip quantities/brands only where needed and set retention limits.

**Enforced at:** Matching service, database schema, data retention jobs.

### Logging And Observability

**Threat:** Logs often become the accidental database of sensitive user behavior.

**Mitigation:** Never log full shopping lists, raw LLM prompts, raw postcodes tied to device IDs, service role keys, retailer tokens, or full provider responses. Log request IDs, coarse postcode region or hash where needed, line count, unmatched count, latency buckets, model ID, token counts, error class, and freshness age. Sentry breadcrumbs must redact request bodies.

**Enforced at:** API logger, worker logger, Sentry config, Vercel/Axiom log drains.

### Backup And Recovery

**Threat:** Data loss or corrupted migrations can break price history, canonical mapping, and preference restore.

**Mitigation:** Use Supabase automated backups for production, tested point-in-time recovery where plan supports it, and migration roll-forward/rollback playbooks. Export or snapshot canonical mapping separately because it is a core asset. Test restore before launch.

**Enforced at:** Supabase project settings, runbooks, CI migration checks.

### Dependency Security

**Threat:** React Native, Expo, serverless, scraping, and analytics dependencies create supply-chain risk.

**Mitigation:** Enable Dependabot for npm and GitHub Actions. Add GitHub secret scanning and dependency review where available. Run `pnpm audit` or a chosen scanner in CI, with allowlisted exceptions documented. Pin GitHub Actions by version tags at minimum; consider SHA pinning for security-sensitive deployment workflows. OWASP MASVS and OWASP API Security Top 10 should guide mobile/API review ([OWASP MASVS](https://mas.owasp.org/MASVS/), [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x00-header/)).

**Enforced at:** GitHub repository settings, CI, code review.

### CI/CD Security

**Threat:** A compromised workflow or leaked signing key can ship malicious builds or expose production secrets.

**Mitigation:** Store Vercel, Supabase, OpenRouter, EAS, and Apple credentials in scoped secrets. Use separate preview/production secrets. Protect `main`, require PR review, require CI, and restrict who can trigger production releases. EAS credentials stay in EAS/Apple-managed storage where possible. Do not expose secrets to pull requests from forks. GitHub documents special restrictions around Dependabot-triggered workflows and secrets; account for those in CI design ([Dependabot on GitHub Actions](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-on-actions)).

**Enforced at:** GitHub branch protection, Actions permissions, EAS, Vercel, Supabase.

### Incident Response Basics

**Threat:** Security issues will happen: leaked env vars, bad logging, provider breach, data exposure, or retailer-source blocking.

**Mitigation:** Maintain a simple incident process: identify severity, stop bleeding, revoke/rotate credentials, preserve logs, assess affected data, notify users/regulators if required, patch, publish postmortem, and add regression tests. Keep an emergency contact in privacy policy/support metadata.

**Enforced at:** Runbook, repository docs, owner process.

### Australian Privacy Principles

**Threat:** BasketGap's anonymous-first design can still process personal information if device IDs, postcodes, preferences, support messages, or analytics can identify a person.

**Mitigation:** Follow APP-style privacy by design: open and transparent privacy policy, pseudonymous use where practical, collection minimization, clear purpose limits, overseas disclosure awareness for OpenRouter/Sentry/PostHog/Supabase, access/deletion process for linked preferences, and reasonable security. OAIC highlights APP 1 transparency and APP 11 security as core obligations ([OAIC APPs](https://www.oaic.gov.au/_old/privacy/australian-privacy-principles/read-the-australian-privacy-principles), [OAIC mobile privacy guide](https://www.oaic.gov.au/_old/privacy/guidance-and-advice/mobile-privacy-a-better-practice-guide-for-mobile-app-developers)).

**Enforced at:** Product policy, API/database retention, privacy policy, support process.

### GDPR Hygiene

**Threat:** BasketGap does not target the EU, but EU users may access the app, and GDPR principles are good engineering hygiene.

**Mitigation:** Apply data minimization, purpose limitation, storage limitation, integrity/confidentiality, and deletion/export readiness. Do not rely on GDPR-specific legal positions without counsel; treat this as good practice unless EU targeting begins.

**Enforced at:** Data model, retention jobs, privacy policy, support workflow.

### Notifiable Data Breaches Scheme

**Threat:** An eligible data breach in Australia may require notification to affected individuals and the OAIC.

**Mitigation:** Maintain breach triage that evaluates whether personal information was accessed/disclosed/lost, whether serious harm is likely, and whether remedial action prevents serious harm. OAIC documents the Notifiable Data Breaches scheme and eligible breach threshold ([OAIC NDB scheme](https://www.oaic.gov.au/privacy/notifiable-data-breaches), [OAIC NDB guidance](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/preventing-preparing-for-and-responding-to-data-breaches/data-breach-preparation-and-response/part-4-notifiable-data-breach-ndb-scheme)).

**Enforced at:** Incident response process, log retention, data inventory.

## Pre-Launch Security Checklist

- [ ] Mobile binary contains no OpenRouter, Supabase service-role, retailer, Vercel, Sentry auth, or PostHog secret keys.
- [ ] API validates list/postcode payloads with schema and size limits before parsing.
- [ ] Compare endpoint has anonymous device/IP rate limits and LLM fallback budget limits.
- [ ] LLM fallback uses pinned GPT-4o mini primary and Gemini 2.0 Flash fallback, strict structured output, and prompt-injection tests.
- [ ] No full shopping lists, raw prompts, or postcode+device pairs are logged.
- [ ] Supabase RLS is enabled on device/account/preference tables.
- [ ] Worker credentials are separate from API credentials and have least privilege.
- [ ] pgvector stores catalogue/product embeddings, not identifiable raw user-list embeddings.
- [ ] Privacy policy, App Store privacy labels, SDK inventory, and `PrivacyInfo.xcprivacy` agree with actual behavior.
- [ ] ATT is absent unless tracking is intentionally introduced and reviewed.
- [ ] Coles/Woolworths disclaimer appears in About/Legal, metadata review notes, and support docs.
- [ ] App Store age rating questionnaire is completed with current Apple rules.
- [ ] Sentry/PostHog redaction and autocapture settings are reviewed.
- [ ] Dependabot/security scanning is enabled and CI passes without secrets exposed to untrusted PRs.
- [ ] Supabase backup/restore has been tested.
- [ ] Incident response contact and runbook exist before public launch.

