# =========================================================================
# Makefile to generate static HTML pages for iPhone and Samsung models.
# This script uses templates to create individual pages for each device.
#
# USAGE:
#   make iphones     - Generates all iPhone pages from the iPhone template.
#   make samsungs    - Generates all Samsung pages from the Samsung template.
#   make all         - Generates all pages for both brands.
#   make clean       - Removes all generated pages and directories.
# =========================================================================

# Define the iPhone models (slugs)
IPHONES = \
    iphone-16-pro-max \
    iphone-16-pro \
    iphone-16 \
    iphone-16-plus \
    iphone-16-se \
    iphone-15-pro-max \
    iphone-15-pro \
    iphone-15 \
    iphone-15-plus \
    iphone-14-pro-max \
    iphone-14-pro \
    iphone-14 \
    iphone-14-plus \
    iphone-13-pro-max \
    iphone-13-pro \
    iphone-13 \
    iphone-13-mini \
    iphone-12-pro-max \
    iphone-12-pro \
    iphone-12 \
    iphone-12-mini \
    iphone-11-pro-max \
    iphone-11-pro \
    iphone-11 \
    iphone-se-3rd-gen \
    iphone-se-2nd-gen

# Define the Samsung models (slugs)
SAMSUNGS = \
    galaxy-s24-ultra \
    galaxy-s24-plus \
    galaxy-s24 \
    galaxy-s23-ultra \
    galaxy-s23-plus \
    galaxy-s23 \
    galaxy-s23-fe \
    galaxy-z-fold-5 \
    galaxy-z-flip-5 \
    galaxy-z-fold-4 \
    galaxy-z-flip-4 \
    galaxy-s22-ultra \
    galaxy-s22-plus \
    galaxy-s22 \
    galaxy-s21-ultra \
    galaxy-s21-plus \
    galaxy-s21 \
    galaxy-s21-fe \
    galaxy-a54 \
    galaxy-a34

# Define output directories and template files
IPHONE_DIR = iphone/models
SAMSUNG_DIR = samsung/models
IPHONE_TEMPLATE = iphone-template.html
SAMSUNG_TEMPLATE = samsung-template.html

.PHONY: iphones samsungs all clean

iphones:
	@mkdir -p $(IPHONE_DIR)
	@for slug in $(IPHONES); do \
		echo "Generating page for $$slug.html..."; \
		sed "s|__DEVICE_SLUG__|$$slug|g" $(IPHONE_TEMPLATE) > $(IPHONE_DIR)/$$slug.html; \
	done

samsungs:
	@mkdir -p $(SAMSUNG_DIR)
	@for slug in $(SAMSUNGS); do \
		echo "Generating page for $$slug.html..."; \
		sed "s|__DEVICE_SLUG__|$$slug|g" $(SAMSUNG_TEMPLATE) > $(SAMSUNG_DIR)/$$slug.html; \
	done

all: iphones samsungs

clean:
	@echo "Cleaning up generated HTML files..."
	rm -rf $(IPHONE_DIR)
	rm -rf $(SAMSUNG_DIR)
