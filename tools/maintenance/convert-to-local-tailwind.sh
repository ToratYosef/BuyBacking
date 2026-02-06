#!/bin/bash

ROOT="/workspaces/BuyBacking"
TAILWIND_PATH="/assets/css/tailwind.css"   # What gets inserted into <head>
BACKUP_SUFFIX=".bak_tailwind"

echo "Converting all HTML files to local Tailwind (excluding node_modules and .git)..."

find "$ROOT" -type f -name "*.html" \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" | while read -r file; do

    echo "Processing: $file"

    # Backup file
    cp "$file" "$file$BACKUP_SUFFIX"

    # Remove CDN tailwind script + inline config (if present)
    sed -i \
        -e 's|<script src="https://cdn.tailwindcss.com"></script>||g' \
        -e 's|<script>tailwind.config =[^<]*</script>||g' \
        "$file"

    # Insert local tailwind.css right after <head>
    sed -i \
        '0,/<head>/s|<head>|<head>\n    <link rel="stylesheet" href="'"$TAILWIND_PATH"'">|' \
        "$file"

done

echo ""
echo "DONE! All HTML files converted (node_modules and .git excluded)."
echo "Backups made with suffix: $BACKUP_SUFFIX"
