#!/bin/bash

ROOT="/workspaces/BuyBacking"
OUTPUT="/workspaces/BuyBacking/all-heads.txt"

# Clear output file if exists
> "$OUTPUT"

find "$ROOT" -type f -name "*.html" | while read -r file; do
  {
    echo ""
    echo "==============================="
    echo "$file"
    echo "-------------------------------"
    sed -n '/<head>/,/<\/head>/p' "$file"
    echo "==============================="
    echo ""
  } >> "$OUTPUT"
done

echo "Done! Output saved to: $OUTPUT"
