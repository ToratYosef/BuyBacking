# SellCell Scraper → XML Price Updater

This bot crawls allowed SellCell pages listed in sitemaps, extracts the **highest offer per device**, and updates your XML by setting each item's `<price>` to **(highest + 5)**.

## Files
- `sellcell_scraper.py` — main script
- `config.yaml` — tweak URL filters, crawl throttle, and XML mapping
- `max_prices.json` — generated after a run for inspection

## Install
```bash
pip install requests pyyaml lxml beautifulsoup4
```

## Prepare
1. Put your input feed at `/path/to/input.xml`.
2. Edit `config.yaml`:
   - `xml_item_xpath`: selects each product node (e.g., `//product`, `//item`)
   - `xml_name_xpath`: XPath to the name/title (relative to the item)
   - `xml_price_xpath`: XPath to the price node (relative to the item)

> Matching is done by **normalized lowercase name**. Make your XML `<title>` (or chosen name node) match how the SellCell page titles read.

## Run
```bash
python sellcell_scraper.py --config config.yaml --xml-in /path/to/input.xml --xml-out /path/to/output.xml --max-pages 300
```

- Use `--max-pages` during testing to limit crawl size.
- After running, inspect `max_prices.json` to see what device keys were detected.

## How it finds prices
1. Looks for JSON-LD `Offer` / `AggregateOffer` in `<script type="application/ld+json">`
2. Falls back to scanning page text for dollar amounts
3. Chooses the **max** value seen on a page
4. Keeps the **max per device name** across all pages

## Safety & Respect
- Filters out URLs disallowed by robots.txt patterns you listed.
- Uses a modest `rate_limit_seconds` (configurable). Increase if you crawl large volumes.

## Customizing Matching
If your XML device names don't perfectly match page titles:
- Preprocess names in your feed (e.g., "Apple iPhone 13" → "iphone 13")
- Or extend `normalize_name` in the script to strip brand names, storage suffixes, etc.

## Troubleshooting
- "No price found": This page may not show Offer markup and might hide prices behind client-side JS; try increasing `allow_patterns` specificity or add a DOM selector approach.
- If prices include multiple currencies, add a filter before accepting numbers (e.g., only `$`-prefixed). The script already favors `$` but will parse plain numbers.
