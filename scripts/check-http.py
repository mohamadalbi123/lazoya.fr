#!/usr/bin/env python3
"""Smoke-test the local preview: canonical pages, static aliases, assets and 404s."""
import json
import sys
import urllib.error
import urllib.request
import urllib.parse
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4187"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


opener = urllib.request.build_opener(NoRedirect)


def get(path):
    try:
        return opener.open(BASE + path, timeout=10)
    except urllib.error.HTTPError as error:
        return error


def redirect_destination(path):
    # Vercel normalizes trailing slashes before evaluating application redirects.
    # Follow that extra permanent hop while retaining queries and fragments.
    for _ in range(4):
        response = get(path)
        assert response.status == 308, (path, response.status)
        destination = response.headers["Location"]
        parsed = urllib.parse.urlsplit(destination)
        next_path = parsed.path + ("?" + parsed.query if parsed.query else "")
        next_response = get(next_path)
        if next_response.status != 308:
            return destination
        path = next_path
    raise AssertionError((path, "Redirect loop"))


locations = ElementTree.parse(ROOT / "sitemap.xml").findall(".//{*}loc")
for node in locations:
    path = node.text.removeprefix("https://www.lazoya.fr")
    response = get(path)
    assert response.status == 200, (path, response.status)
    html = response.read().decode()
    assert 'href="' + node.text + '"' in html, path
    if path != "/":
        response = get(path.rstrip("/") + "?utm_source=seo_check")
        assert response.status == 308, (path, response.status)
        assert response.headers["Location"] == path + "?utm_source=seo_check"

config = json.loads((ROOT / "vercel.json").read_text())
for rule in config["redirects"]:
    if rule.get("has"):
        continue  # Domain redirects need separate verification on Vercel after release.
    destination = redirect_destination(rule["source"] + "?utm_source=seo_check")
    parts = urllib.parse.urlsplit(rule["destination"])
    expected = parts.path + "?utm_source=seo_check" + ("#" + parts.fragment if parts.fragment else "")
    assert destination == expected, (rule["source"], destination, expected)

for asset in (ROOT / "assets").rglob("*.optimized.webp"):
    response = get("/" + asset.relative_to(ROOT).as_posix())
    assert response.status == 200 and response.headers["Content-Type"] == "image/webp"
assert get("/seo-check-nonexistent/").status == 404
api = get("/api/beauty-advisor")
if api.status == 308:
    assert api.headers["Location"] == "/api/beauty-advisor/"
    api = get("/api/beauty-advisor/")
assert api.status == 200, "SEO routing must not capture the API health check"
print(f"HTTP checks passed: {len(locations)} canonical pages, configured path redirects with query strings, optimized assets, real 404 and API isolation.")
