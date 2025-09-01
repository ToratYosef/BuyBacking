# =========================================================================
# Makefile to generate static HTML pages for Google Pixel models.
# This script uses a template to create individual pages for each device.
#
# USAGE:
#   make pixels    - Generates all Google Pixel pages from the template.
#   make all       - Generates all pages (including pixels).
#   make clean     - Removes all generated pages and directories.
# =========================================================================

# Define the Google Pixel models (slugs) from Pixel 7 Pro to the newest models
PIXELS = \
    7-pro \
    8 \
    8a \
    9 \
    9-pro \
    9-pro-xl \
    10 \
    10-pro \
    10-pro-xl \
    10-pro-fold

# Define output directories and template files
PIXEL_DIR = google/models
PIXEL_TEMPLATE = google-template.html

.PHONY: pixels all clean

pixels:
	@mkdir -p $(PIXEL_DIR)
	@for slug in $(PIXELS); do \
		echo "Generating page for $$slug.html..."; \
		sed "s|__DEVICE_SLUG__|$$slug|g" $(PIXEL_TEMPLATE) > $(PIXEL_DIR)/$$slug.html; \
	done

all: pixels

clean:
	@echo "Cleaning up generated HTML files..."
	rm -rf $(PIXEL_DIR)
