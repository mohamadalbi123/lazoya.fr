#!/usr/bin/env python3
"""Build all public service lists from the reviewed public Planity snapshot.

After reviewing a fresh Planity catalogue, update content/planity-services.json,
then run this script. --check detects generated files that have drifted.
This deliberately does not scrape or publish automatically.
"""
import argparse
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "content/planity-services.json").read_text())
PLANITY = "https://www.planity.com/lazoya-17000-la-rochelle"
PAGE_GROUPS = {
    "coiffure": [0], "ongles": [3, 4, 5, 6, 7],
    "soins-visage": [1, 2, 8, 9, 10, 11, 12, 13],
    "massages": [14], "epilation": [15], "cils-sourcils": [16],
    "maquillage": [17], "prestations": list(range(len(CATALOG))),
}


def service_html(service):
    esc = html.escape
    description = (f'<details class="catalog-details"><summary>Détails de la prestation</summary>'
                   f'<p>{esc(service["description"]).replace(chr(10), "&#10;")}</p></details>') if service["description"] else ""
    booking = (f'<a class="button" href="{PLANITY}" target="_blank" rel="noreferrer">Choisir sur Planity</a>'
               if service["bookable"] else
               '<p class="catalog-unavailable">Cette prestation ne peut pas être réservée en ligne. '
               'Merci d’appeler le <a href="tel:+33956673009">09 56 67 30 09</a>.</p>')
    return (f'<article class="service-card catalog-service"><h3>{esc(service["name"])}</h3>'
            f'<p class="catalog-meta"><span>{esc(service["duration"])}</span>'
            f'<strong>{esc(service["price"])}</strong></p>{description}{booking}</article>')


def catalog_html(indices):
    groups = []
    for index in indices:
        group = CATALOG[index]
        description = (f'<details class="catalog-details"><summary>À propos de cette catégorie</summary>'
                       f'<p>{html.escape(group["description"]).replace(chr(10), "&#10;")}</p></details>') if group["description"] else ""
        groups.append(f'<section class="catalog-group" id="planity-category-{index}">'
                      f'<h2>{html.escape(group["category"])}</h2>{description}'
                      '<div class="service-list">' + "\n".join(map(service_html, group["services"])) + '</div></section>')
    return '<!-- planity-catalog:start -->\n<div class="planity-catalog">\n' + "\n".join(groups) + '\n</div>\n<!-- planity-catalog:end -->'


def build(check=False):
    outputs = {}
    app = (ROOT / "app.js").read_text()
    data = "const planityPrestationsData = " + json.dumps(CATALOG, ensure_ascii=False, indent=2) + ";"
    app = re.sub(r"const planityPrestationsData = .*?;(?=\n\nconst planityCategoryMeta)", lambda _: data, app, count=1, flags=re.S)
    outputs[ROOT / "app.js"] = app
    diagnostic = ROOT / "diagnostique/index.html"
    selections = json.loads((ROOT / "content/diagnostic-services.json").read_text())
    recommendations = []
    for selection in selections:
        group = next(g for g in CATALOG if g["category"] == selection["planityCategory"])
        service = next(s for s in group["services"] if s["name"] == selection["planityName"])
        recommendation = {k: v for k, v in selection.items() if not k.startswith("planity")}
        recommendation.update({k: service[k] for k in ("name", "price", "duration", "bookable")})
        recommendations.append(recommendation)
    diagnostic_text, count = re.subn(
        r"const serviceCatalog = .*?;(?=\n\n      const state)",
        lambda _: "const serviceCatalog = " + json.dumps(recommendations, ensure_ascii=False, indent=2) + ";",
        diagnostic.read_text(), count=1, flags=re.S)
    assert count == 1, "Diagnostic catalogue marker missing"
    outputs[diagnostic] = diagnostic_text
    for page, indices in PAGE_GROUPS.items():
        path = ROOT / page / "index.html"
        text = path.read_text()
        rendered = catalog_html(indices)
        if "<!-- planity-catalog:start -->" in text:
            text = re.sub(r"<!-- planity-catalog:start -->.*?<!-- planity-catalog:end -->", lambda _: rendered, text, count=1, flags=re.S)
        elif page == "prestations":
            text = text.replace('          <div class="cta-band">', rendered + '\n          <div class="cta-band">', 1)
        else:
            text, count = re.subn(r'<div class="service-list">.*?</div>', lambda _: rendered, text, count=1, flags=re.S)
            assert count == 1, page
        outputs[path] = text
    changed = [str(path.relative_to(ROOT)) for path, text in outputs.items() if path.read_text() != text]
    if check:
        assert not changed, f"Regenerate service catalog: {changed}"
    else:
        for path, text in outputs.items():
            path.write_text(text)
    print(f"Planity catalogue: {len(CATALOG)} categories, {sum(len(g['services']) for g in CATALOG)} entries; "
          f"{'verified' if check else 'generated'} app and {len(PAGE_GROUPS)} HTML pages.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    build(parser.parse_args().check)
