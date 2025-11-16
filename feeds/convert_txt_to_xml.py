import re
from collections import OrderedDict

CONDITION_ORDER = ["flawless", "good", "fair", "broken"]

def normalize_condition(cond: str) -> str:
    c = cond.strip().lower()
    if c == "damaged":
        return "broken"
    return c

def infer_brand(name: str) -> str:
    low = name.lower()
    if "iphone" in low:
        return "iphone"
    # very dumb samsung detection, fine for your list
    if low.startswith(("s", "z ")):
        return "samsung"
    return "other"

def slugify_model(name: str, brand: str) -> str:
    """
    Make a simple slug / modelID from the model name.
    For IPHONE 12 PRO -> '12-pro'
    For IPHONE 14 PRO MAX -> '14-pro-max'
    For S23 ULTRA -> 's23-ultra'
    For iPhone 16 SE -> '16-se'
    """
    n = name.strip()

    # strip leading brand word if it's in the name
    if brand == "iphone":
        if n.upper().startswith("IPHONE "):
            n = n[7:]
        elif n.lower().startswith("iphone "):
            n = n[7:]
    elif brand == "samsung":
        # your Samsung models don't say 'Samsung', so leave as-is
        pass

    # collapse spaces, replace with '-'
    slug = re.sub(r"\s+", "-", n.strip().lower())
    return slug

def escape_xml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
    )

def sort_storage_key(storage: str):
    """
    Sort 64GB, 128GB, 256GB, 512GB, 1TB, etc.
    Treat TB as bigger than GB.
    """
    s = storage.strip().upper()
    m = re.match(r"(\d+)\s*(GB|TB)", s)
    if not m:
        return (9999, s)
    num = int(m.group(1))
    unit = m.group(2)
    if unit == "TB":
        num = num * 1024
    return (num, s)

def parse_input_file(path: str):
    """
    Returns:
    models = OrderedDict{
        model_name: {
            "storages": OrderedDict{
                storage: {
                    "locked":  {cond: price_str, ...},
                    "unlocked":{cond: price_str, ...}
                }
            }
        }
    }
    """
    models = OrderedDict()

    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line:
                continue

            # Prefer tab-split. If no tabs, fall back to multiple spaces.
            if "\t" in line:
                parts = line.split("\t")
            else:
                parts = re.split(r"\s{2,}", line)

            if len(parts) != 5:
                # try a bit harder but then skip silently if broken
                # (you can print a warning if you want)
                # print("Skipping line (unexpected format):", line)
                continue

            name, storage, lock_status, condition, price_str = [p.strip() for p in parts]

            lock_key = lock_status.lower()  # locked / unlocked
            cond_key = normalize_condition(condition)

            # strip leading '$' and commas
            price_clean = price_str.replace("$", "").replace(",", "").strip()
            # normalize to 2 decimals if numeric
            try:
                price_val = f"{float(price_clean):.2f}"
            except ValueError:
                price_val = price_clean  # leave raw if weird

            if name not in models:
                models[name] = {
                    "storages": OrderedDict()
                }

            storages = models[name]["storages"]
            if storage not in storages:
                storages[storage] = {
                    "locked": {},
                    "unlocked": {}
                }

            storages[storage].setdefault(lock_key, {})
            storages[storage][lock_key][cond_key] = price_val

    return models

def generate_xml(models: OrderedDict) -> str:
    lines = []
    lines.append("<models>")

    for model_name, data in models.items():
        brand = infer_brand(model_name)
        parent_device = brand
        model_id = slugify_model(model_name, brand)
        slug = model_id  # you can change if you want
        # simple image URL; tweak to match your real pattern
        image_url = f"https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/{brand}/assets/{slug}"
        # deeplink device param: brand-model_id, like iphone-12-pro
        deeplink_device = f"{brand}-{model_id}" if brand != "other" else model_id

        lines.append("  <model>")
        lines.append(f"    <parentDevice>{escape_xml(parent_device)}</parentDevice>")
        lines.append(f"    <modelID>{escape_xml(model_id)}</modelID>")

        storages_items = list(data["storages"].items())
        # reorder by numeric capacity
        storages_items.sort(key=lambda kv: sort_storage_key(kv[0]))

        for storage, locks in storages_items:
            lines.append(f"    <prices>")
            lines.append(f"      <storageSize>{escape_xml(storage)}</storageSize>")
            lines.append(f"      <priceValue>")

            # LOCKED
            locked = locks.get("locked", {})
            lines.append(f"        <locked>")
            for cond in CONDITION_ORDER:
                if cond in locked:
                    lines.append(f"          <{cond}>{locked[cond]}</{cond}>")
            lines.append(f"        </locked>")

            # UNLOCKED
            unlocked = locks.get("unlocked", {})
            lines.append(f"        <unlocked>")
            for cond in CONDITION_ORDER:
                if cond in unlocked:
                    lines.append(f"          <{cond}>{unlocked[cond]}</{cond}>")
            lines.append(f"        </unlocked>")

            lines.append(f"      </priceValue>")
            lines.append(f"    </prices>")

        lines.append(f"    <slug>{escape_xml(slug)}</slug>")
        lines.append(f"    <imageUrl>{escape_xml(image_url)}</imageUrl>")
        lines.append(f"    <name>{escape_xml(model_name)}</name>")
        lines.append(f"    <brand>{escape_xml(brand)}</brand>")
        lines.append(
            f"    <deeplink>https://secondhandcell.com/sell/?device={escape_xml(deeplink_device)}&amp;storage={{storage}}&amp;carrier={{carrier}}&amp;power={{power}}&amp;functionality={{functionality}}&amp;quality={{quality}}</deeplink>"
        )
        lines.append("  </model>")

    lines.append("</models>")
    return "\n".join(lines)

def main():
    models = parse_input_file("prices.txt")
    xml_out = generate_xml(models)
    print(xml_out)

if __name__ == "__main__":
    main()
