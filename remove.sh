#!/bin/bash

# This script searches for and removes Google Maps API code from web project files.
# It targets the script loading tag and the JavaScript functions that use the API.

# --- Configuration ---
# List of file extensions to search within. Add more if needed (e.g., "vue", "svelte").
FILE_EXTENSIONS="html js jsx tsx"
# Directories to search in.
SEARCH_DIRS=("ipad/models" "google/models" "samsung/models" "iphone/models")

echo "🔍 Starting search for Google Maps API code..."
echo "------------------------------------------------"

# Convert file extensions to a find-friendly format
FIND_NAMES=""
for ext in $FILE_EXTENSIONS; do
  FIND_NAMES+="-o -name \"*.$ext\" "
done
# Remove the initial "-o "
FIND_NAMES=${FIND_NAMES:3}

# Check the operating system to determine the correct sed syntax
if [[ "$(uname)" == "Darwin" ]]; then
    # Mac OS requires a backup extension with -i
    sed_i_arg="-i ''"
else
    # Linux and most other systems do not
    sed_i_arg="-i"
fi

# Find all relevant files in the specified directories
find "${SEARCH_DIRS[@]}" \( $FIND_NAMES \) -type f | while read -r file; do
  echo "📄 Checking file: $file"

  # Use grep to check if the file contains any Google Maps related patterns
  if grep -q -E 'maps\.googleapis\.com|google\.maps|initAutocomplete' "$file"; then
    echo "  🚨 Found Google Maps code. Removing it now..."

    # Create a backup of the original file with a .bak extension
    # Check if a backup can be created before proceeding
    if cp "$file" "$file.bak" 2>/dev/null; then
        # Use sed to remove the Google Maps related code.
        # 1. Remove script tags loading the Google Maps API.
        # 2. Remove the entire <script> block containing the initAutocomplete and fillInAddress functions.
        # Use the correct sed syntax based on the OS
        sed $sed_i_arg \
          -e '/maps\.googleapis\.com/d' \
          -e '/function initAutocomplete/,/<\/script>/d' \
          "$file"

        echo "  ✅ Cleaned and created backup: $file.bak"
    else
        echo "  ⚠️ Could not create backup or modify file due to permissions."
    fi
  else
    echo "  👍 No Google Maps code found."
  fi
done

echo "------------------------------------------------"
echo "🎉 Cleanup complete!"
echo "Please review the changes in your files."
echo "Original files have been saved with a .bak extension if changes were made."
echo "If you are satisfied, you can delete the .bak files with: find . -name '*.bak' -delete"