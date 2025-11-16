import xml.etree.ElementTree as ET
import csv

TEMPLATE_XML = "output.xml"                    # your existing XML with full structure
CSV_INPUT    = "feed.csv"  # the CSV you pasted
OUTPUT_XML   = "output_updated.xml"            # new XML with updated prices

# Map CSV qualities -> XML tags
# CSV has: flawless, good, fair, damaged
# XML uses "broken" instead of "damaged"
QUALITY_MAP = {
    "flawless": "flawless",
    "good": "good",
    "fair": "fair",
    "damaged": "broken",
}

STATUS_ALLOWED = {"locked", "unlocked"}


def norm_model_name(s: str) -> str:
    return (s or "").strip().upper()


def norm_storage(s: str) -> str:
    # normalize storage for matching: ignore case, trim spaces
    # "256GB" == "256gb" etc.
    return (s or "").strip().upper()


def clean_price(s: str) -> str:
    # remove "$" and commas etc.
    s = (s or "").strip()
    s = s.replace("$", "").replace(",", "")
    return s


# Load template XML
tree = ET.parse(TEMPLATE_XML)
root = tree.getroot()

# Index models by <name> text (e.g. "IPHONE 13 PRO MAX")
models_by_name = {}
for model in root.findall("model"):
    name_text = model.findtext("name")
    if name_text:
        models_by_name[norm_model_name(name_text)] = model

print(f"Indexed {len(models_by_name)} models from template XML")

# Apply CSV prices into the XML
with open(CSV_INPUT, newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        model_name_csv = norm_model_name(row.get("Model"))
        storage_raw = row.get("Storage") or ""
        storage = storage_raw.strip()
        storage_norm = norm_storage(storage)
        status = (row.get("Status") or "").strip().lower()
        quality_csv = (row.get("Quality") or "").strip().lower()
        price_raw = (row.get("Price") or "").strip()
        price = clean_price(price_raw)

        if not model_name_csv or not storage or not status or not quality_csv or not price:
            print(f"Skipping incomplete row: {row}")
            continue

        if status not in STATUS_ALLOWED:
            print(f"Skipping row with unknown status '{status}': {row}")
            continue

        xml_quality_tag = QUALITY_MAP.get(quality_csv)
        if not xml_quality_tag:
            print(f"Skipping row with unknown quality '{quality_csv}': {row}")
            continue

        model = models_by_name.get(model_name_csv)
        if model is None:
            print(f"WARNING: Model '{model_name_csv}' not found in XML, row={row}")
            continue

        # Find the correct <prices> block by <storageSize>, case-insensitive
        target_prices = None
        for prices_block in model.findall("prices"):
            storage_text = (prices_block.findtext("storageSize") or "").strip()
            if norm_storage(storage_text) == storage_norm:
                target_prices = prices_block
                break

        # If not found, create a new <prices> block for this storage
        if target_prices is None:
            print(
                f"Storage '{storage}' not found for model '{model_name_csv}', "
                f"creating new <prices> block. row={row}"
            )
            target_prices = ET.SubElement(model, "prices")
            storage_elem = ET.SubElement(target_prices, "storageSize")
            storage_elem.text = storage
            price_value = ET.SubElement(target_prices, "priceValue")
        else:
            price_value = target_prices.find("priceValue")
            if price_value is None:
                price_value = ET.SubElement(target_prices, "priceValue")

        status_elem = price_value.find(status)
        if status_elem is None:
            status_elem = ET.SubElement(price_value, status)

        quality_elem = status_elem.find(xml_quality_tag)
        if quality_elem is None:
            quality_elem = ET.SubElement(status_elem, xml_quality_tag)

        # Set the price text (numeric only)
        quality_elem.text = price

# Write updated XML
tree.write(OUTPUT_XML, encoding="UTF-8", xml_declaration=True)
print(f"Done! Wrote updated XML to {OUTPUT_XML}")
