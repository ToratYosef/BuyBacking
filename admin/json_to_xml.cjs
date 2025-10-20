// json_to_xml.cjs

const fs = require('fs');
const path = require('path');
const js2xmlparser = require('js2xmlparser');

// =================================================================
// 🚨 IMPORTANT: CONFIGURE YOUR FILE PATHS HERE
// =================================================================
const INPUT_FILE = 'all_device_models_export.json';
const OUTPUT_FILE = 'all_device_models_export.xml';
const XML_ROOT_TAG = 'device_models'; 
const XML_ITEM_TAG = 'model';       
// =================================================================

/**
 * Reads JSON data and converts it to XML format.
 */
function convertJsonToXml() {
    console.log(`\nStarting JSON to XML conversion...`);

    // 1. Read the JSON file
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`\n❌ Error: Input file not found at ${INPUT_FILE}`);
        console.error('Please ensure your export.cjs script ran successfully.');
        return;
    }

    const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
    const jsonData = JSON.parse(rawData);

    // 2. Prepare the data for XML (Wrap the array for a single root element)
    const xmlData = {
        [XML_ITEM_TAG]: jsonData
    };

    // 3. Convert to XML
    const xml = js2xmlparser.parse(XML_ROOT_TAG, xmlData, {
        declaration: { encoding: "UTF-8" },
        format: { pretty: true } // Makes the XML human-readable
    });

    // 4. Write the XML file
    fs.writeFileSync(OUTPUT_FILE, xml);

    console.log(`\n✅ Success: Conversion complete.`);
    console.log(`💾 XML data saved to: ${OUTPUT_FILE}`);
}

convertJsonToXml();