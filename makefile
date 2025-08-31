# =========================================================================
# Makefile to generate static HTML pages for Samsung models from a template.
# This script creates a directory structure and an HTML file for each model.
#
# USAGE:
#   make samsungs    - Generates or updates all Samsung pages from the template.
#   make clean       - Removes all generated Samsung pages and directories.
# =========================================================================

# Define the Samsung models (slugs)
SAMSUNG_PHONES := galaxy-s24-ultra galaxy-s24-plus galaxy-s24 galaxy-s23-ultra galaxy-s23-plus galaxy-s23 galaxy-s23-fe galaxy-z-fold-5 galaxy-z-flip-5 galaxy-z-fold-4 galaxy-z-flip-4 galaxy-s22-ultra galaxy-s22-plus galaxy-s22 galaxy-s21-ultra galaxy-s21-plus galaxy-s21 galaxy-s21-fe galaxy-a54 galaxy-a34

# Define the output directory and template file
OUTPUT_DIR := samsung/models
TEMPLATE_FILE := samsung-template.html

# Define a variable for the command to create the directory
MKDIR_CMD := mkdir -p $(OUTPUT_DIR)

# Define the command to generate each page from the template
# This sed command replaces the "__DEVICE_SLUG__" placeholder with the actual slug
GENERATE_CMD = sed 's/__DEVICE_SLUG__/$(1)/g' "$(TEMPLATE_FILE)" > "$(OUTPUT_DIR)/$(1).html"

# Main target to generate all Samsung pages
.PHONY: samsungs
samsungs: $(SAMSUNG_PHONES)

# This pattern rule tells make how to build each individual phone page.
# It depends on the template file.
$(SAMSUNG_PHONES):
	@echo "Generating page for $@.html..."
	@$(MKDIR_CMD)
	@$(call GENERATE_CMD,$@)

# Clean up generated files and directories
.PHONY: clean
clean:
	@echo "Cleaning up generated Samsung files..."
	rm -rf $(OUTPUT_DIR)
