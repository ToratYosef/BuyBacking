#!/bin/bash

ROOT="/workspaces/BuyBacking"
BACKUP_SUFFIX=".bak_tailwind"

echo "Restoring all original HTML files from backups..."

find "$ROOT" -type f -name "*$BACKUP_SUFFIX" | while read -r backup; do
    original="${backup%$BACKUP_SUFFIX}"

    echo "Restoring: $original"

    # Move backup back to original file
    mv "$backup" "$original"
done

echo ""
echo "DONE! All HTML files have been restored to their original versions."
echo "Backups were removed (because they became the restored files)."
