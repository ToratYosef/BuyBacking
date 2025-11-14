import sys, csv

QUALITY_ORDER = ["flawless", "good", "fair", "broken"]
QUALITY_LABEL = {
    "flawless": "flawless",
    "good": "good",
    "fair": "fair",
    "broken": "damaged",
}

raw = sys.stdin.read().strip().splitlines()
rows = []

# Parse rows
for line in raw:
    line=line.strip()
    if not line or line.startswith("Brand"):
        continue

    cols=line.split('\t')
    if len(cols) < 8:
        continue

    brand, model, model_id, storage, status, quality = cols[:6]
    feed = cols[7]

    rows.append({
        "model": model,
        "storage": storage,
        "status": status,
        "quality": quality.lower(),
        "feed": feed
    })

# Group rows by (model, storage)
from collections import defaultdict
groups = defaultdict(list)

for r in rows:
    groups[(r["model"], r["storage"])].append(r)

# Build sorted output with correct internal order
output = []

for (model, storage), items in sorted(groups.items()):
    # First locked then unlocked
    for status in ["locked", "unlocked"]:
        for q in QUALITY_ORDER:
            for r in items:
                if r["status"] == status and r["quality"] == q:
                    output.append([
                        model,
                        storage,
                        status,
                        QUALITY_LABEL[q],
                        r["feed"]
                    ])

# Output CSV
writer = csv.writer(sys.stdout)
writer.writerow(["Model","Storage","Status","Quality","Feed"])
writer.writerows(output)
