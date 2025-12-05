#!/bin/bash

ROOT="/workspaces/BuyBacking"
OUTPUT="/workspaces/BuyBacking/inline-tailwind-configs.txt"

> "$OUTPUT"

echo "Scanning backup HTML files for inline tailwind.config blocks..."

grep -RIn "tailwind.config" "$ROOT" \
  --include="*.html.bak_tailwind" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=tailwind >> "$OUTPUT"

echo "Done! Results saved to: $OUTPUT"
#!/bin/bash

ROOT="/workspaces/BuyBacking"
OUTPUT="/workspaces/BuyBacking/inline-tailwind-configs.txt"

> "$OUTPUT"

echo "Scanning for inline tailwind.config blocks..."

grep -RIn '<script>tailwind.config' "$ROOT" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=tailwind >> "$OUTPUT"

echo "Done! Results saved to: $OUTPUT"
