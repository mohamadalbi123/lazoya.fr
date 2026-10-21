# Planity catalogue reconciliation — 21 October 2026

Source: https://www.planity.com/lazoya-17000-la-rochelle

All ten “Voir les autres prestations” controls were expanded in the live public
Planity page before capturing the catalogue. Public display text takes precedence
over historical/deleted entries in Planity's embedded data. This matters for the
public “Soin Botox capillaire” label and category separators whose prices are blank,
even though Planity's embedded data contains zero amounts.

## Results

The former interactive catalogue contained 162 entries. The reviewed current
catalogue contains 160 entries in 18 categories: 142 can be booked online; 18 show
Planity's telephone-only restriction, including five unpriced waxing separators.
No blank price is converted to a free service.

| Planity category | Entries |
| --- | ---: |
| Coiffure | 27 |
| Radiofréquence | 3 |
| Hydra Touch Coréen | 2 |
| Vernis classique | 4 |
| Semi permeant | 8 |
| Soins des mains et des pieds | 8 |
| Gainage sur ongles naturels et Renfort | 8 |
| Pose Gel-X (Capsule Américane) | 11 |
| Soins visage | 8 |
| Micro-Nano needling | 9 |
| Dermaplaning | 2 |
| Lifting coréen | 2 |
| Luminothérapie | 4 |
| Peeling aux Acides de Fruits | 2 |
| Massages corps | 16 |
| Épilation à la cire | 32 |
| Atelier Cils & Sourcils | 9 |
| Makeup | 5 |

Full exact category labels, service names, descriptions, durations, prices and
online-booking flags are preserved in `content/planity-services.json`.
Capitalization, accents, spelling, emoji and category-specific repeated nail-art
options follow Planity. Broad website navigation labels remain readable French.

The current Planity catalogue does not contain separate eyelash extension or
Korean lash-lift entries. Previous website listings and diagnostic recommendations
for those entries were replaced with Planity's current keratin rehaussement label.
This does not assert that the salon has stopped offering another treatment.

## Source inconsistency requiring the salon's review

“Massage des pieds” has displayed fields **30min / 49 €**, while its Planity
description says **45 min / 59 euros** and **1h / 75 euros**. Both fields and
description were preserved to meet the requested exact match. The underlying
Planity description should be clarified by the salon, then the site snapshot
updated. No Planity account data or settings were changed.

## Implementation and SEO benefit

- `content/planity-services.json`: reviewed public snapshot, used for every list.
- `content/diagnostic-services.json`: curated recommendation references; names,
  durations, prices and booking restrictions come from the same snapshot.
- `scripts/build-service-catalog.py`: generates the app catalogue, eight static
  service pages and diagnostic recommendations. This is a reviewed snapshot sync,
  not a continuous Planity integration.
- `app.js`: updated complete catalogue, grouped navigation for nails and face
  services, and removal of stale browser-storage overrides. Returning visitors
  receive the same published catalogue as new visitors.
- `index.html`: accurate homepage service summaries, category links and business
  offer schema. The local-only service editor was replaced with Planity guidance
  so browser-only additions cannot create a conflicting catalogue.
- `prestations/index.html`: full crawlable catalogue, including descriptions and
  booking restrictions. Google and visitors can read it without JavaScript.
- `coiffure/index.html`, `ongles/index.html`, `soins-visage/index.html`,
  `cils-sourcils/index.html`, `massages/index.html`, `epilation/index.html`,
  `maquillage/index.html`: all relevant Planity entries, exact prices/durations and
  booking links. Conflicting older summaries were corrected.
- `diagnostique/index.html`: recommendations now reference actual current entries;
  telephone-only restrictions are shown when relevant.
- `seo-pages.css`: responsive catalogue cards and accessible expandable details,
  using the existing colors, typography and buttons.
- `produits/index.html`: shared stylesheet cache version only; products unchanged.
- `sitemap.xml`: last-modified dates for pages whose service content changed.
- `scripts/check-service-catalog.py`: verifies generated lists, exact rendered
  fields, online versus telephone links, diagnostic references and stale storage.

Analytics, advertising identifiers, consent behavior, WhatsApp, telephone,
directions and Planity destinations are preserved. No Google Ads settings changed.

## Validation

- Expanded Planity DOM versus rendered interactive Lazoya catalogue: 18 categories,
  160 entries, zero differences in names, descriptions, durations, prices or flags.
- Static catalogue assertions cover all eight service pages and their booking links.
- Returning-visitor storage cannot override the published catalogue.
- Existing static build/SEO and tracking checks pass.
- Desktop and 390px mobile catalogue inspected; no horizontal page overflow.

To review a future snapshot update:

```sh
python3 scripts/build-service-catalog.py
python3 scripts/check-service-catalog.py
python3 scripts/check-seo.py
node scripts/check-tracking.js
```

After publishing, additionally run the catalogue check against the public origin
and confirm the exact pushed Git commit has a READY Vercel production deployment.
