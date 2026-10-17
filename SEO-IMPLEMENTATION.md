# Lazoya — local SEO implementation

17 October 2026. The user authorized production publication after local validation and asked that completed website changes be pushed live by default. That workflow is recorded in `AGENTS.md`. This report covers the cumulative SEO changes, including the earlier metadata and linking improvements. Git and Vercel provide the release commit and deployment status.

## Changes and expected benefits

| Change | Purpose |
| --- | --- |
| Homepage title, description and single descriptive H1 | Clearly associate Lazoya with beauty and coiffure in La Rochelle, while retaining the existing visual identity. |
| Expanded `/ongles/` | Address onglerie, manucure, semi-permanent, renfort gel, gainage, Gel-X and cosmetic foot care on one established page. Explain choices and appointment preparation rather than create competing keyword pages. |
| Expanded `/cils-sourcils/` | Include the owner-confirmed Korean lash lift, distinguish rehaussement from extensions and browlift, and answer practical booking questions. No price or duration was invented. |
| Expanded `/coiffure/` and `/soins-visage/` | Add service-selection guidance, local context and related-service links. Preserve existing service content and booking destinations. |
| Crawlable homepage and footer links, visible breadcrumbs, contextual links | Make existing service pages discoverable without a visitor having to operate the client-side filters. |
| Canonicals, sharing metadata and sitemap | Keep page identity and previews consistent across all 13 indexable pages. Deliberately noindexed diagnostic, campaign and redirect utility pages remain excluded. |
| Distinct JSON-LD entity identifiers | Separate business, website, page, breadcrumb and service identities. Business types include BeautySalon and HairSalon. The business catalog includes Korean lash lift. No aggregate rating, award or new qualification was added. |
| Consistent contact section on standalone indexable pages | Make the address, telephone, Planity, WhatsApp and directions easy to find from an organic landing page. |
| Permanent redirect configuration | Normalize `/index.html` and directory `index.html` variants. Enable trailing-slash normalization and prepare a host-specific permanent redirect to www. Legacy about/careers/models URLs now lead to their intended app views. |
| Campaign query preservation | Retain query parameters such as `gclid` and `utm_source` during client-side navigation and legacy redirects. |
| Optimized existing images | Replace references to 11 large photographic assets with WebP copies. Their combined encoded size falls from 9,992,711 to 321,352 bytes (about 97%). Original source files remain available. This is a byte reduction, not a measured Core Web Vitals score. |
| Image dimensions and asynchronous decoding | Reserve image space and avoid unnecessary decoding work without changing the branding or generating new photographs. |
| Consent controls on standalone indexable landing pages | Let new visitors choose analytics and advertising preferences while keeping nonessential tags disabled before consent. Reuse the same stored preferences and central Google tag loader. |
| Reservation-page mobile menu | Restore the expected behavior of the existing menu button on that page. |

## Measurement

The existing GA4 property (`G-3E9C5ZGQRW`) and Google Ads account tag (`AW-18308603892`) are retained. All four existing Ads conversion destinations and values remain unchanged. No campaign or account settings were edited.

The new GA4 event is `booking_intent`, sent only with analytics consent and explicitly addressed to GA4. Its parameters are:

- `booking_channel`: `planity`, `whatsapp`, `phone` or `directions`.
- `page_path`: the current pathname, excluding query parameters.

Existing advertising conversion events still require marketing consent. An intercepted homepage booking click is measured only when the visitor continues through the booking notice. A Planity click is an outbound intent action, **not a confirmed booking**. Confirmed bookings would require a separately verified Planity completion integration.

If reporting by channel is desired, register `booking_channel` as an event-scoped custom dimension in GA4. No GA4 administration changes were performed. Track non-branded queries and their landing pages in Search Console, comparing clicks, impressions, CTR and average position over comparable periods. The ranking figures supplied in the brief were used for prioritization, not independently reverified.

## Validation performed

