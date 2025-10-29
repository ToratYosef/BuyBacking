#!/usr/bin/env python3
import argparse, re, time, json
from urllib.parse import urlparse
from lxml import etree
import requests, yaml
from bs4 import BeautifulSoup

DEFAULT_HEADERS = {"User-Agent": "SettonPriceBot/1.0 (+https://example.com/contact)"}
PRICE_RE = re.compile(r'(?<!\d)(?:\$|USD\s*)?(\d{1,4}(?:\.\d{2})?)(?!\d)')

# Common filler/brand words to ignore when forming the match key
STOPWORDS = {
  "sell","buy","trade","trade-in","phone","phones","get","the","guaranteed","most","cash",
  "apple","samsung","google","oneplus","sony","motorola","htc","lg","cell","-","–","!",
  "fe","plus","edge","pro","max","ultra"  # we will add back "pro/max/ultra" if present in the model pattern
}

# Keep these as model qualifiers when they appear attached to a core model token
QUALIFIERS = {"pro","max","ultra","mini","se","air","fold","flip"}

def load_yaml(path):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

def fetch(url, timeout=25):
    r = requests.get(url, headers=DEFAULT_HEADERS, timeout=timeout)
    r.raise_for_status()
    return r

def parse_sitemap_xml(xml_bytes):
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = etree.fromstring(xml_bytes)
    locs = []
    for loc in root.xpath("//sm:sitemap/sm:loc/text()", namespaces=ns):
        locs.append(loc.strip())
    for loc in root.xpath("//sm:url/sm:loc/text()", namespaces=ns):
        locs.append(loc.strip())
    # dedupe keep order
    seen, out = set(), []
    for u in locs:
        if u not in seen:
            out.append(u); seen.add(u)
    return out

def filter_urls(urls, allow_patterns, disallow_patterns):
    def allowed(u):
        for pat in disallow_patterns:
            if re.search(pat, u):
                return False
        for pat in allow_patterns:
            if re.search(pat, u):
                return True
        return False
    return [u for u in urls if allowed(u)]

def extract_jsonld_offers(soup):
    offers = []
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            data = json.loads(tag.string or tag.text or "{}")
        except Exception:
            continue
        nodes = data if isinstance(data, list) else [data]
        for node in nodes:
            offers.extend(_collect_offers_from_jsonld_node(node))
    return offers

def _collect_offers_from_jsonld_node(node):
    out = []
    if not isinstance(node, dict):
        return out
    t = node.get("@type") or node.get("type")
    tset = set(t if isinstance(t, list) else ([t] if t else []))
    if "AggregateOffer" in tset:
        for v in (node.get("lowPrice"), node.get("highPrice"), node.get("price")):
            p = _to_price(v)
            if p is not None: out.append(p)
    if "Offer" in tset:
        p = _to_price(node.get("price"))
        if p is not None: out.append(p)
    if "Product" in tset:
        offers = node.get("offers")
        if isinstance(offers, dict):
            out += _collect_offers_from_jsonld_node(offers)
        elif isinstance(offers, list):
            for o in offers:
                if isinstance(o, dict):
                    out += _collect_offers_from_jsonld_node(o)
    for v in node.values():
        if isinstance(v, dict):
            out += _collect_offers_from_jsonld_node(v)
        elif isinstance(v, list):
            for x in v:
                if isinstance(x, dict):
                    out += _collect_offers_from_jsonld_node(x)
    return out

def _to_price(val):
    if val is None: return None
    try: return float(str(val).strip().replace("$",""))
    except Exception: return None

def extract_prices_text(soup):
    text = soup.get_text(" ", strip=True)
    prices = []
    for m in PRICE_RE.finditer(text):
        try: prices.append(float(m.group(1)))
        except Exception: pass
    return prices

def normalize_whitespace(s):
    return re.sub(r"\s+", " ", s).strip().lower()

def tokens(s):
    s = s.lower()
    s = re.sub(r"[^a-z0-9+ ]", " ", s)  # keep alnum, +, space
    return [t for t in re.split(r"\s+", s) if t]

def name_key(raw: str) -> str:
    """Make a robust key like: 'iphone 13', 'galaxy s22', 'z fold5', etc."""
    raw = normalize_whitespace(raw)
    toks = tokens(raw)

    # Keep model series tokens and numbers, drop filler brands/marketing
    keep = []
    for t in toks:
        if t in STOPWORDS:
            continue
        # model numbers or series words are useful
        if t.isdigit() or re.match(r"^\d+[a-z]*$", t):
            keep.append(t); continue
        if t in QUALIFIERS:
            keep.append(t); continue
        if t in {"iphone","galaxy","pixel","ipad","z","fold","flip","s","note"}:
            keep.append(t); continue
        # short tokens like 's24','s25' etc.
        if re.match(r"^[a-z]\d{2}$", t):
            keep.append(t); continue
        # pixel 8/7, etc. also allow 'se','fe'
        if t in {"se","fe"}:
            keep.append(t); continue

    # Post-process: join and compress multi-spaces
    key = " ".join(keep)
    key = re.sub(r"\s+", " ", key).strip()
    return key

