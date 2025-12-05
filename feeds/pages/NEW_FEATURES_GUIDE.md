# New Features Guide - Bot.html Repricer Tool

## Overview
The repricer tool has been enhanced with powerful new features to automatically detect missing storage variants and manage new models efficiently.

## New Features

### 1. **Automatic New Storage Variant Detection**
The tool now automatically detects when a model exists in your CSV but is missing certain storage variants that are present in the SellCell feed XML.

**Example:**
- Your CSV has: iPhone 15, 128GB, 256GB
- SellCell Feed has: iPhone 15, 128GB, 256GB, 512GB, 1TB
- **Result:** The tool automatically creates placeholder rows for 512GB and 1TB variants

### 2. **"Show New Variants Only" Button**
After processing, if new variants are detected:
- Click **"Show New Variants Only"** to filter the table to only display new storage variants
- New variants are highlighted with a blue background for easy identification
- Click **"Show All"** to return to viewing all rows

### 3. **AMZ Price Input for New Variants**
New variant rows include an **"AMZ Price Input"** column:
- Enter the Amazon price for each new variant
- The tool automatically recalculates all pricing metrics in real-time:
  - Walkaway price
  - Profit margin
  - New buy price
  - Profit percentage

**How it works:**
1. Filter to show new variants only
2. Enter AMZ prices for each new variant
3. Watch the calculations update automatically
4. Export when ready

### 4. **Export to CSV (Original Format)**
New button: **"Export to CSV (Original Format)"**

This exports a CSV file matching the exact format you provided:
```
name,storage,lock_status,condition,price,amz
```

**Key features:**
- Uses the **new calculated prices** in the "price" column
- Includes all new storage variants automatically
- File naming: `Devices Final-carriers-YYYY-MM-DD.csv`
- Ready to upload back to your pricing system

### 5. **Enhanced XML Export**
The XML export now includes:
- All new storage variants with calculated prices
- Properly formatted for all carriers (AT&T, Verizon, T-Mobile, Unlocked)
- All conditions (flawless, good, fair, damaged)

## Workflow Example

### Step-by-Step Usage:

1. **Upload Your CSV**
   - Contains existing models and storage variants
   - Example: iPhone 15 with 128GB, 256GB only

2. **Upload SellCell Feed XML**
   - Contains all available storage variants
   - Example: iPhone 15 with 128GB, 256GB, 512GB, 1TB

3. **Click "Use CSV + XML"**
   - Tool processes existing rows
   - **Automatically detects** that 512GB and 1TB are missing
   - Creates new variant rows for all carriers and conditions
   - Status shows: "Done – processed 1633 rows (256 new variants found)"

4. **Click "Show New Variants Only"**
   - Table filters to show only the 256 new rows
   - New variants highlighted in blue

5. **Enter AMZ Prices**
   - For each new variant, enter the Amazon price
   - Calculations update immediately
   - Watch profit margins adjust in real-time

6. **Export Options:**
   - **"Export to CSV (Original Format)"** - Get a CSV ready to upload
   - **"Download XML"** - Get updated device-prices.xml with new variants
   - **"Download CSV"** - Full detailed export with all calculation columns

## What Gets Auto-Added?

For each detected new storage variant, the tool creates rows for:
- **4 Carriers:** AT&T, Verizon, T-Mobile, Unlocked
- **4 Conditions:** Flawless, Good, Fair, Damaged
- **Total:** 16 rows per new storage variant

## Visual Indicators

- **Blue highlight:** New variant rows
- **AMZ Price Input:** Only appears for new variants
- **Status messages:** Show count of new variants found

## Benefits

1. **Time Savings:** No manual creation of new variant rows
2. **Consistency:** All carriers and conditions created automatically
3. **Accuracy:** Real-time calculation as you enter AMZ prices
4. **Flexibility:** Filter to focus only on new variants
5. **Export Ready:** CSV matches your exact format for easy upload

## Tips

- Always upload the latest SellCell feed XML to catch all new variants
- Use "Show New Variants Only" to focus on pricing new items
- Enter AMZ prices for new variants before exporting
- The exported CSV includes both existing and new variants with updated prices

## Technical Details

- New variants are marked with `_isNewVariant: true` flag
- AMZ price inputs trigger immediate recalculation
- Filter state preserved during AMZ price updates
- All standard repricer logic applies to new variants
