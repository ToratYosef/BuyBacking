// export.cjs

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// =================================================================
// 🚨 IMPORTANT: CONFIGURE YOUR FILE PATHS HERE
// =================================================================
// 1. Update this path to your service account key file
const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json'; 

// 2. Define the output file name
const OUTPUT_FILE = 'all_device_models_export.json';
// =================================================================

// Check if the service account file exists before initializing
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`\n❌ Error: Service account key file not found at ${SERVICE_ACCOUNT_PATH}`);
    console.error('Please update the SERVICE_ACCOUNT_PATH variable.');
    return;
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const COLLECTION_GROUP_ID = 'models';

/**
 * Executes a Collection Group query to retrieve all documents from 
 * every subcollection named 'models' and preprocesses the data for XML/CSV.
 */
async function exportCollectionGroup() {
  console.log(`\nStarting export from Collection Group: /${COLLECTION_GROUP_ID}/...`);
  
  try {
    const snapshot = await db.collectionGroup(COLLECTION_GROUP_ID).get();
    const data = [];

    snapshot.forEach(doc => {
      const fullPath = doc.ref.path;
      const pathParts = fullPath.split('/');
      const parentDevice = pathParts[1];
      const docData = doc.data();
      
      // -----------------------------------------------------------
      // 💥 CRITICAL FIX: FLATTENING PRICES FOR XML COMPATIBILITY
      // -----------------------------------------------------------
      let pricesArray = [];
      
      // Check if prices field exists and is an object
      if (docData.prices && typeof docData.prices === 'object') {
        
        // Iterate over the nested object (e.g., {"64GB": 500, "128GB": 600})
        for (const storageKey in docData.prices) {
          
          // Transform each invalid key:value pair into a valid array item
          // { storageSize: "64GB", priceValue: 500 }
          pricesArray.push({
            storageSize: storageKey,
            priceValue: docData.prices[storageKey]
          });
        }
        
        // Remove the original nested 'prices' object to prevent XML error
        delete docData.prices;
      }
      // -----------------------------------------------------------

      data.push({
        // Standard fields (parentDevice and modelID)
        parentDevice: parentDevice,
        modelID: doc.id,
        
        // Add the newly flattened prices array
        prices: pricesArray, 
        
        // Spread operator includes all other fields from the document
        ...docData 
      });
    });

    // Write the resulting array of objects to a JSON file
    const jsonOutput = JSON.stringify(data, null, 2);
    fs.writeFileSync(OUTPUT_FILE, jsonOutput);
    
    console.log(`\n✅ Success: Exported ${data.length} documents.`);
    console.log(`💾 Data saved to: ${OUTPUT_FILE}`);
    console.log('\nNext Step: Run your JSON-to-XML conversion script.');
    
  } catch (error) {
    console.error('\n❌ Export failed with an error:', error.message);
    if (error.message.includes('requires an index')) {
         console.error('\nAction required: Ensure the "models" Collection Group Index is deployed to Firestore.');
    }
  }
}

exportCollectionGroup();