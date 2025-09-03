# =========================================================================
# Makefile to generate static HTML pages for iPhone, Samsung, Pixel, and iPad models.
# This script uses templates to create individual pages for each device.
#
# USAGE:
#   make iphones     - Generates all iPhone pages from the iPhone template.
#   make samsungs    - Generates all Samsung pages from the Samsung template.
#   make pixels      - Generates all Pixel pages from the Pixel template.
#   make ipads       - Generates all iPad pages from the iPad template.
#   make all         - Generates all pages for all brands.
#   make clean       - Removes all generated pages and directories.
# =========================================================================

# Define the iPhone models (slugs)
IPHONES = \
    16-pro-max \
    16-pro \
    16 \
    16-plus \
    16-se \
    15-pro-max \
    15-pro \
    15 \
    15-plus \
    14-pro-max \
    14-pro \
    14 \
    14-plus \
    13-pro-max \
    13-pro \
    13 \
    13-mini \
    12-pro-max \
    12-pro \
    12 \
    12-mini \
    11-pro-max \
    11-pro \
    11 \
    se-3rd-gen \
    se-2nd-gen

# Define the Samsung models (slugs)
SAMSUNGS = \
    galaxy-s25 \
    galaxy-s25-plus \
    galaxy-s25-ultra \
    galaxy-s25-fe \
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

# Define the Pixel models (slugs)
PIXELS = \
    pixel-7-pro \
    pixel-8 \
    pixel-8a \
    pixel-9-pro-xl \
    pixel-9-pro \
    pixel-9 \
    pixel-10-pro-fold \
    pixel-10-pro-xl \
    pixel-10-pro \
    pixel-10

# Define the iPad models (slugs)
IPADS = \
    ipad-pro-m4-11-inch \
    ipad-pro-m4-13-inch \
    ipad-air-m3-11-inch \
    ipad-air-m3-13-inch \
    ipad-11th-gen \
    ipad-10th-gen \
    ipad-9th-gen \
    ipad-mini-7th-gen \
    ipad-mini-6th-gen

# Define output directories and template files
IPHONE_DIR = iphone/models
SAMSUNG_DIR = samsung/models
PIXELS_DIR = google/models
IPAD_DIR = ipad/models
IPHONE_TEMPLATE = iphone-template.html
SAMSUNG_TEMPLATE = samsung-template.html
PIXELS_TEMPLATE = google-template.html
IPAD_TEMPLATE = ipad-template.html

.PHONY: iphones samsungs pixels ipads all clean

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

pixels:
	@mkdir -p $(PIXELS_DIR)
	@for slug in $(PIXELS); do \
		echo "Generating page for $$slug.html..."; \
		sed "s|__DEVICE_SLUG__|$$slug|g" $(PIXELS_TEMPLATE) > $(PIXELS_DIR)/$$slug.html; \
	done

ipads:
	@mkdir -p $(IPAD_DIR)
	@for slug in $(IPADS); do \
		echo "Generating page for $$slug.html..."; \
		sed "s|__DEVICE_SLUG__|$$slug|g" $(IPAD_TEMPLATE) > $(IPAD_DIR)/$$slug.html; \
	done

all: iphones samsungs pixels ipads

clean:
	@echo "Cleaning up generated HTML files..."
	rm -rf $(IPHONE_DIR)
	rm -rf $(SAMSUNG_DIR)
	rm -rf $(PIXELS_DIR)
	rm -rf $(IPAD_DIR)
