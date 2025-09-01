# =========================================================================
# Makefile to generate static HTML pages for iPad models.
# This script uses templates to create individual pages for each device.
#
# USAGE:
#   make ipads     - Generates all iPad pages from the iPad template.
#   make all       - Generates all pages.
#   make clean     - Removes all generated pages and directories.
# =========================================================================

# Define the iPad models (slugs)
IPADS = \
    ipad-pro-m4-13-inch \
    ipad-pro-m4-11-inch \
    ipad-air-m3-13-inch \
    ipad-air-m3-11-inch \
    ipad-11th-gen \
    ipad-10th-gen \
    ipad-9th-gen \
    ipad-mini-7th-gen \
    ipad-mini-6th-gen

# Define output directories and template files
IPAD_DIR = ipad/models
IPAD_TEMPLATE = ipad-template.html

.PHONY: ipads all clean

ipads:
	@mkdir -p $(IPAD_DIR)
	@for slug in $(IPADS); do \
		echo "Generating page for $$slug.html..."; \
		sed "s|__DEVICE_SLUG__|$$slug|g" $(IPAD_TEMPLATE) > $(IPAD_DIR)/$$slug.html; \
	done

all: ipads

clean:
	@echo "Cleaning up generated HTML files..."
	rm -rf $(IPAD_DIR)
