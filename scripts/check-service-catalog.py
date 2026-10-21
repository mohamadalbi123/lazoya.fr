#!/usr/bin/env python3
"""Check shipped catalogues and booking links against the reviewed Planity data."""
import json
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from runpy import run_path
from urllib.request import urlopen
import sys

ROOT = Path(__file__).resolve().parents[1]
config = run_path(str(ROOT / "scripts/build-service-catalog.py"))
catalog = config["CATALOG"]
subprocess.run([sys.executable, str(ROOT / "scripts/build-service-catalog.py"), "--check"], check=True)


class CatalogPage(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.entries = []
        self.current = None
        self.field = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "article" and "catalog-service" in attrs.get("class", "").split():
            assert self.current is None
            self.current = {"name": "", "duration": "", "price": "", "links": []}
        if self.current is None:
            return
        if tag == "h3":
            self.field = "name"
        elif tag == "span":
            self.field = "duration"
        elif tag == "strong":
            self.field = "price"
        elif tag == "a":
            self.current["links"].append(attrs.get("href"))

    def handle_data(self, data):
        if self.current is not None and self.field:
            self.current[self.field] += data

    def handle_endtag(self, tag):
        if tag in ("h3", "span", "strong"):
            self.field = None
        if tag == "article" and self.current is not None:
            self.entries.append(self.current)
            self.current = None


origin = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else None
for page, indices in config["PAGE_GROUPS"].items():
    if origin:
        with urlopen(f"{origin}/{page}/", timeout=30) as response:
            text = response.read().decode()
    else:
        text = (ROOT / page / "index.html").read_text()
    actual = CatalogPage(text).entries
    expected = [service for index in indices for service in catalog[index]["services"]]
    assert len(actual) == len(expected), (page, len(actual), len(expected))
    for shipped, source in zip(actual, expected):
        for key in ("name", "duration", "price"):
            assert shipped[key] == source[key], (page, key, shipped, source)
        destination = config["PLANITY"] if source["bookable"] else "tel:+33956673009"
        assert shipped["links"] == [destination], (page, source["name"], shipped["links"])

subprocess.run(["node", "-e", r'''
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const app = fs.readFileSync('app.js', 'utf8');
const data = JSON.parse(fs.readFileSync('content/planity-services.json', 'utf8'));
const readStart = app.indexOf('function read(type)');
const readEnd = app.indexOf('\nfunction write(type)', readStart);
// Returning visitors must see the shipped services even with stale local data.
const context = {structuredClone, localStorage:{getItem:()=> '[{"name":"obsolete service"}]'}};
vm.createContext(context);
vm.runInContext(app.slice(0, app.indexOf('const topbar =')) + app.slice(readStart, readEnd) +
  ';globalThis.shipped = JSON.stringify(planityPrestationsData); globalThis.visible = JSON.stringify(state.services);', context);
assert.deepEqual(JSON.parse(context.shipped), data);
assert.equal(JSON.parse(context.visible).length, data.flatMap(g=>g.services).length);
assert(!context.visible.includes('obsolete service'));
const diagnostic = fs.readFileSync('diagnostique/index.html', 'utf8');
const start = diagnostic.indexOf('const serviceCatalog =');
const end = diagnostic.indexOf('\n\n      const state', start);
const recommendations = vm.runInNewContext(diagnostic.slice(start,end)+';serviceCatalog');
for(const r of recommendations) {
  assert(data.some(g=>g.services.some(s=> ['name','duration','price','bookable'].every(k=>s[k]===r[k]))), r.name);
}
console.log('App data, returning-visitor cache handling and all diagnostic service names/prices/durations verified.');
'''], cwd=ROOT, check=True)
print(f"Verified all 160 Planity entries and booking restrictions across 8 {'public' if origin else 'local'} service pages.")
