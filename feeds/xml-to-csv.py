import xml.etree.ElementTree as ET
import csv

INPUT_XML = "55.xml"      # change to your actual filename
OUTPUT_CSV = "prices_coinvgferthyedjki.csv"

# Order we want
STATUS_ORDER = ["locked", "unlocked"]
QUALITY_ORDER = ["flawless", "good", "fair", "broken"]  # "broken" -> "damaged" label in CSV

tree = ET.parse(INPUT_XML)
root = tree.getroot()

with open(OUTPUT_CSV, "w", newline="") as f:
    writer = csv.writer(f)
    # Header (no brand, no modelID)
    writer.writerow(["Model", "Storage", "Status", "Quality", "Price"])

    # Loop through each <model>
    for model in root.findall("model"):
        model_name = (model.findtext("name") or "").strip()

        # Each <prices> block = one storage size
        for prices in model.findall("prices"):
            storage = (prices.findtext("storageSize") or "").strip()

            price_value = prices.find("priceValue")
            if price_value is None:
                continue

            # locked first, then unlocked
            for status in STATUS_ORDER:
                status_block = price_value.find(status)
                if status_block is None:
                    continue

                # qualities inside each status
                for qtag in QUALITY_ORDER:
                    q_elem = status_block.find(qtag)
                    if q_elem is None or q_elem.text is None:
                        continue

                    price_str = q_elem.text.strip()
                    # Map XML "broken" → "damaged" in the sheet
                    quality_label = "damaged" if qtag == "broken" else qtag

                    writer.writerow([
                        model_name,   # Model
                        storage,      # Storage
                        status,       # Status (locked/unlocked)
                        quality_label,# Quality
                        price_str     # Price
                    ])

print(f"Done! Wrote spreadsheet data to {OUTPUT_CSV}")
