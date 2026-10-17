#!/usr/bin/env python3
"""Check static SEO metadata, crawl paths, sitemap and JSON-LD without dependencies."""
import json
import re
import subprocess
import tempfile
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://www.lazoya.fr"


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.tags = []
        self.title = ""
        self.schemas = []
        self.in_title = False
        self.in_schema = False
        self.schema = ""
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if tag == "title":
            self.in_title = True
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.in_schema = True
            self.schema = ""

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "script" and self.in_schema:
            self.schemas.append(json.loads(self.schema))
            self.in_schema = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.in_schema:
            self.schema += data

    def meta(self, key):
        return [a.get("content", "") for tag, a in self.tags
                if tag == "meta" and (a.get("name") == key or a.get("property") == key)]


def local_file(url):
    path = unquote(urlsplit(url).path)
    return ROOT / (path.lstrip("/") + "index.html" if path.endswith("/") else path.lstrip("/"))


def check():
    pages = {}
    for file in ROOT.rglob("index.html"):
        page = Page(file.read_text())
        if any("noindex" in value for value in page.meta("robots")):
            continue
        relative = file.relative_to(ROOT).parent.as_posix()
        url = ORIGIN + ("/" if relative == "." else f"/{relative}/")
        pages[url] = page

    entities = {}
    for url, page in pages.items():
        assert sum(tag == "title" for tag, _ in page.tags) == 1, url
        assert page.title.strip(), url
        assert len(page.meta("description")) == 1 and page.meta("description")[0], url
        assert sum(tag == "script" and "tracking-consent.js" in a.get("src", "") for tag, a in page.tags) == 1, url
        assert sum(tag == "script" and "conversions.js" in a.get("src", "") for tag, a in page.tags) == 1, url
        if url != ORIGIN + "/":
            assert any(tag == "script" and "landing-consent.js" in a.get("src", "") for tag, a in page.tags), url
        canonical = [a.get("href") for tag, a in page.tags if tag == "link" and a.get("rel") == "canonical"]
        assert canonical == [url], (url, canonical)
        assert page.meta("og:url") == [url], url
        for field in ("og:title", "twitter:title"):
            assert page.meta(field) == [page.title], (url, field)
        for field in ("og:description", "twitter:description"):
            assert page.meta(field) == page.meta("description"), (url, field)
        assert sum(tag == "h1" for tag, _ in page.tags) == 1, url
        assert any(tag == "html" and a.get("lang") == "fr" for tag, a in page.tags), url
        for field in ("og:image", "twitter:image"):
            assert len(page.meta(field)) == 1 and local_file(page.meta(field)[0]).is_file(), (url, field)
        assert len(page.schemas) == 1, url
        graph = page.schemas[0]["@graph"]
        assert page.schemas[0]["@context"] == "https://schema.org", url
        assert any(entity["@type"] == "WebPage" for entity in graph), url
        for entity in graph:
            assert entity["@id"] not in entities, (url, entity["@id"])
            entities[entity["@id"]] = entity
            if entity["@type"] == "BreadcrumbList":
                items = entity["itemListElement"]
                assert [item["position"] for item in items] == list(range(1, len(items) + 1)), url
                assert items[-1]["item"] == url, url

        for tag, attrs in page.tags:
            if tag == "img":
                assert int(attrs.get("width", 0)) > 0 and int(attrs.get("height", 0)) > 0, (url, "Image missing dimensions")
            target = attrs.get("href") if tag in ("a", "link") else attrs.get("src") if tag in ("img", "script") else None
            if not target:
                continue
            absolute = urljoin(url, target)
            if urlsplit(absolute).netloc != urlsplit(ORIGIN).netloc:
                continue
            file = local_file(absolute)
            assert file.is_file(), (url, "Missing internal link or asset", target)
            fragment = urlsplit(absolute).fragment
            if tag == "a" and fragment and file.suffix == ".html":
                ids = {a.get("id") for _, a in Page(file.read_text()).tags}
                assert fragment in ids, (url, "Missing fragment", target)

    def check_references(value):
        if isinstance(value, dict):
            if set(value) == {"@id"}:
                assert value["@id"] in entities, ("Unresolved entity", value)
            for child in value.values():
                check_references(child)
        elif isinstance(value, list):
            for child in value:
                check_references(child)

    for entity in entities.values():
        check_references(entity)
    titles = Counter(page.title for page in pages.values())
    assert all(count == 1 for count in titles.values()), "Duplicate page titles"
    descriptions = Counter(page.meta("description")[0] for page in pages.values())
    assert all(count == 1 for count in descriptions.values()), "Duplicate descriptions"
    sitemap = ElementTree.parse(ROOT / "sitemap.xml")
    locations = [node.text for node in sitemap.findall(".//{*}loc")]
    assert len(locations) == len(set(locations)), "Duplicate sitemap URLs"
    assert set(locations) == set(pages), "Sitemap must match all indexable canonical pages"
    assert f"Sitemap: {ORIGIN}/sitemap.xml" in (ROOT / "robots.txt").read_text()

    # Every indexable page must be reachable by following HTML links from home.
    reached = set()
    pending = [ORIGIN + "/"]
    while pending:
        url = pending.pop()
        if url in reached:
            continue
        reached.add(url)
        for tag, attrs in pages[url].tags:
            if tag == "a" and attrs.get("href"):
                parsed = urlsplit(urljoin(url, attrs["href"]))
                destination = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                if destination in pages and destination not in reached:
                    pending.append(destination)
    assert reached == set(pages), ("Orphaned pages", set(pages) - reached)
    business = entities[ORIGIN + "/#salon"]
    assert "BeautySalon" in business["@type"] and "HairSalon" in business["@type"]
    assert business["telephone"] == "+33956673009"
    assert business["address"]["postalCode"] == "17000"
    assert "aggregateRating" not in business, "Do not add unverified rating schema"
    assert any("coréen" in offer["itemOffered"]["name"] for offer in business["hasOfferCatalog"]["itemListElement"])
    config = json.loads((ROOT / "vercel.json").read_text())
    redirects = {rule["source"]: rule for rule in config["redirects"] if not rule.get("has")}
    assert config["trailingSlash"] is True
    assert redirects["/index.html"]["destination"] == "/"
    for url in pages:
        path = urlsplit(url).path
        if path != "/":
            rule = redirects[path + "index.html"]
            assert rule["destination"] == path and rule["permanent"] is True
    # Static site: validate every JS asset and executable inline script as its build check.
    count = 0
    for script in ROOT.rglob("*.js"):
        subprocess.run(["node", "--check", str(script)], check=True, capture_output=True)
        count += 1
    with tempfile.TemporaryDirectory() as directory:
        for file in ROOT.rglob("index.html"):
            for attrs, source in re.findall(r"<script\b([^>]*)>(.*?)</script>", file.read_text(), re.S):
                if "application/ld+json" in attrs or not source.strip():
                    continue
                temp = Path(directory) / ("inline.mjs" if 'type="module"' in attrs else "inline.js")
                temp.write_text(source)
                subprocess.run(["node", "--check", str(temp)], check=True, capture_output=True)
                count += 1
    print(f"Static build checks passed: {count} JavaScript assets and inline scripts.")
    print(f"SEO checks passed: {len(pages)} indexable pages, {len(entities)} distinct schema entities, all pages crawlable from home.")


if __name__ == "__main__":
    check()