- `python3 scripts/check-seo.py`: 13 indexable pages, 35 distinct schema entities, unique titles/descriptions, one H1 per page, canonicals/sitemap consistency, valid JSON-LD and resolved entity references, image dimensions, internal files/assets and crawl paths from home.
- The same command validates all JavaScript assets and executable inline scripts with `node --check`. This is a static HTML/CSS/JavaScript website with a standalone API; there is no framework build command or package manifest to compile.
- `node scripts/check-tracking.js`: all four contact channels across five consent states, one Google loader and one configuration per property, preserved Ads IDs, booking-notice deduplication and consent withdrawal. These tests use isolated browser stubs and make no analytics network requests.
- `python3 scripts/check-http.py`: local HTTP checks for 13 canonical pages, configured static aliases, trailing slashes, query retention, optimized images, an actual 404 and the unaffected API health endpoint. The local preview emulates static redirects; it does not replace testing Vercel's production routing.
- Browser checks at **390 × 844** and **1280 × 800** for home, nails, lashes, coiffure, facial care and reservations: one H1, no horizontal overflow and no console errors observed.
- Browser checks for first-visit landing-page consent and rejection: no Google tag loaded before consent or after refusal. Settings dialog, nail FAQ, homepage booking notice, navigation to reservation options and the reservation page's mobile menu worked.
- Legacy about URL correctly opened the about view and preserved test campaign parameters through subsequent navigation.
- `git diff --check` passed.

## Remaining release checks and unconfirmed information

1. **Production verification:** verify real HTTP/HTTPS and host redirects, all index aliases and the API path on Vercel for the published commit. The audit observed a 307 domain redirect from `https://lazoya.fr/` to www; a Vercel domain-level redirect may run before application rules. Its dashboard setting may still need to be changed to permanent. The prepared host rule alone does not prove that the live 307 has changed.
2. **Monday hours remain unchanged.** The website says closed, while Planity lists 10:00–18:00. Owner confirmation is required before editing hours or opening-hours schema.
3. A specific Google Business Profile URL has not been verified. Existing address-based directions remain in place; no guessed profile URL was added.
4. Google's PageSpeed API returned HTTP 429 during the audit. Field Core Web Vitals and a production Lighthouse/PageSpeed score have not been established. Recheck after release; local responsive tests and image byte savings are not substitutes for those measurements.
5. JSON-LD was validated locally. Run Google's Rich Results Test and Search Console URL Inspection against the released pages before requesting indexing. Follow up with GA4 Realtime/DebugView to verify receipt of consented events in the actual account.
6. Existing reviews, prices, qualifications, treatment claims and other service content were retained; they were not independently certified by this SEO implementation. No new reviews or qualifications were created.

## Modified and added files

Page content, metadata, image dimensions and/or script versions:

```text
index.html
a-propos/index.html
carrieres/index.html
cils-sourcils/index.html
coiffure/index.html
confidentialite/index.html
defi-ongles/index.html
diagnostique/index.html
epilation/index.html
maquillage/index.html
massages/index.html
mentions-legales/index.html
modeles/index.html
ongles/index.html
prestations/index.html
produits/index.html
reservation/index.html
soins-visage/index.html
```

Routing, styling, navigation, tracking, checks and this report:

```text
app.js
assets/booking-navigation.js
assets/conversions.js
assets/landing-consent.css
assets/landing-consent.js
assets/tracking-consent.js
local-dev.js
seo-pages.css
sitemap.xml
styles.css
vercel.json
scripts/check-http.py
scripts/check-seo.py
scripts/check-tracking.js
SEO-IMPLEMENTATION.md
AGENTS.md
```

Added optimized image copies; source images retained:

```text
assets/diagnostique/red-satin-bg.optimized.webp
assets/products/DSC03609.HEIC.optimized.webp
assets/products/DSC04048.HEIC.optimized.webp
assets/products/DSC4595.HEIC.optimized.webp
assets/products/DSC4596.HEIC.optimized.webp
assets/products/herbsom-cream-choice.optimized.webp
assets/products/herbsom-gel-mixte.optimized.webp
assets/products/herbsom-serum-choice.optimized.webp
assets/products/lifestyle-model-actives.optimized.webp
assets/products/lifestyle-model-cream.optimized.webp
assets/products/lifestyle-model-portrait.optimized.webp
```

`robots.txt` was reviewed and retained: it allows crawling and points to the canonical sitemap. No new keyword/location landing pages were created.