def infer_device_name(soup, url):
    for getter in (
        lambda: soup.find("h1").get_text(" ", strip=True) if soup.find("h1") else None,
        lambda: soup.find("title").get_text(" ", strip=True) if soup.find("title") else None,
        lambda: soup.find("meta", attrs={"property":"og:title"})["content"] if soup.find("meta", attrs={"property":"og:title"}) else None,
    ):
        try:
            v = getter()
            if v: return v
        except Exception:
            pass
    path = urlparse(url).path.rstrip("/").split("/")[-1]
    return path.replace("-", " ")

def polite_sleep(sec):
    if sec and sec > 0: time.sleep(sec)

def crawl_and_collect(cfg, limit=None):
    # expand sitemaps (including nested)
    queue = list(cfg["sitemaps"])
    seen = set()
    page_urls = []
    while queue:
        sm = queue.pop(0)
        if sm in seen: continue
        seen.add(sm)
        try:
            r = fetch(sm, timeout=cfg.get("http_timeout", 25))
            locs = parse_sitemap_xml(r.content)
            for u in locs:
                if u.endswith(".xml"):
                    queue.append(u)
                else:
                    page_urls.append(u)
        except Exception as e:
            print(f"[warn] sitemap fail {sm}: {e}")

    urls = filter_urls(
        page_urls,
        [re.compile(p) for p in cfg["allow_patterns"]],
        [re.compile(p) for p in cfg["disallow_patterns"]],
    )

    max_prices = {}
    crawled = 0
    for url in urls:
        if limit and crawled >= limit: break
        try:
            r = fetch(url, timeout=cfg.get("http_timeout", 25))
            soup = BeautifulSoup(r.text, "html.parser")
            dev_name = infer_device_name(soup, url)
            key = name_key(dev_name)
            prices = extract_jsonld_offers(soup) or extract_prices_text(soup)
            if prices and key:
                high = max(prices)
                prev = max_prices.get(key)
                if prev is None or high > prev:
                    max_prices[key] = high
                print(f"[ok] {key} -> highest {high} from {url}")
            else:
                print(f"[skip] no price or key: {url}")
            crawled += 1
            polite_sleep(cfg.get("rate_limit_seconds", 1.0))
        except Exception as e:
            print(f"[warn] fetch fail {url}: {e}")
            polite_sleep(cfg.get("rate_limit_seconds", 1.0))
    return max_prices

def update_xml_prices(xml_in, xml_out, max_prices, cfg):
    parser = etree.XMLParser(remove_blank_text=False)
    tree = etree.parse(xml_in, parser)
    root = tree.getroot()

    items = root.xpath(cfg["xml_item_xpath"])
    inc = float(cfg.get("price_increment", 5.0))
    round_to = cfg.get("round_to")
    updated = 0; skipped = 0

    for item in items:
        name_nodes = item.xpath(cfg["xml_name_xpath"])
        price_nodes = item.xpath(cfg["xml_price_xpath"])
        if not name_nodes or not price_nodes:
            skipped += 1
            continue

        name_text = " ".join([etree.tostring(n, method="text", encoding="unicode").strip() for n in name_nodes]).strip()
        key = name_key(name_text)

        if key not in max_prices:
            # helpful debug so you can see why something didn’t match
            print(f"[miss] No scraped price for item name '{name_text}' -> key '{key}'")
            skipped += 1
            continue

        new_price = max_prices[key] + inc
        if round_to: new_price = round(new_price / round_to) * round_to
        price_text = (f'{cfg.get("currency_prefix","")}{new_price:.2f}')
        price_nodes[0].text = price_text
        updated += 1

    tree.write(xml_out, encoding="utf-8", xml_declaration=True, pretty_print=True)
    return updated, skipped

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--xml-in", required=True)
    ap.add_argument("--xml-out", required=True)
    ap.add_argument("--max-pages", type=int, default=None)
    args = ap.parse_args()

    cfg = load_yaml(args.config)
    max_prices = crawl_and_collect(cfg, limit=args.max_pages)
    with open("max_prices.json", "w", encoding="utf-8") as f:
        json.dump(max_prices, f, indent=2, ensure_ascii=False)
    updated, skipped = update_xml_prices(args.xml_in, args.xml_out, max_prices, cfg)
    print(f"Updated {updated} items, skipped {skipped}. Wrote: {args.xml_out}")

if __name__ == "__main__":
    main()
